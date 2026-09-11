import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../../../shared/knex/database.module';
import ActivitiesRepo from './activities.repository';
import ActivityEventRepo from './activityEvent.repository';
import { KnexService } from '../../../shared/knex/knex.service';
import { insertUserWithKnex } from '../../../../test/factories/user.factory';
import { insertActivity } from '../../../../test/factories/activity.factory';
import {
  buildActivityEvent,
  insertActivityEvent,
} from '../../../../test/factories/activity-event.factory';
import { DuplicateActivityEventError } from '../activitiyEvent.errors';
import Activity from '../domain/activity.entity';
import { GetActivityByIdQuery } from '../queries/getActivityById.query';
import { getGoalWeekRange } from '../../activity-goals/domain/goal-performance.calculator';

/**
 * The client's calendar date. Deliberately a Monday that is not "today" in any
 * timezone, so a value taken from the server clock or a database session could
 * not coincide with it.
 */
const TODAY = '2026-03-02';

describe('ActivitiesRepo (integration)', () => {
  let activitiesRepo: ActivitiesRepo;
  let knexService: KnexService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [ActivitiesRepo],
    }).compile();

    activitiesRepo = moduleRef.get(ActivitiesRepo);
    knexService = moduleRef.get(KnexService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('persists and retrieves an activity', async () => {
    const user = await insertUserWithKnex(knexService);
    const userId = user.id as string;
    const activity = await insertActivity(knexService, {
      userId,
      name: 'Back Squat',
      interval: 3,
      ticker: 'SQUT',
    });

    const found = await activitiesRepo.getById(activity.id as string, TODAY);
    expect(found?.name).toBe('Back Squat');
    expect(found?.ticker?.value).toBe('SQUT');
  });

  /**
   * `daysUntil` is the product rule "interval days between completions", so it
   * has to be derived from the activity's completions and the caller's own
   * date. It previously came back as a hardcoded 0 on this path, which read as
   * "due now" for every activity regardless of its history.
   */
  describe('daysUntil', () => {
    it('is 0 for an activity that has never been completed', async () => {
      const user = await insertUserWithKnex(knexService);
      const activity = await insertActivity(knexService, {
        userId: user.id as string,
        interval: 7,
      });

      const loaded = await activitiesRepo.getById(activity.id as string, TODAY);

      expect(loaded?.daysUntil).toBe(0);
    });

    it('counts down from the most recent completion', async () => {
      const user = await insertUserWithKnex(knexService);
      const activity = await insertActivity(knexService, {
        userId: user.id as string,
        interval: 7,
      });
      const activityId = activity.id as string;

      // Two completions; only the most recent one sets the countdown.
      await insertActivityEvent(knexService, {
        activityId,
        date: '2026-02-01',
      });
      await insertActivityEvent(knexService, {
        activityId,
        date: '2026-02-27',
      });

      const loaded = await activitiesRepo.getById(activityId, TODAY);

      // 7-day interval, completed 3 days ago.
      expect(loaded?.daysUntil).toBe(4);
    });

    it("is relative to the caller's date, not the database clock", async () => {
      const user = await insertUserWithKnex(knexService);
      const activity = await insertActivity(knexService, {
        userId: user.id as string,
        interval: 7,
      });
      const activityId = activity.id as string;
      await insertActivityEvent(knexService, {
        activityId,
        date: '2026-03-01',
      });

      // One client day later the same row must be exactly one day closer.
      // A `CURRENT_DATE`-based value would not move at all, and a hardcoded 0
      // would report the same number for both.
      await expect(
        activitiesRepo.getById(activityId, '2026-03-02'),
      ).resolves.toMatchObject({ props: { daysUntil: 6 } });
      await expect(
        activitiesRepo.getById(activityId, '2026-03-03'),
      ).resolves.toMatchObject({ props: { daysUntil: 5 } });
    });

    it('clamps to 0 once the interval has passed', async () => {
      const user = await insertUserWithKnex(knexService);
      const activity = await insertActivity(knexService, {
        userId: user.id as string,
        interval: 3,
      });
      await insertActivityEvent(knexService, {
        activityId: activity.id as string,
        date: '2026-01-01',
      });

      const loaded = await activitiesRepo.getById(activity.id as string, TODAY);

      expect(loaded?.daysUntil).toBe(0);
    });

    it('is recomputed when the activity is updated', async () => {
      const user = await insertUserWithKnex(knexService);
      const userId = user.id as string;
      const activity = await insertActivity(knexService, {
        userId,
        name: 'Squats',
        interval: 7,
      });
      const activityId = activity.id as string;
      await insertActivityEvent(knexService, {
        activityId,
        date: '2026-03-01',
      });

      const updated = await activitiesRepo.update(
        Activity.reconstitute({
          id: activityId,
          userId,
          name: 'Front Squat',
          interval: 7,
        }),
        TODAY,
      );

      expect(updated.name).toBe('Front Squat');
      // The update response used to report a hardcoded 0.
      expect(updated.daysUntil).toBe(6);
    });

    it('matches the value the read model returns for the same activity', async () => {
      const user = await insertUserWithKnex(knexService);
      const userId = user.id as string;
      const activity = await insertActivity(knexService, {
        userId,
        interval: 7,
        ticker: 'SQUT',
      });
      const activityId = activity.id as string;
      await insertActivityEvent(knexService, {
        activityId,
        date: '2026-02-27',
      });

      const repoValue = await activitiesRepo.getById(activityId, TODAY);
      const dto = await new GetActivityByIdQuery(knexService).execute(
        activityId,
        userId,
        getGoalWeekRange(TODAY),
        TODAY,
      );

      // One definition of the rule, so every path reports the same countdown.
      expect(dto.daysUntil).toBe(repoValue?.daysUntil);
      expect(dto.daysUntil).toBe(4);
    });
  });
});

describe('ActivityEventRepo (integration)', () => {
  let activityEventRepo: ActivityEventRepo;
  let knexService: KnexService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
      providers: [ActivityEventRepo],
    }).compile();

    activityEventRepo = moduleRef.get(ActivityEventRepo);
    knexService = moduleRef.get(KnexService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('rejects duplicate events for the same activity and date', async () => {
    const user = await insertUserWithKnex(knexService);
    const userId = user.id as string;
    const activity = await insertActivity(knexService, { userId });
    const activityId = activity.id as string;

    const event = buildActivityEvent({
      activityId,
      date: '2026-03-01',
    });
    await activityEventRepo.create(event);

    await expect(activityEventRepo.create(event)).rejects.toThrow(
      DuplicateActivityEventError,
    );
  });
});
