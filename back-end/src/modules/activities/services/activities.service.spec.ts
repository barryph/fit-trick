import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import ActivitiesRepo from '../repos/activities.repository';
import ActivityEventRepo from '../repos/activityEvent.repository';
import CategoriesRepo from '../../categories/repos/categories.repository';
import { GetActivitiesByUserIdQuery } from '../queries/getActivitiesByUserId.query';
import { GetActivityByIdQuery } from '../queries/getActivityById.query';
import { GetActivityTimelineQuery } from '../queries/getActivityTimeline.query';
import { GetActivityEventsQuery } from '../queries/getActivityEvents.query';
import Activity from '../domain/activity.entity';
import ActivityEvent from '../domain/activityEvent.entity';
import Category from '../../categories/domain/category.entity';
import { DuplicateActivityEventError } from '../activitiyEvent.errors';
import { KnexService } from 'src/shared/knex/knex.service';
import ActivityGoalsRepo from '../../activity-goals/repos/activityGoals.repository';
import ActivityGoal from '../../activity-goals/domain/activityGoal.entity';
import { withoutAmbientTime } from 'src/shared/testing/local-time-guard';

/**
 * The client's *local* calendar date, sent as `?today=`.
 *
 * Every date-sensitive call must carry it: the API is not allowed to fall back
 * to the server clock or the database session's timezone, because for part of
 * every day those disagree with the user's own date.
 */
