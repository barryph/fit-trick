import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from '../helpers/create-test-app';
import { registerAndLogin } from '../helpers/auth-helpers';

/**
 * The client's own calendar date, sent as `?today=`.
 *
 * The API host and the database run on UTC (see `knexfile.ts`), which is only
 * one of the many timezones the app is used from - so every date-derived
 * response has to follow this value rather than any clock the server owns.
 */
const TODAY = '2026-03-02'; // A Monday, deliberately not the seeded/current date.

describe('Activities (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/activities').expect(401);
  });

  it('requires the client date on date-sensitive endpoints', async () => {
    const { agent } = await registerAndLogin(app);

    // No server-side substitute exists for the user's calendar date, so a
    // missing one is a client error rather than a guessed answer.
    await agent.get('/activities').expect(400);
    await agent.get(`/activities?today=${TODAY}`).expect(200);

    await agent
      .post('/activities')
      .send({ name: 'No date', interval: 3 })
      .expect(400);

    // The month scoping the timeline is validated for the same reason.
    await agent.get('/activities/timeline').expect(400);
    await agent
      .get('/activities/timeline')
      .query({ month: '2026-03' })
      .expect(200);

    // Authenticated but nonexistent: the date check happens first.
    await agent.get(`/activities/9999?today=not-a-date`).expect(400);
  });

  it('runs the full habit lifecycle', async () => {
    const { agent } = await registerAndLogin(app);

    const categoryResponse = await agent
      .post('/categories')
      .send({ name: 'Health', color: '#ff0000' })
      .expect(201);
    const categoryId = categoryResponse.body.data.category.id;

    const createResponse = await agent
      .post('/activities')
      .query({ today: TODAY })
      .send({
        name: 'Back Squat',
        ticker: 'SQUT',
        interval: 3,
        categoryId: Number(categoryId),
        lastDone: '2026-01-10',
      })
      .expect(201);

    const activityId = createResponse.body.data.activity.id;

    const listResponse = await agent
      .get('/activities')
      .query({ today: TODAY })
      .expect(200);
    expect(listResponse.body.data.activities).toHaveLength(1);
    expect(listResponse.body.data.activities[0].category.name).toBe('Health');

    await agent
      .post(`/activities/${activityId}/complete`)
      .query({ today: TODAY })
      .send({ date: '2026-03-01' })
      .expect(201);

    await agent
      .post(`/activities/${activityId}/complete`)
      .query({ today: TODAY })
      .send({ date: '2026-03-01' })
      .expect(409);

    const timelineResponse = await agent
      .get('/activities/timeline')
      .query({ month: '2026-03' })
      .expect(200);
    expect(timelineResponse.body.data.timeline[activityId]).toContain(
      '2026-03-01',
    );

    const undoResponse = await agent
      .post(`/activities/${activityId}/undo`)
      .query({ today: TODAY })
      .send({ date: '2026-03-01' })
      .expect(201);
    expect(undoResponse.body.data.activity).toBeDefined();
    expect(undoResponse.body.data.activity.id).toBe(activityId);

    await agent
      .put(`/activities/edit/${activityId}`)
      .query({ today: TODAY })
      .send({ name: 'Front Squat', ticker: 'FSQT' })
      .expect(200);

    const detailResponse = await agent
      .get(`/activities/${activityId}`)
      .query({ today: TODAY })
      .expect(200);
    expect(detailResponse.body.data.activity.name).toBe('Front Squat');

    await agent
      .delete(`/activities/${activityId}`)
      .query({ today: TODAY })
      .expect(200);

    const emptyList = await agent
      .get('/activities')
      .query({ today: TODAY })
      .expect(200);
    expect(emptyList.body.data.activities).toHaveLength(0);
  });

  /**
   * The bug this guards against: anchoring `daysUntil` (and the goal week) to
   * the database's `CURRENT_DATE`. For a user whose local date is ahead of the
   * server's, that silently shifts every countdown by a day.
   */
  it("anchors the countdown to the client's calendar date, not the server's", async () => {
    const { agent } = await registerAndLogin(app);

    // UTC+13 client at 09:00 local: the API host and Postgres are still on the
    // previous UTC day. Last completion is the client's yesterday.
    const clientToday = '2026-03-02'; // Monday
    const clientYesterday = '2026-03-01'; // Sunday

    const createResponse = await agent
      .post('/activities')
      .query({ today: clientToday })
      .send({
        name: 'Timezone Sensitive',
        interval: 3,
        lastDone: clientYesterday,
      })
      .expect(201);

    // 3-day interval, completed 1 day ago -> 2 days remaining.
    expect(createResponse.body.data.activity.daysUntil).toBe(2);

    const activityId = createResponse.body.data.activity.id;

    const list = await agent
      .get('/activities')
      .query({ today: clientToday })
      .expect(200);
    expect(list.body.data.activities[0].daysUntil).toBe(2);

    // One client day later the same activity must be exactly one day closer.
    // A value anchored to the database clock would not move at all.
    const nextDay = await agent
      .get('/activities')
      .query({ today: '2026-03-03' })
      .expect(200);
    expect(nextDay.body.data.activities[0].daysUntil).toBe(1);

    // The completion itself stays on the client's calendar date, not shifted
    // into the neighbouring day by the server's offset.
    const detail = await agent
      .get(`/activities/${activityId}`)
      .query({ today: clientToday })
      .expect(200);
    expect(detail.body.data.activity.daysUntil).toBe(2);

    const events = await agent
      .get('/activities/events')
      .query({ from: '2026-03-01', to: '2026-03-02' })
      .expect(200);
    expect(events.body.data.events).toHaveLength(1);
    expect(String(events.body.data.events[0].activityId)).toBe(
      String(activityId),
    );
    expect(events.body.data.events[0].date).toBe(clientYesterday);
  });

  it("uses the client's Monday week for goal progress", async () => {
    const { agent } = await registerAndLogin(app);

    const createResponse = await agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ name: 'Weekly', interval: 1, goalTargetPerWeek: 2 })
      .expect(201);
    const activityId = createResponse.body.data.activity.id;

    // Sunday of the client's previous week and Monday of the client's current
    // week: only the Monday completion belongs to the week containing TODAY.
    await agent
      .post(`/activities/${activityId}/complete`)
      .query({ today: TODAY })
      .send({ date: '2026-03-01' })
      .expect(201);
    await agent
      .post(`/activities/${activityId}/complete`)
      .query({ today: TODAY })
      .send({ date: '2026-03-02' })
      .expect(201);

    const goals = await agent.get('/goals').query({ today: TODAY }).expect(200);
    expect(goals.body.data.goals[0].currentWeekCount).toBe(1);
  });

  it('prevents another user from accessing the activity', async () => {
    const owner = await registerAndLogin(app);
    const createResponse = await owner.agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ name: 'Private Activity', interval: 3 })
      .expect(201);
    const activityId = createResponse.body.data.activity.id;

    const intruder = await registerAndLogin(app, {
      email: `intruder-${Date.now()}@example.com`,
    });

    await intruder.agent
      .get(`/activities/${activityId}`)
      .query({ today: TODAY })
      .expect(401);
    await intruder.agent
      .post(`/activities/${activityId}/complete`)
      .query({ today: TODAY })
      .send({ date: '2026-03-01' })
      .expect(401);

    expect(owner.user.id).not.toBe(intruder.user.id);
  });

  it('rejects invalid activity payloads', async () => {
    const { agent } = await registerAndLogin(app);

    await agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ interval: 3 })
      .expect(400);
  });
});
