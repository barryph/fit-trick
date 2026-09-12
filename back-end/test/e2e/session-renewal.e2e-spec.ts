import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from '../helpers/create-test-app';
import { createUserPayload, registerUser } from '../helpers/auth-helpers';
import { getTestKnex } from '../helpers/test-database';
import {
  SESSION_COOKIE_NAME,
  expectSessionExpired,
  getOnlyStoredSession,
  getStoredSessions,
  parseSessionCookieAttributes,
  readSessionCookie,
  readSessionId,
  setStoredAnchor,
  setStoredWindowExpiry,
} from '../helpers/session-helpers';
import { hashPasswordResetToken } from '../../src/modules/authentication/utils/password-reset-token';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IDLE_TTL_MS = 14 * ONE_DAY_IN_MS;
const DEFAULT_ABSOLUTE_TTL_MS = 60 * ONE_DAY_IN_MS;

/** A moment close to "now", allowing for test scheduling overhead. */
function expectRecent(timestamp: unknown, toleranceMs = 30_000): void {
  expect(typeof timestamp).toBe('number');
  expect(Math.abs(Date.now() - (timestamp as number))).toBeLessThan(
    toleranceMs,
  );
}

describe('Session rolling renewal (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe('anchoring', () => {
    it('records server-side timestamps when the session is created', async () => {
      const { agent } = await registerUser(app);
      const stored = await getOnlyStoredSession();

      expectRecent(stored.sess.auth?.createdAt);
      expectRecent(stored.sess.auth?.renewedAt);
      expect(stored.sess.auth?.createdAt).toBe(stored.sess.auth?.renewedAt);

      // The stored row and the cookie agree on the initial idle window.
      expect(stored.expired.getTime()).toBeGreaterThan(
        Date.now() + DEFAULT_IDLE_TTL_MS - 60_000,
      );
      expect(stored.expired.getTime()).toBeLessThan(
        Date.now() + DEFAULT_IDLE_TTL_MS + 60_000,
      );

      await agent.get('/users/protec').expect(200);
    });

    it('sends no Set-Cookie before the window is halfway through', async () => {
      const { agent } = await registerUser(app);
      const before = await getOnlyStoredSession();

      const response = await agent.get('/users/protec').expect(200);

      expect(readSessionCookie(response)).toBeUndefined();
      const after = await getOnlyStoredSession();
      expect(after.sess.auth?.renewedAt).toBe(before.sess.auth?.renewedAt);
    });
  });

  describe('rolling renewal', () => {
    it('re-grants the window once it is more than halfway through', async () => {
      const { agent } = await registerUser(app);
      const { sid } = await getOnlyStoredSession();

      // Eight of the fourteen days have passed: past halfway, still active.
      const createdAt = Date.now() - 30 * ONE_DAY_IN_MS;
      await setStoredAnchor(sid, {
        createdAt,
        renewedAt: Date.now() - 8 * ONE_DAY_IN_MS,
      });

      const response = await agent.get('/users/protec').expect(200);

      const attributes = parseSessionCookieAttributes(response);
      expect(attributes).toBeDefined();
      expect(attributes?.httponly).toBe(true);
      expect(String(attributes?.samesite).toLowerCase()).toBe('strict');
      expect(attributes?.path).toBe('/');
      // The renewed window is handed to the client, so a mobile cookie jar
      // keeps the credential alive between renewals.
      const expires = Date.parse(String(attributes?.expires));
      expect(
        Math.abs(expires - (Date.now() + DEFAULT_IDLE_TTL_MS)),
      ).toBeLessThan(60_000);

      const stored = await getOnlyStoredSession();
      expectRecent(stored.sess.auth?.renewedAt);
      // The absolute anchor is untouched by renewal: the cap cannot slide.
      expect(stored.sess.auth?.createdAt).toBe(createdAt);
      // Store expiry and cookie window move together.
      expect(stored.expired.getTime()).toBeGreaterThan(
        Date.now() + DEFAULT_IDLE_TTL_MS - 60_000,
      );
    });

    it('keeps the same session id when renewing', async () => {
      const { agent } = await registerUser(app);
      const { sid } = await getOnlyStoredSession();

      await setStoredAnchor(sid, {
        createdAt: Date.now() - 20 * ONE_DAY_IN_MS,
        renewedAt: Date.now() - 8 * ONE_DAY_IN_MS,
      });

      const response = await agent.get('/users/protec').expect(200);
      const cookie = readSessionCookie(response);

      expect(cookie).toBeDefined();
      expect(readSessionId(cookie!)).toBe(sid);
    });

    it('survives concurrent requests during a renewal window', async () => {
      const { agent } = await registerUser(app);
      const { sid } = await getOnlyStoredSession();

      await setStoredAnchor(sid, {
        createdAt: Date.now() - 20 * ONE_DAY_IN_MS,
        renewedAt: Date.now() - 8 * ONE_DAY_IN_MS,
      });

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => agent.get('/users/protec')),
      );
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // A renewal must never invalidate the session other requests are using.
      const afterwards = await agent.get('/users/protec').expect(200);
      expect(afterwards.body).toEqual({ myData: 'this is a secret' });
    });

    it('does not let a client talk its way past the absolute cap', async () => {
      const { agent } = await registerUser(app);
      const { sid } = await getOnlyStoredSession();

      // Active a minute ago, but signed in more than 60 days ago.
      await setStoredAnchor(sid, {
        createdAt: Date.now() - (DEFAULT_ABSOLUTE_TTL_MS + ONE_DAY_IN_MS),
        renewedAt: Date.now() - 60_000,
      });

      const response = await agent.get('/users/protec').expect(401);

      expectSessionExpired(response.body);
      expect(await getStoredSessions()).toHaveLength(0);
    });
  });

  describe('expiry', () => {
    it('revokes a session whose granted window has passed', async () => {
      const { agent } = await registerUser(app);
      const { sid } = await getOnlyStoredSession();

      await setStoredAnchor(sid, {
        createdAt: Date.now() - 20 * ONE_DAY_IN_MS,
        renewedAt: Date.now() - 20 * ONE_DAY_IN_MS,
      });
      await setStoredWindowExpiry(sid, new Date(Date.now() - ONE_DAY_IN_MS));

      const response = await agent.get('/users/protec').expect(401);

      expectSessionExpired(response.body);
      expect(await getStoredSessions()).toHaveLength(0);
    });

    it('reports a session the server no longer stores as ended', async () => {
      const { agent } = await registerUser(app);
      const { sid } = await getOnlyStoredSession();

      // Simulates an idle-out, a sign-out from another device, or a password
      // reset: the credential is gone server-side, the cookie is not.
      await getTestKnex()('user_sessions').where({ sid }).delete();

      const response = await agent.get('/users/protec').expect(401);
      expectSessionExpired(response.body);

      // The unauthenticated session probe keeps working (clients rely on it).
      const probe = await agent.get('/users/current').expect(200);
      expect(probe.body.data.user).toBeUndefined();
    });

    it('reports a session cookie whose signature was not issued by the server', async () => {
      await request(app.getHttpServer())
        .get('/users/protec')
        .set('Cookie', `${SESSION_COOKIE_NAME}=s%3Aforged-session-id.forged`)
        .expect(401)
        .expect((response) => {
          expectSessionExpired(response.body);
        });
    });
  });

  describe('sign-out and revocation', () => {
    it('deletes the session on sign-out and rejects the old cookie', async () => {
      const agent = request.agent(app.getHttpServer());
      const registered = await agent
        .post('/auth/register')
        .send(createUserPayload())
        .expect(201);
      const cookie = readSessionCookie(registered);
      expect(cookie).toBeDefined();

      await agent.delete('/auth/logout').expect(200);
      expect(await getStoredSessions()).toHaveLength(0);
      // The session that was actually signed in is tombstoned, so a request
      // that loaded it before the sign-out cannot write it back.
      expect(
        await getTestKnex()('revoked_sessions').where({
          sid: readSessionId(cookie!),
        }),
      ).toHaveLength(1);

      // The sign-out response cleared the cookie, so this client is simply
      // unauthenticated...
      await agent
        .get('/users/protec')
        .expect(401)
        .expect((response) => {
          expect(response.body).toMatchObject({
            error: { statusCode: 401, message: 'Not authenticated' },
          });
        });

      // ...but a client that kept the pre-sign-out cookie is told its session
      // ended, rather than that it never signed in.
      await request(app.getHttpServer())
        .get('/users/protec')
        .set('Cookie', cookie!)
        .expect(401)
        .expect((response) => {
          expectSessionExpired(response.body);
        });
    });

    it('records no tombstone for a cookie-less sign-out', async () => {
      // A client that never signed in is handed a throw-away session id by
      // express-session: it was never stored or issued to anyone, so there is
      // nothing to revoke and nothing to tombstone.
      await request(app.getHttpServer()).delete('/auth/logout').expect(200);

      expect(await getTestKnex()('revoked_sessions')).toHaveLength(0);
    });

    it('records no tombstone when signing out with a session the server no longer stores', async () => {
      const { agent } = await registerUser(app);
      const { sid } = await getOnlyStoredSession();

      // The credential is already dead server-side (idle-out, sign-out
      // elsewhere, or revocation) while the client still presents it. The
      // sign-out must still succeed, but the fresh throw-away id
      // express-session assigns for the unresolvable cookie is not tombstoned.
      await getTestKnex()('user_sessions').where({ sid }).delete();

      await agent.delete('/auth/logout').expect(200);

      expect(await getTestKnex()('revoked_sessions')).toHaveLength(0);
    });

    it('keeps a revoked session revoked if its row is written back', async () => {
      const agent = request.agent(app.getHttpServer());
      const registered = await agent
        .post('/auth/register')
        .send(createUserPayload())
        .expect(201);
      const cookie = readSessionCookie(registered);
      expect(cookie).toBeDefined();

      const stored = await getOnlyStoredSession();

      await agent.delete('/auth/logout').expect(200);

      // Simulates the request the sign-out raced with: it loaded the session
      // before the revocation and writes its copy back afterwards (the store's
      // `set` is an upsert, so it re-inserts a deleted row). Without the
      // tombstone this resurrects the signed-out session.
      await getTestKnex()('user_sessions').insert({
        sid: stored.sid,
        expired: new Date(Date.now() + ONE_DAY_IN_MS),
        sess: JSON.stringify(stored.sess),
      });

      await request(app.getHttpServer())
        .get('/users/protec')
        .set('Cookie', cookie!)
        .expect(401)
        .expect((response) => {
          expectSessionExpired(response.body);
        });

      // The resurrected row is removed again; the tombstone is what keeps the
      // id rejected.
      expect(await getStoredSessions()).toHaveLength(0);
      const tombstones = await getTestKnex()('revoked_sessions').where({
        sid: stored.sid,
      });
      expect(tombstones).toHaveLength(1);
    });

    it('revokes every session when the password is reset', async () => {
      const payload = createUserPayload();
      const { agent } = await registerUser(app, payload);

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: payload.email })
        .expect(200);

      const db = getTestKnex();
      const rawToken = 'known-reset-token-for-session-renewal';
      await db('users')
        .where({ email: payload.email })
        .update({
          password_reset_token: hashPasswordResetToken(rawToken),
          password_reset_expires: new Date(Date.now() + 60 * 60 * 1000),
        });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: rawToken, password: 'new-password-123' })
        .expect(200);

      const response = await agent.get('/users/protec').expect(401);
      expectSessionExpired(response.body);
      expect(await getStoredSessions()).toHaveLength(0);
    });
  });

  describe('sign-in', () => {
    it('rotates the session id, so a pre-sign-in session cannot be reused', async () => {
      const payload = createUserPayload();
      const agent = request.agent(app.getHttpServer());
      const registered = await agent
        .post('/auth/register')
        .send(payload)
        .expect(201);
      const registerCookie = readSessionCookie(registered);

      const login = await agent
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);
      const loginCookie = readSessionCookie(login);

      expect(registerCookie).toBeDefined();
      expect(loginCookie).toBeDefined();
      expect(readSessionId(loginCookie!)).not.toBe(
        readSessionId(registerCookie!),
      );

      // The pre-sign-in session is gone; only the new one exists and works.
      const stored = await getOnlyStoredSession();
      expect(stored.sid).toBe(readSessionId(loginCookie!));
      await request(app.getHttpServer())
        .get('/users/protec')
        .set('Cookie', registerCookie!)
        .expect(401)
        .expect((response) => {
          expectSessionExpired(response.body);
        });
      await agent.get('/users/protec').expect(200);
    });

    it('lets a client sign in again with an expired cookie still in its jar', async () => {
      const payload = createUserPayload();
      const { agent } = await registerUser(app, payload);
      const { sid } = await getOnlyStoredSession();

      // The session is past its absolute cap: the next protected request is
      // rejected and the row is revoked, but the client still holds the cookie.
      await setStoredAnchor(sid, {
        createdAt: Date.now() - (DEFAULT_ABSOLUTE_TTL_MS + ONE_DAY_IN_MS),
        renewedAt: Date.now() - ONE_DAY_IN_MS,
      });
      await agent.get('/users/protec').expect(401);

      // Signing in must not be blocked by the stale credential.
      await agent
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);
      await agent.get('/users/protec').expect(200);
      expect(await getStoredSessions()).toHaveLength(1);
    });

    it('records no tombstone for a sign-in with no prior session', async () => {
      // A cookie-less register/login makes express-session assign a throw-away
      // session id: it was neither stored nor issued to the client, so there is
      // no session to revoke and nothing to tombstone.
      await registerUser(app);

      expect(await getTestKnex()('revoked_sessions')).toHaveLength(0);
    });

    it('revokes the previous session when an account signs in again', async () => {
      const payload = createUserPayload();
      const { agent } = await registerUser(app, payload);
      const previous = await getOnlyStoredSession();

      await agent
        .post('/auth/login')
        .send({ email: payload.email, password: payload.password })
        .expect(200);

      // The replaced session is tombstoned, so a request still holding its
      // cookie cannot write the record back into a usable session.
      const tombstones = await getTestKnex()('revoked_sessions').where({
        sid: previous.sid,
      });
      expect(tombstones).toHaveLength(1);
    });
  });
});