const TODAY = '2026-01-15';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activitiesRepo: jest.Mocked<ActivitiesRepo>;
  let activityEventRepo: jest.Mocked<ActivityEventRepo>;
  let categoriesRepo: jest.Mocked<CategoriesRepo>;
  let getActivityByIdQuery: jest.Mocked<GetActivityByIdQuery>;
  let getActivitiesByUserIdQuery: jest.Mocked<GetActivitiesByUserIdQuery>;
  let activityGoalsRepo: jest.Mocked<ActivityGoalsRepo>;
  let knexService: jest.Mocked<KnexService>;

  const activityDto = {
    id: '1',
    userId: 'user-1',
    name: 'Exercise',
    interval: 7,
    daysUntil: 7,
  };

  beforeEach(async () => {
    activitiesRepo = {
      create: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ActivitiesRepo>;

    activityEventRepo = {
      create: jest.fn(),
      removeByActivityIdAndDate: jest.fn(),
      removeByActivityId: jest.fn(),
    } as unknown as jest.Mocked<ActivityEventRepo>;

    categoriesRepo = {
      getByIdAndUser: jest.fn(),
    } as unknown as jest.Mocked<CategoriesRepo>;

    getActivityByIdQuery = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetActivityByIdQuery>;

    getActivitiesByUserIdQuery = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetActivitiesByUserIdQuery>;

    activityGoalsRepo = {
      create: jest.fn(),
      getByActivityId: jest.fn(),
      update: jest.fn(),
      deleteByActivityId: jest.fn(),
    } as unknown as jest.Mocked<ActivityGoalsRepo>;

    knexService = {
      connection: {
        transaction: jest.fn((cb: (trx: unknown) => Promise<unknown>) =>
          cb('trx'),
        ),
      },
    } as unknown as jest.Mocked<KnexService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: ActivitiesRepo, useValue: activitiesRepo },
        { provide: ActivityEventRepo, useValue: activityEventRepo },
        { provide: CategoriesRepo, useValue: categoriesRepo },
        {
          provide: GetActivitiesByUserIdQuery,
          useValue: getActivitiesByUserIdQuery,
        },
        { provide: GetActivityByIdQuery, useValue: getActivityByIdQuery },
        {
          provide: GetActivityTimelineQuery,
          useValue: { execute: jest.fn() },
        },
        {
          provide: GetActivityEventsQuery,
          useValue: { execute: jest.fn() },
        },
        { provide: KnexService, useValue: knexService },
        { provide: ActivityGoalsRepo, useValue: activityGoalsRepo },
      ],
    }).compile();

    service = module.get(ActivitiesService);
  });

  it('rejects create when category does not belong to user', async () => {
    categoriesRepo.getByIdAndUser.mockResolvedValue(null);

    await expect(
      service.create(
        { name: 'Exercise', interval: 7, categoryId: 1 },
        'user-1',
        TODAY,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates activity and optional lastDone event', async () => {
    categoriesRepo.getByIdAndUser.mockResolvedValue(
      Category.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Health',
        color: '#ff0000',
      }),
    );
    const created = Activity.reconstitute({
      id: '1',
      userId: 'user-1',
      name: 'Exercise',
      interval: 7,
      categoryId: 1,
    });
    activitiesRepo.create.mockResolvedValue(created);
    getActivityByIdQuery.execute.mockResolvedValue(activityDto);

    const result = await service.create(
      {
        name: 'Exercise',
        interval: 7,
        categoryId: 1,
        lastDone: '2026-01-15',
      },
      'user-1',
      TODAY,
    );

    expect(activityEventRepo.create).toHaveBeenCalled();
    expect(result.name).toBe('Exercise');
  });

  it('rejects complete when user does not own activity', async () => {
    activitiesRepo.getById.mockResolvedValue(
      Activity.reconstitute({
        id: '1',
        userId: 'other-user',
        name: 'Exercise',
        interval: 7,
      }),
    );

    await expect(
      service.completeActivity('1', 'user-1', '2026-01-15', TODAY),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects duplicate complete on same date', async () => {
    activitiesRepo.getById.mockResolvedValue(
      Activity.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Exercise',
        interval: 7,
      }),
    );
    activityEventRepo.create.mockRejectedValue(
      new DuplicateActivityEventError(),
    );

    await expect(
      service.completeActivity('1', 'user-1', '2026-01-15', TODAY),
    ).rejects.toThrow(ConflictException);
  });

  it('deletes events before deleting activity', async () => {
    activitiesRepo.getById.mockResolvedValue(
      Activity.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Exercise',
        interval: 7,
      }),
    );

    await service.deleteActivity('1', 'user-1', TODAY);

    expect(activityEventRepo.removeByActivityId).toHaveBeenCalledWith('1');
    expect(activitiesRepo.delete).toHaveBeenCalledWith('1');
  });

  it('creates an activity goal atomically with the activity', async () => {
    const created = Activity.reconstitute({
      id: '1',
      userId: 'user-1',
      name: 'Exercise',
      interval: 7,
    });
    activitiesRepo.create.mockResolvedValue(created);
    getActivityByIdQuery.execute.mockResolvedValue(activityDto);

    await service.create(
      { name: 'Exercise', interval: 7, goalTargetPerWeek: 3 },
      'user-1',
      TODAY,
    );

    expect(activitiesRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      TODAY,
      expect.anything(),
    );
    expect(activityGoalsRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    );
    const goalArg = activityGoalsRepo.create.mock.calls[0][0];
    expect(goalArg.activityId).toBe('1');
    expect(goalArg.targetPerWeek).toBe(3);
  });

  it('updates an existing goal when editing an activity', async () => {
    activitiesRepo.getById.mockResolvedValue(
      Activity.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Exercise',
        interval: 7,
      }),
    );
    activityGoalsRepo.getByActivityId.mockResolvedValue(
      ActivityGoal.reconstitute({
        id: 'g1',
        activityId: '1',
        targetPerWeek: 3,
      }),
    );
    getActivityByIdQuery.execute.mockResolvedValue(activityDto);

    await service.editActivity('1', { goalTargetPerWeek: 5 }, 'user-1', TODAY);

    expect(activityGoalsRepo.update).toHaveBeenCalled();
    const updatedGoal = activityGoalsRepo.update.mock.calls[0][0];
    expect(updatedGoal.targetPerWeek).toBe(5);
  });

  it('creates a goal when editing an activity without one', async () => {
    activitiesRepo.getById.mockResolvedValue(
      Activity.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Exercise',
        interval: 7,
      }),
    );
    activityGoalsRepo.getByActivityId.mockResolvedValue(null);
    getActivityByIdQuery.execute.mockResolvedValue(activityDto);

    await service.editActivity('1', { goalTargetPerWeek: 4 }, 'user-1', TODAY);

    expect(activityGoalsRepo.create).toHaveBeenCalled();
  });

  it('removes the goal when goalTargetPerWeek is null', async () => {
    activitiesRepo.getById.mockResolvedValue(
      Activity.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Exercise',
        interval: 7,
      }),
    );
    getActivityByIdQuery.execute.mockResolvedValue(activityDto);

    await service.editActivity(
      '1',
      { goalTargetPerWeek: null },
      'user-1',
      TODAY,
    );

    expect(activityGoalsRepo.deleteByActivityId).toHaveBeenCalledWith(
      '1',
      expect.anything(),
    );
  });

  it('deletes the goal when deleting the activity', async () => {
    activitiesRepo.getById.mockResolvedValue(
      Activity.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Exercise',
        interval: 7,
      }),
    );

    await service.deleteActivity('1', 'user-1', TODAY);

    expect(activityGoalsRepo.deleteByActivityId).toHaveBeenCalledWith('1');
    expect(activityEventRepo.removeByActivityId).toHaveBeenCalledWith('1');
    expect(activitiesRepo.delete).toHaveBeenCalledWith('1');
  });

  /**
   * The client and the API host are frequently in different timezones (and
   * genuinely on different calendar dates), so every date-derived value must
   * come from the client's `today` and never from a clock the server owns.
   */
  describe('client timezone ownership', () => {
    const activity = () =>
      Activity.reconstitute({
        id: '1',
        userId: 'user-1',
        name: 'Exercise',
        interval: 7,
      });

    it('derives the goal week range from the client date, not the server clock', async () => {
      activitiesRepo.getById.mockResolvedValue(activity());
      getActivityByIdQuery.execute.mockResolvedValue(activityDto);

      // A Sunday for the client. A server on UTC (or one still on the previous
      // day) would compute the week starting 2026-01-12 and a "this week"
      // window that does not contain 2026-01-18 at all.
      await service.getById('1', 'user-1', '2026-01-18');

      expect(getActivityByIdQuery.execute).toHaveBeenCalledWith(
        '1',
        'user-1',
        { from: '2026-01-12', to: '2026-01-18' },
        '2026-01-18',
      );
    });

    it('uses the client date for the Monday week that is already in the future for the server', async () => {
      activitiesRepo.getById.mockResolvedValue(activity());
      getActivityByIdQuery.execute.mockResolvedValue(activityDto);

      // UTC+13 client whose day has already rolled over: the API host (and the
      // database) is on 2026-03-01 while the user is on 2026-03-02, a Monday.
      await service.getById('1', 'user-1', '2026-03-02');

      expect(getActivityByIdQuery.execute).toHaveBeenCalledWith(
        '1',
        'user-1',
        { from: '2026-03-02', to: '2026-03-08' },
        '2026-03-02',
      );
    });

    it('passes the client date through on every read path', async () => {
      getActivitiesByUserIdQuery.execute.mockResolvedValue([]);
      activitiesRepo.getById.mockResolvedValue(activity());
      getActivityByIdQuery.execute.mockResolvedValue(activityDto);
      activitiesRepo.create.mockResolvedValue(activity());
      activityEventRepo.create.mockResolvedValue(
        ActivityEvent.reconstitute({
          id: 'e1',
          activityId: '1',
          date: TODAY,
        }),
      );

      await service.getAllByUserId('user-1', TODAY);
      await service.create({ name: 'Exercise', interval: 7 }, 'user-1', TODAY);
      await service.getById('1', 'user-1', TODAY);
      await service.editActivity('1', { name: 'Run' }, 'user-1', TODAY);
      await service.completeActivity('1', 'user-1', TODAY, TODAY);
      await service.undoActivityEvent('1', 'user-1', TODAY, TODAY);

      const weekRange = { from: '2026-01-12', to: '2026-01-18' };
      for (const call of getActivityByIdQuery.execute.mock.calls) {
        expect(call[2]).toEqual(weekRange);
        expect(call[3]).toBe(TODAY);
      }
      expect(getActivitiesByUserIdQuery.execute).toHaveBeenCalledWith(
        'user-1',
        weekRange,
        TODAY,
      );
    });

    it('never reads the server clock while serving a request', async () => {
      // The API host and the database session each run on their own timezone, so
      // any date derived from them is the wrong calendar date for most of the
      // world. Prove it by making every ambient reading throw: the service must
      // still answer from the client's `today` alone.
      getActivitiesByUserIdQuery.execute.mockResolvedValue([]);
      activitiesRepo.getById.mockResolvedValue(activity());
      getActivityByIdQuery.execute.mockResolvedValue(activityDto);
      activitiesRepo.create.mockResolvedValue(activity());

      await withoutAmbientTime(async () => {
        await service.getAllByUserId('user-1', TODAY);
        await service.getById('1', 'user-1', TODAY);
        await service.create(
          { name: 'Exercise', interval: 7 },
          'user-1',
          TODAY,
        );
        await service.editActivity('1', { name: 'Run' }, 'user-1', TODAY);
        await service.completeActivity('1', 'user-1', TODAY, TODAY);
        await service.undoActivityEvent('1', 'user-1', TODAY, TODAY);
        await service.deleteActivity('1', 'user-1', TODAY);
      });
    });

    it('hands the client date to every repository call that computes a countdown', async () => {
      activitiesRepo.getById.mockResolvedValue(activity());
      getActivityByIdQuery.execute.mockResolvedValue(activityDto);
      activitiesRepo.create.mockResolvedValue(activity());

      await service.create({ name: 'Exercise', interval: 7 }, 'user-1', TODAY);
      await service.editActivity('1', { name: 'Run' }, 'user-1', TODAY);
      await service.completeActivity('1', 'user-1', TODAY, TODAY);
      await service.undoActivityEvent('1', 'user-1', TODAY, TODAY);
      await service.deleteActivity('1', 'user-1', TODAY);

      // `daysUntil` is only meaningful relative to a date, so every load and
      // write on this path has to carry the client's.
      expect(activitiesRepo.getById.mock.calls.length).toBeGreaterThan(0);
      for (const call of activitiesRepo.getById.mock.calls) {
        expect(call).toEqual(['1', TODAY]);
      }
      expect(activitiesRepo.create).toHaveBeenCalledWith(
        expect.anything(),
        TODAY,
      );
      expect(activitiesRepo.update).toHaveBeenCalledWith(
        expect.anything(),
        TODAY,
      );
    });
  });
});
