import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from 'src/shared/knex/database.module';
import { KnexService } from 'src/shared/knex/knex.service';
import { getTestKnex } from '../../../../test/helpers/test-database';
import { insertUserWithKnex } from '../../../../test/factories/user.factory';
import DeletionTokenRepo from './deletionToken.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('DeletionTokenRepo (integration)', () => {
  let repo: DeletionTokenRepo;
  let knexService: KnexService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [DeletionTokenRepo],
    }).compile();

    repo = moduleRef.get(DeletionTokenRepo);
    knexService = moduleRef.get(KnexService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const issue = (
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    email = 'delete-me@example.com',
  ) => repo.replacePendingForUser({ userId, email, tokenHash, expiresAt });

  it('stores only the hash and redeems an unexpired token exactly once', async () => {
    const user = await insertUserWithKnex(knexService, {
      email: 'token-owner@example.com',
    });
    const userId = user.id as string;

    await issue(
      userId,
      'hash-one',
      new Date(Date.now() + HOUR_MS),
      'token-owner@example.com',
    );

    const first = await repo.consumeIfValid('hash-one');
    expect(first).toEqual({
      userId: String(userId),
      email: 'token-owner@example.com',
    });

    // Consuming deleted the row: the same link cannot work again.
    const second = await repo.consumeIfValid('hash-one');
    expect(second).toBeNull();
    expect(
      await getTestKnex()('account_deletion_tokens').where({
        token_hash: 'hash-one',
      }),
    ).toHaveLength(0);
  });

  it('refuses an expired token and leaves it alone', async () => {
    const user = await insertUserWithKnex(knexService, {
      email: 'expired-owner@example.com',
    });
    const userId = user.id as string;
    await issue(userId, 'hash-expired', new Date(Date.now() - 1000));

    expect(await repo.consumeIfValid('hash-expired')).toBeNull();
    // Not consumed, so a clock that moves backwards cannot resurrect it, and
    // the row remains for the cascade to clean up.
    expect(
      await getTestKnex()('account_deletion_tokens').where({
        token_hash: 'hash-expired',
      }),
    ).toHaveLength(1);
  });

  it('lets exactly one of two concurrent redemptions win', async () => {
    const user = await insertUserWithKnex(knexService, {
      email: 'race-owner@example.com',
    });
    const userId = user.id as string;
    await issue(userId, 'hash-raced', new Date(Date.now() + HOUR_MS));

    const results = await Promise.all([
      repo.consumeIfValid('hash-raced'),
      repo.consumeIfValid('hash-raced'),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('replaces any pending request for the same user', async () => {
    const user = await insertUserWithKnex(knexService, {
      email: 'replace-owner@example.com',
    });
    const userId = user.id as string;

    await issue(userId, 'hash-old', new Date(Date.now() + HOUR_MS));
    await issue(userId, 'hash-new', new Date(Date.now() + HOUR_MS));

    expect(await repo.consumeIfValid('hash-old')).toBeNull();
    expect(await repo.consumeIfValid('hash-new')).toMatchObject({
      userId: String(userId),
    });
    expect(await getTestKnex()('account_deletion_tokens')).toHaveLength(0);
  });

  it('restores a consumed token so a failed deletion can be retried', async () => {
    const user = await insertUserWithKnex(knexService, {
      email: 'restore-owner@example.com',
    });
    const userId = user.id as string;
    const expiresAt = new Date(Date.now() + HOUR_MS);
    await issue(userId, 'hash-restored', expiresAt);

    expect(await repo.consumeIfValid('hash-restored')).not.toBeNull();
    await repo.restore({
      userId,
      email: 'restore-owner@example.com',
      tokenHash: 'hash-restored',
      expiresAt,
    });

    expect(await repo.consumeIfValid('hash-restored')).toMatchObject({
      userId: String(userId),
    });
  });

  it('leaves other users’ tokens untouched', async () => {
    const first = await insertUserWithKnex(knexService, {
      email: 'first-owner@example.com',
    });
    const second = await insertUserWithKnex(knexService, {
      email: 'second-owner@example.com',
    });

    await issue(
      first.id as string,
      'hash-first',
      new Date(Date.now() + HOUR_MS),
    );
    await issue(
      second.id as string,
      'hash-second',
      new Date(Date.now() + HOUR_MS),
    );

    expect(await repo.consumeIfValid('hash-first')).toMatchObject({
      userId: String(first.id),
    });
    expect(await repo.consumeIfValid('hash-second')).toMatchObject({
      userId: String(second.id),
    });
  });

  it('is safe to call for an unknown token', async () => {
    expect(await repo.consumeIfValid('never-issued')).toBeNull();
  });
});
