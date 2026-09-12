import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from '../helpers/create-test-app';
import { createUserPayload, registerUser } from '../helpers/auth-helpers';
import {
  getOnlyStoredSession,
  readSessionCookie,
} from '../helpers/session-helpers';

/**
 * Same behaviour as `session-renewal.e2e-spec.ts`, but driven by real elapsed
 * time against deliberately short windows instead of a rewound session record.
 * Short windows are configured through the environment, so the test exercises
 * the real `configureApp` wiring.
 */
const IDLE_TTL_MS = 3000;
const HALFWAY_MS = IDLE_TTL_MS / 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Session windows (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.SESSION_IDLE_TTL_MS = String(IDLE_TTL_MS);
    process.env.SESSION_ABSOLUTE_TTL_MS = String(60 * 60 * 1000);
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
    // `--runInBand` shares one process across suites: never leak the override.
    delete process.env.SESSION_IDLE_TTL_MS;
    delete process.env.SESSION_ABSOLUTE_TTL_MS;
  });

  it('issues the configured idle window with the session cookie', async () => {
    const { agent } = await registerUser(app);
    const stored = await getOnlyStoredSession();

    expect(stored.expired.getTime()).toBeGreaterThan(Date.now());
    expect(stored.expired.getTime()).toBeLessThanOrEqual(
      Date.now() + IDLE_TTL_MS,
    );

    await agent.get('/users/protec').expect(200);
  });

  it('keeps an active session alive and renews it after halfway', async () => {
    const { agent } = await registerUser(app);

    await sleep(HALFWAY_MS + 200);

    const renewed = await agent.get('/users/protec').expect(200);
    const attributes = renewed.headers['set-cookie'] as unknown as
      string[] | undefined;
    const cookie = (attributes ?? []).find((value) =>
      value.startsWith('connect.sid='),
    );
    expect(cookie).toBeDefined();

    // The client is handed a full window again...
    const expires = /Expires=([^;]+)/.exec(cookie ?? '');
    expect(expires).not.toBeNull();
    expect(
      Math.abs(Date.parse(expires![1]) - (Date.now() + IDLE_TTL_MS)),
    ).toBeLessThan(1000);
    // ...and the server keeps the same session, not a new one.
    const stored = await getOnlyStoredSession();
    expect(stored.expired.getTime()).toBeGreaterThan(
      Date.now() + IDLE_TTL_MS - 1000,
    );

    await agent.get('/users/protec').expect(200);
  });

  it('expires a session that goes idle for longer than the window', async () => {
    const agent = request.agent(app.getHttpServer());
    const registered = await agent
      .post('/auth/register')
      .send(createUserPayload())
      .expect(201);
    const cookie = readSessionCookie(registered);
    expect(cookie).toBeDefined();
    await agent.get('/users/protec').expect(200);

    await sleep(IDLE_TTL_MS + 500);

    // The client's own cookie has expired by now, so it stops sending it and
    // the request is simply unauthenticated...
    await agent.get('/users/protec').expect(401);
    const probe = await agent.get('/users/current').expect(200);
    expect(probe.body.data.user).toBeUndefined();

    // ...while a client that still presents the dead credential is told the
    // session ended.
    await request(app.getHttpServer())
      .get('/users/protec')
      .set('Cookie', cookie!)
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({
          error: { code: 'SESSION_EXPIRED' },
        });
      });
  });
});
