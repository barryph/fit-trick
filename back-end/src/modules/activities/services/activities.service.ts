import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import Activity from '../domain/activity.entity';
import ActivityTicker from '../domain/activityTicker.vo';
import CreateActivityDTO from '../dtos/createActivity.dto';
import ActivitiesRepo from '../repos/activities.repository';
import ActivityEventRepo from '../repos/activityEvent.repository';
import CategoriesRepo from '../../categories/repos/categories.repository';
import { DuplicateActivityEventError } from '../activitiyEvent.errors';
import ActivityEvent from '../domain/activityEvent.entity';
import { GetActivitiesByUserIdQuery } from '../queries/getActivitiesByUserId.query';
import { GetActivityByIdQuery } from '../queries/getActivityById.query';
import { GetActivityTimelineQuery } from '../queries/getActivityTimeline.query';
import { GetActivityEventsQuery } from '../queries/getActivityEvents.query';
import EditActivityDTO from '../dtos/editActivity.dto';
import { ActivityWithCategoryDTO } from '../dtos/activityWithCategory.dto';
import { ActivityTimelineDTO } from '../dtos/getTimelineDto.dto';
import { ActivityEventsDTO } from '../dtos/getActivityEvents.dto';
import { KnexService } from 'src/shared/knex/knex.service';
import ActivityGoalsRepo from '../../activity-goals/repos/activityGoals.repository';
import ActivityGoal from '../../activity-goals/domain/activityGoal.entity';
import {
  getGoalWeekRange,
  type GoalWeekRange,
} from '../../activity-goals/domain/goal-performance.calculator';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly activitiesRepo: ActivitiesRepo,
    private readonly activityEventRepo: ActivityEventRepo,
    private readonly categoriesRepo: CategoriesRepo,
    private readonly getActivitiesByUserIdQuery: GetActivitiesByUserIdQuery,
    private readonly getActivityByIdQuery: GetActivityByIdQuery,
    private readonly getActivityTimelineQuery: GetActivityTimelineQuery,
    private readonly getActivityEventsQuery: GetActivityEventsQuery,
    private readonly knexService: KnexService,
    private readonly activityGoalsRepo: ActivityGoalsRepo,
  ) {}

  /**
   * The calendar date the request is relative to.
   *
   * Clients send their own local date (`today`), and that value is used for
   * every date calculation so results do not depend on the server's time zone.
   * Falling back to the database's CURRENT_DATE keeps older clients working.
   */
  private async resolveToday(today?: string): Promise<string> {
    return today ?? (await this.knexService.getCurrentDate());
  }

  private async resolveGoalWeekRange(today?: string): Promise<GoalWeekRange> {
    return getGoalWeekRange(await this.resolveToday(today));
  }

  async create(
    createActivityDto: CreateActivityDTO,
    userId: string,
    today?: string,
  ): Promise<ActivityWithCategoryDTO> {
    if (createActivityDto.categoryId !== undefined) {
      const category = await this.categoriesRepo.getByIdAndUser(
        createActivityDto.categoryId,
        userId,
      );
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    let ticker: ActivityTicker | undefined;
    if (createActivityDto.ticker) {
      ticker = ActivityTicker.create(createActivityDto.ticker);
    }
    const activity = Activity.createNew({
      userId,
      name: createActivityDto.name,
      ticker,
      interval: createActivityDto.interval,
      categoryId: createActivityDto.categoryId,
    });

    const goalTargetPerWeek = createActivityDto.goalTargetPerWeek;
    const wantsGoal =
      goalTargetPerWeek !== undefined && goalTargetPerWeek !== null;

    let createdActivity: Activity;
    if (wantsGoal) {
      createdActivity = await this.knexService.connection.transaction(
        async (trx) => {
          const created: Activity = await this.activitiesRepo.create(
            activity,
            trx,
          );
          created.ensurePersisted();
          const goal = ActivityGoal.createNew({
            activityId: created.id,
            targetPerWeek: goalTargetPerWeek,
          });
          await this.activityGoalsRepo.create(goal, trx);
          return created;
        },
      );
    } else {
      createdActivity = await this.activitiesRepo.create(activity);
    }

    if (createActivityDto.lastDone) {
      // Record optional "lastDone" to event db
      createdActivity.ensurePersisted();
      const event = ActivityEvent.createNew({
        activityId: createdActivity.id,
        date: createActivityDto.lastDone,
      });
      await this.activityEventRepo.create(event);
    }

    if (!createdActivity.isPersisted()) {
      throw new Error(
        'Something has gone wrong. The created activity does not exist.',
      );
    }

    const resolvedToday = await this.resolveToday(today);
    return this.getActivityByIdQuery.execute(
      createdActivity.id,
      userId,
      getGoalWeekRange(resolvedToday),
      resolvedToday,
    );
  }

  async getAllByUserId(
    userId: string,
    today?: string,
  ): Promise<ActivityWithCategoryDTO[]> {
    const resolvedToday = await this.resolveToday(today);
    return this.getActivitiesByUserIdQuery.execute(
      userId,
      getGoalWeekRange(resolvedToday),
      resolvedToday,
    );
  }

  async getById(
    activityId: string,
    userId: string,
    today?: string,
  ): Promise<ActivityWithCategoryDTO> {
    const resolvedToday = await this.resolveToday(today);
    return this.getActivityByIdQuery.execute(
      activityId,
      userId,
      getGoalWeekRange(resolvedToday),
      resolvedToday,
    );
  }

  async editActivity(
    activityId: string,
    editActivityDto: EditActivityDTO,
    userId: string,
    today?: string,
  ): Promise<ActivityWithCategoryDTO> {
    const activity = await this.activitiesRepo.getById(activityId);
    // Authorize the request
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    if (activity.userId !== userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    // Update values
    let ticker: ActivityTicker | undefined;
    if (editActivityDto.ticker) {
      ticker = ActivityTicker.create(editActivityDto.ticker);
      activity.changeTicker(ticker);
    }
    if (editActivityDto.name) {
      activity.changeName(editActivityDto.name);
    }
    if (editActivityDto.interval) {
      activity.changeInterval(editActivityDto.interval);
    }
    if (editActivityDto.categoryId !== undefined) {
      // Confirm the user owns the category,
      // while also allowing null value to clear the category
      if (editActivityDto.categoryId !== null) {
        const category = await this.categoriesRepo.getByIdAndUser(
          editActivityDto.categoryId,
          userId,
        );
        if (!category) throw new NotFoundException('Category not found');
      }
      activity.changeCategoryId(editActivityDto.categoryId);
    }

    const goalTargetPerWeek = editActivityDto.goalTargetPerWeek;
    const wantsGoalChange = goalTargetPerWeek !== undefined;
    const wantsGoal = goalTargetPerWeek !== null;

    if (wantsGoalChange) {
      await this.knexService.connection.transaction(async (trx) => {
        await this.activitiesRepo.update(activity, trx);
        if (wantsGoal) {
          const existing =
            await this.activityGoalsRepo.getByActivityId(activityId);
          if (existing) {
            existing.changeTargetPerWeek(goalTargetPerWeek);
            await this.activityGoalsRepo.update(existing, trx);
          } else {
            const goal = ActivityGoal.createNew({
              activityId,
              targetPerWeek: goalTargetPerWeek,
            });
            await this.activityGoalsRepo.create(goal, trx);
          }
        } else {
          await this.activityGoalsRepo.deleteByActivityId(activityId, trx);
        }
      });
    } else {
      await this.activitiesRepo.update(activity);
    }

    const resolvedToday = await this.resolveToday(today);
    return this.getActivityByIdQuery.execute(
      activityId,
      userId,
      getGoalWeekRange(resolvedToday),
      resolvedToday,
    );
  }

  async completeActivity(
    activityId: string,
    userId: string,
    date: string,
    today?: string,
  ): Promise<ActivityWithCategoryDTO> {
    const activity = await this.activitiesRepo.getById(activityId);
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    if (activity.userId !== userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const event = ActivityEvent.createNew({
      activityId,
      date,
    });
    try {
      await this.activityEventRepo.create(event);
    } catch (error) {
      if (error instanceof DuplicateActivityEventError) {
        throw new ConflictException(
          'Activity already completed on the provided date',
        );
      }
      throw error;
    }

    const resolvedToday = await this.resolveToday(today);
    const updatedActivity = await this.getActivityByIdQuery.execute(
      activityId,
      userId,
      getGoalWeekRange(resolvedToday),
      resolvedToday,
    );
    if (!updatedActivity) {
      throw new Error('Activity not found after completing it');
    }
    return updatedActivity;
  }

  async undoActivityEvent(
    activityId: string,
    userId: string,
    date: string,
    today?: string,
  ): Promise<ActivityWithCategoryDTO> {
    const activity = await this.activitiesRepo.getById(activityId);
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    if (activity.userId !== userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.activityEventRepo.removeByActivityIdAndDate(activityId, date);

    const resolvedToday = await this.resolveToday(today);
    const updatedActivity = await this.getActivityByIdQuery.execute(
      activityId,
      userId,
      getGoalWeekRange(resolvedToday),
      resolvedToday,
    );
    if (!updatedActivity) {
      throw new Error('Activity not found after undoing completion');
    }
    return updatedActivity;
  }

  async getActivityTimeline(
    userId: string,
    month: string,
  ): Promise<ActivityTimelineDTO> {
    return this.getActivityTimelineQuery.execute(userId, month);
  }

  async getActivityEvents(
    userId: string,
    from: string,
    to: string,
  ): Promise<ActivityEventsDTO> {
    return this.getActivityEventsQuery.execute(userId, from, to);
  }

  async deleteActivity(activityId: string, userId: string): Promise<void> {
    const activity = await this.activitiesRepo.getById(activityId);
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    if (activity.userId !== userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.activityGoalsRepo.deleteByActivityId(activityId);
    await this.activityEventRepo.removeByActivityId(activityId);
    await this.activitiesRepo.delete(activityId);
  }
}
