import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from '../helpers/create-test-app';
import { getTestKnex } from '../helpers/test-database';
import { registerUser } from '../helpers/auth-helpers';
import { expectErrorBody } from '../helpers/assertions';
import {
  EMAIL_SENDER,
  IEmailSender,
  SentEmail,
} from '../../src/shared/email/email-sender.port';
import { hashDeletionToken } from '../../src/modules/account-management/infrastructure/deletion-token';

const DELETION_SITE_URL = 'https://delete.kadence.test';

describe('External account deletion (e2e)', () => {
  let app: INestApplication<App>;
  let emailSender: IEmailSender & { sentEmails: SentEmail[] };

  beforeAll(async () => {
    process.env.ACCOUNT_DELETION_SITE_URL = DELETION_SITE_URL;
    // The deletion site is a separate origin from the app; it must be on the
    // allow-list for the browser to call these endpoints at all.
    process.env.CORS_ORIGINS = DELETION_SITE_URL;
    app = await createTestApp();
    emailSender = app.get(EMAIL_SENDER);
  });

  afterAll(async () => {
    delete process.env.ACCOUNT_DELETION_SITE_URL;
    delete process.env.CORS_ORIGINS;
    await closeTestApp(app);
  });

  beforeEach(() => {
    emailSender.sentEmails.length = 0;
  });

  const requestDeletion = (email: string) =>
    request(app.getHttpServer())
      .post('/account/deletion-requests')
      .send({ email });

  const confirmDeletion = (token: string) =>
    request(app.getHttpServer())
      .post('/account/deletion-requests/confirm')
      .send({ token });

  const deletionEmailFor = (recipientEmail: string) =>
    emailSender.sentEmails.find(
      (email): email is Extract<SentEmail, { kind: 'account-deletion' }> =>
        email.kind === 'account-deletion' &&
        email.recipientEmail === recipientEmail,
    );

  const deletedEmailFor = (recipientEmail: string) =>
    emailSender.sentEmails.find(
      (email): email is Extract<SentEmail, { kind: 'account-deleted' }> =>
        email.kind === 'account-deleted' &&
        email.recipientEmail === recipientEmail,
    );

  const tokenFromEmail = (recipientEmail: string): string => {
    const sent = deletionEmailFor(recipientEmail);
    expect(sent).toBeDefined();
    const token = sent
      ? new URL(sent.deletionUrl).searchParams.get('token')
      : null;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    return token ?? '';
  };

  describe('POST /account/deletion-requests', () => {
    it('answers identically for an unknown address and sends nothing', async () => {
      const response = await requestDeletion('nobody@example.com').expect(200);

      expect(response.body.data.message).toMatch(
        /if an account with that email exists/i,
      );
      expect(emailSender.sentEmails).toHaveLength(0);
    });

    it('answers identically for a registered address but sends the link', async () => {
      const { user } = await registerUser(app);

      const unknown = await requestDeletion('nobody@example.com').expect(200);
      const known = await requestDeletion(user.email).expect(200);

      // The response body and status must not differ, or the endpoint becomes
      // an account-existence oracle.
      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);

      const sent = deletionEmailFor(user.email);
      if (!sent) {
        throw new Error('expected an account-deletion email to be sent');
      }
      expect(sent.deletionUrl).toMatch(
        new RegExp(`^${DELETION_SITE_URL}/delete\\?token=[a-f0-9]{64}$`),
      );
      expect(sent.expiresInMinutes).toBeGreaterThan(0);
    });

    it('stores only the hash of the emailed token', async () => {
      const { user } = await registerUser(app);
      await requestDeletion(user.email).expect(200);

      const rawToken = tokenFromEmail(user.email);
      const rows = await getTestKnex()('account_deletion_tokens');
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toBe(hashDeletionToken(rawToken));
      expect(rows[0].token_hash).not.toBe(rawToken);
      expect(rows[0].email).toBe(user.email);
    });

    it('invalidates the previous link when a new one is requested', async () => {
      const { user } = await registerUser(app);

      await requestDeletion(user.email).expect(200);
      const firstToken = tokenFromEmail(user.email);

      emailSender.sentEmails.length = 0;
      await requestDeletion(user.email).expect(200);
      const secondToken = tokenFromEmail(user.email);

      expect(secondToken).not.toBe(firstToken);
      await confirmDeletion(firstToken).expect(400);
      // The older link changed nothing.
      expect(await getTestKnex()('users').where({ id: user.id })).toHaveLength(
        1,
      );
    });

    it('rejects a malformed email and unknown fields', async () => {
      await requestDeletion('not-an-email').expect(400);
      await request(app.getHttpServer())
        .post('/account/deletion-requests')
        .send({ email: 'someone@example.com', userId: '1' })
        .expect(400);
      expect(emailSender.sentEmails).toHaveLength(0);
    });
  });

  describe('POST /account/deletion-requests/confirm', () => {
    it('deletes the account and everything it owns with a valid token', async () => {
      const { user, agent } = await registerUser(app);
      const db = getTestKnex();

      const [category] = await db('categories').insert(
        { user_id: user.id, name: 'Health', color: '#ff0000' },
        ['id'],
      );
      const [activity] = await db('activities').insert(
        {
          name: 'Run',
          interval: '7 days',
          user_id: user.id,
          category_id: category.id,
        },
        ['id'],
      );
      await db('activity_events').insert({
        activity_id: activity.id,
        date: '2026-01-15',
      });
      await db('activity_goals').insert({
        activity_id: activity.id,
        target_per_week: 3,
      });
      await db('external_identities').insert({
        provider: 'google',
        provider_subject: 'external-deletion-subject',
        user_id: user.id,
        provider_email: null,
        refresh_token: null,
      });

      await requestDeletion(user.email).expect(200);
      const token = tokenFromEmail(user.email);

      await confirmDeletion(token)
        .expect(200)
        .expect((response) => {
          expect(response.body.data.message).toMatch(/permanently deleted/i);
        });

      const tables: Array<[string, Record<string, string | number>]> = [
        ['users', { id: user.id }],
        ['categories', { user_id: user.id }],
        ['activities', { user_id: user.id }],
        ['activity_events', { activity_id: activity.id }],
        ['activity_goals', { activity_id: activity.id }],
        ['external_identities', { user_id: user.id }],
        ['account_deletion_tokens', { user_id: user.id }],
      ];
      for (const [table, where] of tables) {
        expect(await db(table).where(where)).toHaveLength(0);
      }

      // The account really is gone: a live session is worthless afterwards.
      await agent
        .get('/users/current')
        .expect(200)
        .expect((response) => {
          expect(response.body.data.user).toBeUndefined();
        });

      // And the address is told the deletion happened.
      expect(deletedEmailFor(user.email)).toBeDefined();
    });

    it('refuses a token that has already been used, deleting nothing more', async () => {
      const { user } = await registerUser(app);
      await requestDeletion(user.email).expect(200);
      const token = tokenFromEmail(user.email);

      await confirmDeletion(token).expect(200);
      await confirmDeletion(token)
        .expect(400)
        .expect((response) => {
          expectErrorBody(response.body, { code: 'INVALID_DELETION_TOKEN' });
        });

      expect(await getTestKnex()('users').where({ id: user.id })).toHaveLength(
        0,
      );
    });

    it('refuses an expired token, deleting nothing', async () => {
      const { user } = await registerUser(app);
      await requestDeletion(user.email).expect(200);
      const token = tokenFromEmail(user.email);

      await getTestKnex()('account_deletion_tokens')
        .where({ token_hash: hashDeletionToken(token) })
        .update({ expires_at: new Date(Date.now() - 60_000) });

      await confirmDeletion(token)
        .expect(400)
        .expect((response) => {
          expectErrorBody(response.body, { code: 'INVALID_DELETION_TOKEN' });
        });

      expect(await getTestKnex()('users').where({ id: user.id })).toHaveLength(
        1,
      );
      expect(deletedEmailFor(user.email)).toBeUndefined();
    });

    it('refuses a forged or malformed token', async () => {
      const { user } = await registerUser(app);

      for (const token of ['', 'not-a-real-token', 'a'.repeat(64)]) {
        await confirmDeletion(token).expect(400);
      }
      await request(app.getHttpServer())
        .post('/account/deletion-requests/confirm')
        .send({ token: 'x', userId: '1' })
        .expect(400);

      expect(await getTestKnex()('users').where({ id: user.id })).toHaveLength(
        1,
      );
    });

    it('lets exactly one of two concurrent confirmations win', async () => {
      const { user } = await registerUser(app);
      await requestDeletion(user.email).expect(200);
      const token = tokenFromEmail(user.email);

      const [first, second] = await Promise.all([
        confirmDeletion(token),
        confirmDeletion(token),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 400]);
      expect(await getTestKnex()('users').where({ id: user.id })).toHaveLength(
        0,
      );
    });
  });

  describe('cross-origin access', () => {
    it('allows the deletion site origin to preflight and call the endpoint', async () => {
      await request(app.getHttpServer())
        .options('/account/deletion-requests')
        .set('Origin', DELETION_SITE_URL)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type')
        .expect('Access-Control-Allow-Origin', DELETION_SITE_URL)
        .expect(204);

      await request(app.getHttpServer())
        .post('/account/deletion-requests')
        .set('Origin', DELETION_SITE_URL)
        .send({ email: 'nobody@example.com' })
        .expect(200)
        .expect('Access-Control-Allow-Origin', DELETION_SITE_URL);
    });

    it('does not reflect an origin that is not on the allow-list', async () => {
      const response = await request(app.getHttpServer())
        .post('/account/deletion-requests')
        .set('Origin', 'https://evil.example.com')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
