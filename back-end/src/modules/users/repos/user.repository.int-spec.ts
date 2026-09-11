import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../../../shared/knex/database.module';
import UsersRepo from './user.repository';
import SessionRevocationRepo from '../../authentication/repos/session-revocation.repository';
import UserEmail from '../domain/value-objects/UserEmail';
import { buildUser } from '../../../../test/factories/user.factory';
import { hashPasswordResetToken } from '../../authentication/utils/password-reset-token';
import { getTestKnex } from '../../../../test/helpers/test-database';

describe('UsersRepo (integration)', () => {
  let repo: UsersRepo;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [UsersRepo, SessionRevocationRepo],
    }).compile();

    repo = moduleRef.get(UsersRepo);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('creates and retrieves a user by email', async () => {
    const user = buildUser({ email: 'repo-test@example.com' });
    const created = await repo.create(user);

    const found = await repo.getByEmail(
      UserEmail.create('repo-test@example.com'),
    );

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.email.value).toBe('repo-test@example.com');
  });

  it('reports when email exists', async () => {
    await repo.create(buildUser({ email: 'exists@example.com' }));

    const exists = await repo.exists(UserEmail.create('exists@example.com'));
    expect(exists).toBe(true);
  });

  it('stores and finds password reset tokens', async () => {
    const created = await repo.create(
      buildUser({ email: 'reset@example.com' }),
    );
    const userId = created.id as string;
    const hashedToken = hashPasswordResetToken('reset-token');
    const expiresAt = new Date(Date.now() + 60_000);

    await repo.setPasswordResetToken(userId, hashedToken, expiresAt);

    const record = await repo.findPasswordResetByToken(hashedToken);
    expect(record?.userId).toBe(String(userId));
  });

  it('clears user sessions on password reset', async () => {
    const created = await repo.create(
      buildUser({ email: 'sessions@example.com' }),
    );
    const userId = created.id as string;
    const db = getTestKnex();

    await db.raw(
      `
        INSERT INTO user_sessions (sid, expired, sess)
        VALUES ('test-session', NOW() + INTERVAL '1 day', :sess)
      `,
      {
        sess: JSON.stringify({ passport: { user: userId } }),
      },
    );

    await repo.clearUserSessions(userId);

    const sessions = await db('user_sessions').where({ sid: 'test-session' });
    expect(sessions).toHaveLength(0);
    // Revocation is durable: a tombstone outlives the deleted row so an
    // in-flight request cannot write the session back into existence.
    const tombstones = await db('revoked_sessions').where({
      sid: 'test-session',
    });
    expect(tombstones).toHaveLength(1);
  });
});
