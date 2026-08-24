import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from '../helpers/create-test-app';
import { getTestKnex } from '../helpers/test-database';
import {
  createTestSigningKey,
  sha256Hex,
  signToken,
  startGoogleCertsServer,
  startJwksServer,
  type GoogleCertsServer,
  type JwksServer,
  type TestSigningKey,
} from '../helpers/test-jwks';

const GOOGLE_CLIENT_ID = 'test-server-client-id.apps.googleusercontent.com';
const APPLE_BUNDLE_ID = 'com.barryph.kadence';

function extractSid(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = /connect\.sid=([^;]+)/.exec(raw);
  return match ? match[1] : null;
}

describe('OAuth sign-in (e2e)', () => {
  let app: INestApplication<App>;
  let googleCerts: GoogleCertsServer;
  let appleJwks: JwksServer;
  let googleKey: TestSigningKey;
  let appleKey: TestSigningKey;

  beforeAll(async () => {
    googleKey = createTestSigningKey('e2e-google-key');
    googleCerts = await startGoogleCertsServer([googleKey]);
    appleKey = createTestSigningKey('e2e-apple-key');
    appleJwks = await startJwksServer([appleKey]);

    process.env.GOOGLE_SERVER_CLIENT_IDS = GOOGLE_CLIENT_ID;
    process.env.GOOGLE_JWKS_URL = googleCerts.url;
    process.env.GOOGLE_JWKS_COOLDOWN_MS = '0';
    process.env.APPLE_CLIENT_IDS = APPLE_BUNDLE_ID;
    process.env.APPLE_JWKS_URL = appleJwks.url;
    process.env.APPLE_JWKS_COOLDOWN_MS = '0';

    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
    await googleCerts.close();
    await appleJwks.close();
  });

  const googleToken = (
    overrides: Partial<Parameters<typeof signToken>[0]> = {},
  ) =>
    signToken({
      key: googleKey,
      iss: 'accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      sub: 'e2e-google-subject',
      email: 'google-user@example.com',
      ...overrides,
    });

  const appleToken = (
    overrides: Partial<Parameters<typeof signToken>[0]> = {},
  ) =>
    signToken({
      key: appleKey,
      iss: 'https://appleid.apple.com',
      aud: APPLE_BUNDLE_ID,
      sub: 'e2e-apple-subject',
      email: 'apple-user@example.com',
      nonce: sha256Hex('e2e-nonce'),
      ...overrides,
    });

  it('signs in a new Google user and establishes an authenticated session', async () => {
    const agent = request.agent(app.getHttpServer());
    const token = googleToken();

    const response = await agent
      .post('/auth/google')
      .send({ idToken: token })
      .expect(200);

    expect(response.body.data.user.email).toBe('google-user@example.com');

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user.id).toBe(response.body.data.user.id);
      });

    const db = getTestKnex();
    const identity = await db('external_identities')
      .where({ provider: 'google', provider_subject: 'e2e-google-subject' })
      .first();
    expect(identity.user_id).toBe(String(response.body.data.user.id));
    expect(identity.provider_email).toBe('google-user@example.com');

    const sessions = await db('user_sessions').select('sess');
    const serialized = JSON.stringify(sessions);
    expect(serialized).not.toContain('e2e-google-subject');
    expect(serialized).not.toContain(token);
  });

  it('reuses the same user for an existing Google identity', async () => {
    const first = request.agent(app.getHttpServer());
    const second = request.agent(app.getHttpServer());

    const res1 = await first
      .post('/auth/google')
      .send({ idToken: googleToken() })
      .expect(200);
    const res2 = await second
      .post('/auth/google')
      .send({ idToken: googleToken() })
      .expect(200);

    expect(res1.body.data.user.id).toBe(res2.body.data.user.id);

    const db = getTestKnex();
    const count = await db('users').where({ email: 'google-user@example.com' });
    expect(count).toHaveLength(1);
  });

  it('signs in a new Apple user with a validated nonce', async () => {
    const agent = request.agent(app.getHttpServer());

    const response = await agent
      .post('/auth/apple')
      .send({
        idToken: appleToken(),
        nonce: 'e2e-nonce',
        authorizationCode: 'e2e-authorization-code',
      })
      .expect(200);

    expect(response.body.data.user.email).toBe('apple-user@example.com');

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user.id).toBe(response.body.data.user.id);
      });
  });

  it('rejects an Apple token whose nonce does not match', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/apple')
      .send({
        idToken: appleToken(),
        nonce: 'different-nonce',
        authorizationCode: 'e2e-authorization-code',
      })
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('OAUTH_AUTH_FAILED');
      });

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeUndefined();
      });
  });

  it('rejects an expired Google token without creating a session', async () => {
    const agent = request.agent(app.getHttpServer());
    const expired = googleToken({
      sub: 'expired-google-subject',
      exp: Math.floor(Date.now() / 1000) - 3600,
    });

    await agent.post('/auth/google').send({ idToken: expired }).expect(401);

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeUndefined();
      });

    const db = getTestKnex();
    const identity = await db('external_identities')
      .where({ provider_subject: 'expired-google-subject' })
      .first();
    expect(identity).toBeUndefined();
  });

  it('rejects an invalid-signature Google token', async () => {
    const attackerKey = createTestSigningKey('e2e-attacker-key');
    const forged = signToken({
      key: attackerKey,
      iss: 'accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      sub: 'forged-subject',
      email: 'forged@example.com',
    });

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: forged })
      .expect(401);
  });

  it('rejects a Google token with an incorrect issuer and audience', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: googleToken({ iss: 'https://evil.example.com' }) })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: googleToken({ aud: 'some-other-client' }) })
      .expect(401);
  });

  it('ignores client-supplied identity fields (validation rejects them)', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/google')
      .send({
        idToken: googleToken(),
        email: 'attacker@example.com',
        userId: '1',
        name: 'Attacker',
      })
      .expect(400);

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeUndefined();
      });
  });

  it('does not merge accounts when provider emails match', async () => {
    const db = getTestKnex();
    const registerAgent = request.agent(app.getHttpServer());
    const registerRes = await registerAgent
      .post('/auth/register')
      .send({
        email: 'same-email@example.com',
        password: 'password123',
        passwordConfirm: 'password123',
      })
      .expect(201);

    // New Google identity reporting the same email as the password account.
    const oauthAgent = request.agent(app.getHttpServer());
    const oauthRes = await oauthAgent
      .post('/auth/google')
      .send({
        idToken: googleToken({
          sub: 'new-google-subject',
          email: 'same-email@example.com',
        }),
      })
      .expect(200);

    // A distinct account was created (no auto-merge), with a synthetic email
    // because the real one is taken.
    expect(oauthRes.body.data.user.id).not.toBe(registerRes.body.data.user.id);
    expect(oauthRes.body.data.user.email).toBe(
      'google-new-google-subject@local.kadence',
    );

    // The password account is untouched and still exists.
    const passwordUser = await db('users')
      .whereRaw('email = :email AND password IS NOT NULL', {
        email: 'same-email@example.com',
      })
      .first();
    expect(passwordUser).toBeTruthy();
  });

  it('prevents a provider identity from being linked to two users', async () => {
    const db = getTestKnex();
    const userRow = await db('users')
      .insert({ email: 'victim@example.com', password: null })
      .returning('id');

    await expect(
      db('external_identities').insert({
        provider: 'google',
        provider_subject: 'stolen-subject',
        user_id: userRow[0].id,
      }),
    ).resolves.toBeDefined();

    await expect(
      db('external_identities').insert({
        provider: 'google',
        provider_subject: 'stolen-subject',
        user_id: userRow[0].id,
      }),
    ).rejects.toThrow();
  });

  it('regenerates the session ID after OAuth sign-in', async () => {
    const agent = request.agent(app.getHttpServer());

    const preAuth = await agent
      .post('/auth/register')
      .send({
        email: 'pre-auth@example.com',
        password: 'password123',
        passwordConfirm: 'password123',
      })
      .expect(201);
    const preSid = extractSid(preAuth.headers['set-cookie']);

    const oauth = await agent
      .post('/auth/google')
      .send({ idToken: googleToken({ sub: 'session-regen-subject' }) })
      .expect(200);
    const postSid = extractSid(oauth.headers['set-cookie']);

    expect(preSid).toBeTruthy();
    expect(postSid).toBeTruthy();
    expect(postSid).not.toBe(preSid);

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user.id).toBe(oauth.body.data.user.id);
      });
  });

  it('does not send a permissive CORS origin header', async () => {
    await request(app.getHttpServer())
      .get('/users/current')
      .set('Origin', 'http://evil.example.com')
      .expect(200)
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      });
  });

  it('logs out of the application session after OAuth sign-in', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/google')
      .send({ idToken: googleToken({ sub: 'logout-subject' }) })
      .expect(200);

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeDefined();
      });

    await agent.delete('/auth/logout').expect(200);

    await agent
      .get('/users/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.user).toBeUndefined();
      });
  });
});
