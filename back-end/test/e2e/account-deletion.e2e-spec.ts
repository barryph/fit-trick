import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { generateKeyPairSync } from 'node:crypto';
import { createTestApp, closeTestApp } from '../helpers/create-test-app';
import { getTestKnex } from '../helpers/test-database';
import { createUserPayload, registerUser } from '../helpers/auth-helpers';
import { expectErrorBody } from '../helpers/assertions';
import {
  createTestSigningKey,
  sha256Hex,
  signToken,
  startAppleApiServer,
  startGoogleCertsServer,
  startJwksServer,
  type AppleApiServer,
  type GoogleCertsServer,
  type JwksServer,
  type TestSigningKey,
} from '../helpers/test-jwks';

const GOOGLE_CLIENT_ID = 'test-server-client-id.apps.googleusercontent.com';
const APPLE_BUNDLE_ID = 'com.barryph.kadence';

describe('Account deletion (e2e)', () => {
  let app: INestApplication<App>;
  let googleCerts: GoogleCertsServer;
  let appleJwks: JwksServer;
  let appleApi: AppleApiServer;
  let googleKey: TestSigningKey;
  let appleKey: TestSigningKey;

  beforeAll(async () => {
    googleKey = createTestSigningKey('e2e-google-key');
    googleCerts = await startGoogleCertsServer([googleKey]);
    appleKey = createTestSigningKey('e2e-apple-key');
    appleJwks = await startJwksServer([appleKey]);
    appleApi = await startAppleApiServer();
    appleApi.respondWith(200, { refresh_token: 'e2e-apple-refresh-token' });

    // A real ES256 key so the client secret JWT can actually be signed.
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    process.env.GOOGLE_SERVER_CLIENT_IDS = GOOGLE_CLIENT_ID;
    process.env.GOOGLE_JWKS_URL = googleCerts.url;
    process.env.GOOGLE_JWKS_COOLDOWN_MS = '0';
    process.env.APPLE_CLIENT_IDS = APPLE_BUNDLE_ID;
    process.env.APPLE_JWKS_URL = appleJwks.url;
    process.env.APPLE_JWKS_COOLDOWN_MS = '0';
    process.env.APPLE_TOKEN_URL = `${appleApi.url}/auth/token`;
    process.env.APPLE_REVOKE_URL = `${appleApi.url}/auth/revoke`;
    process.env.APPLE_TEAM_ID = 'TEAM12345';
    process.env.APPLE_SERVICES_KEY_ID = 'services-key-id';
    process.env.APPLE_SERVICES_PRIVATE_KEY = privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();

    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
    await googleCerts.close();
    await appleJwks.close();
    await appleApi.close();
  });

  beforeEach(() => {
    appleApi.respondWith(200, { refresh_token: 'e2e-apple-refresh-token' });
    appleApi.requests.length = 0;
  });

  const googleToken = (sub: string, email: string) =>
    signToken({
      key: googleKey,
      iss: 'accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      sub,
      email,
    });

  const appleToken = (sub: string, email: string) =>
    signToken({
      key: appleKey,
      iss: 'https://appleid.apple.com',
      aud: APPLE_BUNDLE_ID,
      sub,
      email,
      nonce: sha256Hex('e2e-nonce'),
    });

  async function insertOwnedData(
    userId: string,
  ): Promise<{ categoryId: number; activityId: number }> {
    const db = getTestKnex();
    const [categoryId] = await db('categories').insert(
      { user_id: userId, name: 'Health', color: '#ff0000' },
      ['id'],
    );
    const [activityId] = await db('activities').insert(
      {
        name: 'Run',
        interval: '7 days',
        user_id: userId,
        category_id: categoryId.id,
      },
      ['id'],
    );
    await db('activity_events').insert({
      activity_id: activityId.id,
      date: '2026-01-15',
    });
    await db('activity_goals').insert({
      activity_id: activityId.id,
      target_per_week: 3,
    });
    return { categoryId: categoryId.id, activityId: activityId.id };
  }

  it('rejects unauthenticated account deletion', async () => {
    const response = await request(app.getHttpServer())
      .delete('/account')
      .expect(401);

    expectErrorBody(response.body, {
      message: 'Not authenticated',
    });
  });

  it('deletes an email/password account and all of its data', async () => {
    const { user, agent } = await registerUser(app);
    const { categoryId, activityId } = await insertOwnedData(user.id);
    const db = getTestKnex();

    // A pure email/password account reports no linked external providers, so
    // the client must not attempt any provider disconnect for it.
    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.authProviders).toEqual([]);
      });

    // Link an identity so deletion is verified to remove it too.
    await db('external_identities').insert({
      provider: 'google',
      provider_subject: 'orphan-check-subject',
      user_id: user.id,
      provider_email: null,
      refresh_token: null,
    });

    const response = await agent.delete('/account').expect(200);
    expect(response.body.data.message).toBe('Account deleted');

    // No orphaned rows may remain anywhere.
    const tables: Array<[string, Record<string, string | number>]> = [
      ['users', { id: user.id }],
      ['categories', { user_id: user.id }],
      ['activities', { user_id: user.id }],
      ['activity_events', { activity_id: activityId }],
      ['activity_goals', { activity_id: activityId }],
      ['categories', { id: categoryId }],
      ['external_identities', { user_id: user.id }],
    ];
    for (const [table, where] of tables) {
      expect(await db(table).where(where)).toHaveLength(0);
    }
    expect(await db('user_sessions')).toHaveLength(0);

    // The session is gone and further attempts are rejected.
    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeUndefined();
      });
    await agent.delete('/account').expect(401);
  });

  it('rejects a request body targeting another user, deleting only the caller', async () => {
    const { user: attacker, agent } = await registerUser(app);
    const { user: victim } = await registerUser(app);
    const db = getTestKnex();
    await db('activities').insert({
      name: 'Victim data',
      interval: '7 days',
      user_id: victim.id,
    });

    // Any client-supplied identifier is rejected outright by validation.
    await agent
      .delete('/account')
      .send({ userId: victim.id, email: victim.email })
      .expect(400);

    // The victim's account and data are untouched and still authenticated.
    expect(await db('users').where({ id: victim.id })).toHaveLength(1);
    expect(await db('activities').where({ user_id: victim.id })).toHaveLength(
      1,
    );

    const victimAgent = request.agent(app.getHttpServer());
    const victimLogin = await victimAgent
      .post('/auth/login')
      .send({ email: victim.email, password: 'password123' })
      .expect(200);
    expect(victimLogin.body.data.user.id).toBe(victim.id);

    // The attacker's own account is still present too (nothing was deleted).
    expect(await db('users').where({ id: attacker.id })).toHaveLength(1);
  });

  it('deletes a Google sign-in account', async () => {
    const agent = request.agent(app.getHttpServer());
    const signIn = await agent
      .post('/auth/google')
      .send({
        idToken: googleToken(
          'google-deletion-subject',
          'google-del@example.com',
        ),
      })
      .expect(200);
    const userId = signIn.body.data.user.id as string;
    const db = getTestKnex();
    await db('activities').insert({
      name: 'Google data',
      interval: '7 days',
      user_id: userId,
    });

    // The account is reported as Google-linked so the client can perform the
    // Google disconnect during deletion.
    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.authProviders).toEqual(['google']);
      });

    await agent.delete('/account').expect(200);

    expect(await db('users').where({ id: userId })).toHaveLength(0);
    expect(
      await db('external_identities').where({
        provider: 'google',
        provider_subject: 'google-deletion-subject',
      }),
    ).toHaveLength(0);
    expect(await db('activities').where({ user_id: userId })).toHaveLength(0);
  });

  it('captures an Apple refresh token at sign-in and revokes it on deletion', async () => {
    const agent = request.agent(app.getHttpServer());
    const signIn = await agent
      .post('/auth/apple')
      .send({
        idToken: appleToken('apple-deletion-subject', 'apple-del@example.com'),
        nonce: 'e2e-nonce',
        authorizationCode: 'e2e-authorization-code',
      })
      .expect(200);
    const userId = signIn.body.data.user.id as string;

    const db = getTestKnex();
    const identity = await db('external_identities')
      .where({ provider: 'apple', provider_subject: 'apple-deletion-subject' })
      .first();
    // The refresh token is stored server-side and never exposed to the client.
    expect(identity.refresh_token).toBe('e2e-apple-refresh-token');
    expect(JSON.stringify(signIn.body)).not.toContain('refresh_token');

    appleApi.requests.length = 0;
    await agent.delete('/account').expect(200);

    // Apple's revoke endpoint was called with the stored token.
    expect(appleApi.requests).toHaveLength(1);
    expect(appleApi.requests[0].path).toBe('/auth/revoke');
    expect(appleApi.requests[0].body.get('token')).toBe(
      'e2e-apple-refresh-token',
    );
    expect(appleApi.requests[0].body.get('token_type_hint')).toBe(
      'refresh_token',
    );

    expect(await db('users').where({ id: userId })).toHaveLength(0);
    expect(
      await db('external_identities').where({
        provider: 'apple',
        provider_subject: 'apple-deletion-subject',
      }),
    ).toHaveLength(0);
  });

  it('aborts deletion without touching data when Apple revocation fails', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/apple')
      .send({
        idToken: appleToken(
          'apple-revoke-failure-subject',
          'revoke-fail@example.com',
        ),
        nonce: 'e2e-nonce',
        authorizationCode: 'e2e-authorization-code',
      })
      .expect(200);
    const db = getTestKnex();
    const userRow = await db('users')
      .where({ email: 'revoke-fail@example.com' })
      .first();

    appleApi.respondWith(500, { error: 'server_error' });
    await agent
      .delete('/account')
      .expect(502)
      .expect((res) => {
        expectErrorBody(res.body, { code: 'PROVIDER_REVOCATION_FAILED' });
      });

    // Nothing was deleted: the account is intact and can retry.
    expect(await db('users').where({ id: userRow.id })).toHaveLength(1);
    expect(
      await db('external_identities').where({
        provider: 'apple',
        provider_subject: 'apple-revoke-failure-subject',
      }),
    ).toHaveLength(1);
    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeDefined();
      });

    // A retry succeeds once the provider recovers.
    appleApi.respondWith(200, {});
    await agent.delete('/account').expect(200);
    expect(await db('users').where({ id: userRow.id })).toHaveLength(0);
  });

  it('skips revocation when the Apple identity has no stored refresh token', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/apple')
      .send({
        idToken: appleToken('apple-no-token-subject', 'no-token@example.com'),
        nonce: 'e2e-nonce',
        authorizationCode: 'e2e-authorization-code',
      })
      .expect(200);
    const db = getTestKnex();
    await db('external_identities')
      .where({ provider_subject: 'apple-no-token-subject' })
      .update({ refresh_token: null });

    appleApi.requests.length = 0;
    await agent.delete('/account').expect(200);

    expect(appleApi.requests).toHaveLength(0);
    expect(
      await db('external_identities').where({
        provider_subject: 'apple-no-token-subject',
      }),
    ).toHaveLength(0);
  });

  it('fails closed when the client supplies unknown fields to the Google sign-in flow', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/google')
      .send({
        idToken: googleToken(
          'google-extra-fields-subject',
          'extra@example.com',
        ),
        userId: '999',
        email: 'attacker@example.com',
      })
      .expect(400);

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeUndefined();
      });
  });

  it('creates only an email/password account when registering with the standard payload', async () => {
    const payload = createUserPayload();
    await registerUser(app, payload);

    const db = getTestKnex();
    const user = await db('users').where({ email: payload.email }).first();
    expect(user.password).not.toBeNull();
    expect(
      await db('external_identities').where({ user_id: user.id }),
    ).toHaveLength(0);
  });
});
