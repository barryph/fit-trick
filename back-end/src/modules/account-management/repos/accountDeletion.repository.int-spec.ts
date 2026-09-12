import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from 'src/shared/knex/database.module';
import SessionRevocationRepo from 'src/modules/authentication/repos/session-revocation.repository';
import UsersRepo from 'src/modules/users/repos/user.repository';
import { getTestKnex } from '../../../../test/helpers/test-database';
import { insertUserWithKnex } from '../../../../test/factories/user.factory';
import { insertActivity } from '../../../../test/factories/activity.factory';
import { insertActivityEvent } from '../../../../test/factories/activity-event.factory';
import { insertActivityGoal } from '../../../../test/factories/activity-goal.factory';
import { insertCategory } from '../../../../test/factories/category.factory';
import { KnexService } from 'src/shared/knex/knex.service';
import AccountDeletionRepo from './accountDeletion.repository';
import DeletionTokenRepo from './deletionToken.repository';

describe('AccountDeletionRepo (integration)', () => {
  let repo: AccountDeletionRepo;
  let usersRepo: UsersRepo;
  let knexService: KnexService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [
        AccountDeletionRepo,
        UsersRepo,
        SessionRevocationRepo,
        DeletionTokenRepo,
      ],
    }).compile();

    repo = moduleRef.get(AccountDeletionRepo);
    usersRepo = moduleRef.get(UsersRepo);
    knexService = moduleRef.get(KnexService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('deletes the account and every record owned by it, leaving no orphans', async () => {
    const user = await insertUserWithKnex(knexService, {
      email: 'deletion-owner@example.com',
    });
    const userId = user.id as string;

    const category = await insertCategory(knexService, { userId });
    const activity = await insertActivity(knexService, {
      userId,
      categoryId: Number(category.id),
    });
    const activityId = activity.id as string;
    await insertActivityEvent(knexService, { activityId });
    await insertActivityGoal(knexService, { activityId });
    await knexService.connection('external_identities').insert({
      provider: 'apple',
      provider_subject: 'apple-deletion-subject',
      user_id: userId,
      provider_email: null,
      refresh_token: 'refresh-token',
    });
    await knexService.connection.raw(
      `
      INSERT INTO user_sessions (sid, expired, sess)
      VALUES ('deletion-session', NOW(), :sess)
    `,
      {
        sess: JSON.stringify({ passport: { user: userId } }),
      },
    );
    // An outstanding emailed link must not outlive the account it targets.
    await knexService.connection('account_deletion_tokens').insert({
      user_id: userId,
      token_hash: 'pending-deletion-token-hash',
      email: 'deletion-owner@example.com',
      expires_at: new Date(Date.now() + 60_000),
    });

    await repo.deleteAccount(userId);

    const db = getTestKnex();
    const tables: Array<[string, Record<string, string>]> = [
      ['users', { id: userId }],
      ['categories', { user_id: userId }],
      ['activities', { user_id: userId }],
      ['activity_events', { activity_id: activityId }],
      ['activity_goals', { activity_id: activityId }],
      ['external_identities', { user_id: userId }],
      ['account_deletion_tokens', { user_id: userId }],
    ];
    for (const [table, where] of tables) {
      const rows = await db(table).where(where);
      expect(rows).toHaveLength(0);
    }

    const sessions = await db('user_sessions').where({
      sid: 'deletion-session',
    });
    expect(sessions).toHaveLength(0);
  });

  it('leaves another user’s data untouched', async () => {
    const victim = await insertUserWithKnex(knexService, {
      email: 'deletion-victim@example.com',
    });
    const victimId = victim.id as string;
    const victimCategory = await insertCategory(knexService, {
      userId: victimId,
    });
    await insertActivity(knexService, {
      userId: victimId,
      categoryId: Number(victimCategory.id),
    });

    const attacker = await insertUserWithKnex(knexService, {
      email: 'deletion-attacker@example.com',
    });
    const attackerId = attacker.id as string;
    await insertActivity(knexService, { userId: attackerId });

    await repo.deleteAccount(attackerId);

    const db = getTestKnex();
    expect(await db('users').where({ id: victimId })).toHaveLength(1);
    expect(await db('categories').where({ user_id: victimId })).toHaveLength(1);
    expect(await db('activities').where({ user_id: victimId })).toHaveLength(1);
  });

  it('is safe to call for an account that does not exist', async () => {
    await expect(repo.deleteAccount('999999')).resolves.toBeUndefined();
    expect(await usersRepo.getById('999999')).toBeNull();
  });
});
