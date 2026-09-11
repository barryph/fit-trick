import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp } from '../helpers/create-test-app';
import { registerAndLogin } from '../helpers/auth-helpers';

const TODAY = '2026-08-05';

describe('Goals (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/goals').expect(401);
    await request(app.getHttpServer()).get(`/goals/1`).expect(401);
  });

  it('rejects a missing or invalid today query', async () => {
    const { agent } = await registerAndLogin(app);

    await agent.get('/goals').expect(400);
    await agent.get('/goals?today=not-a-date').expect(400);
  });

  it('tracks current-week completion progress for goals', async () => {
    const { agent } = await registerAndLogin(app);

    const createResponse = await agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ name: 'Squats', interval: 3, goalTargetPerWeek: 3 })
      .expect(201);
    const activityId = createResponse.body.data.activity.id;

    const listResponse = await agent.get(`/goals?today=${TODAY}`).expect(200);
    expect(listResponse.body.data.goals).toEqual([
      expect.objectContaining({
        activityId,
        activityName: 'Squats',
        targetPerWeek: 3,
        currentWeekCount: 0,
      }),
    ]);

    await agent
      .post(`/activities/${activityId}/complete`)
      .send({ date: '2026-08-03' })
      .query({ today: TODAY })
      .expect(201);
    await agent
      .post(`/activities/${activityId}/complete`)
      .send({ date: '2026-08-04' })
      .query({ today: TODAY })
      .expect(201);

    const progressResponse = await agent
      .get(`/goals?today=${TODAY}`)
      .expect(200);
    expect(progressResponse.body.data.goals[0].currentWeekCount).toBe(2);
  });

  it('returns goal-specific stats', async () => {
    const { agent } = await registerAndLogin(app);

    const createResponse = await agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ name: 'Running', interval: 1, goalTargetPerWeek: 4 })
      .expect(201);
    const activityId = createResponse.body.data.activity.id;

    await agent
      .post(`/activities/${activityId}/complete`)
      .send({ date: '2026-08-03' })
      .query({ today: TODAY })
      .expect(201);
    await agent
      .post(`/activities/${activityId}/complete`)
      .send({ date: '2026-08-04' })
      .query({ today: TODAY })
      .expect(201);

    const statsResponse = await agent
      .get(`/goals/${activityId}?today=${TODAY}`)
      .expect(200);
    const stats = statsResponse.body.data;

    expect(stats.activityName).toBe('Running');
    expect(stats.goal.targetPerWeek).toBe(4);
    expect(stats.currentWeekCount).toBe(2);
    expect(stats.weeklyPerformance.at(-1)).toEqual({
      weekStart: '2026-08-03',
      count: 2,
    });
    expect(stats.adherence.applicable).toBe(1);
    expect(stats.adherence.met).toBe(0);
    expect(stats.adherence.percentage).toBe(0);
    expect(stats.heatmap.at(-1)).toEqual({
      weekStart: '2026-08-03',
      count: 2,
    });
  });

  it('updates and clears the goal when editing the activity', async () => {
    const { agent } = await registerAndLogin(app);

    const createResponse = await agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ name: 'Push-ups', interval: 3, goalTargetPerWeek: 3 })
      .expect(201);
    const activityId = createResponse.body.data.activity.id;

    await agent
      .put(`/activities/edit/${activityId}`)
      .send({ goalTargetPerWeek: 5 })
      .query({ today: TODAY })
      .expect(200);

    const updated = await agent.get(`/goals?today=${TODAY}`).expect(200);
    expect(updated.body.data.goals[0].targetPerWeek).toBe(5);

    await agent
      .put(`/activities/edit/${activityId}`)
      .send({ goalTargetPerWeek: null })
      .query({ today: TODAY })
      .expect(200);

    const cleared = await agent.get(`/goals?today=${TODAY}`).expect(200);
    expect(cleared.body.data.goals).toEqual([]);
  });

  it('cascades goal deletion when the activity is deleted', async () => {
    const { agent } = await registerAndLogin(app);

    const createResponse = await agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ name: 'Planks', interval: 3, goalTargetPerWeek: 2 })
      .expect(201);
    const activityId = createResponse.body.data.activity.id;

    await agent
      .delete(`/activities/${activityId}`)
      .query({ today: TODAY })
      .expect(200);

    const list = await agent.get(`/goals?today=${TODAY}`).expect(200);
    expect(list.body.data.goals).toEqual([]);
    await agent.get(`/goals/${activityId}?today=${TODAY}`).expect(404);
  });

  it('does not expose another user goal stats', async () => {
    const owner = await registerAndLogin(app);
    const createResponse = await owner.agent
      .post('/activities')
      .query({ today: TODAY })
      .send({ name: 'Hidden', interval: 3, goalTargetPerWeek: 3 })
      .expect(201);
    const activityId = createResponse.body.data.activity.id;

    const intruder = await registerAndLogin(app, {
      email: `goals-intruder-${Date.now()}@example.com`,
    });

    await intruder.agent.get(`/goals/${activityId}?today=${TODAY}`).expect(404);
  });
});
