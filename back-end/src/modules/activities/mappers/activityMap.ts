import Activity from '../domain/activity.entity';
import ActivityTicker from '../domain/activityTicker.vo';
import { ActivityWithCategoryDTO } from '../dtos/activityWithCategory.dto';

export interface ActivityDTO {
  id: string;
  userId: string;
  name: string;
  ticker?: string;
  interval: number;
  categoryId?: number;
  daysUntil?: number;
}

/** The columns actually written to `activities`. */
export interface IActivityPersistence {
  id?: string;
  user_id: string;
  category_id?: number;
  name: string;
  ticker?: string;
  interval: string; // Postgres INTERVAL type e.g. '2 DAYS'
}

/**
 * A persisted activity plus the values derived when it is read.
 *
 * `days_until` is deliberately *not* part of `IActivityPersistence`: it is not a
 * column, it is computed per request from the caller's local date. Requiring it
 * here means any statement feeding `persistenceToDomain` must project it, so a
 * hardcoded placeholder or a silently missing column is a type error rather
 * than a plausible-looking 0.
 */
export interface IActivityRow extends IActivityPersistence {
  days_until: number;
}

export function toDTO(activity: Activity): ActivityDTO {
  activity.ensurePersisted();
  return {
    id: activity.id,
    userId: activity.userId,
    categoryId: activity.categoryId,
    name: activity.name,
    ticker: activity.ticker?.value,
    interval: activity.interval,
    daysUntil: activity.daysUntil,
  };
}

export function toPersistence(activity: Activity): IActivityPersistence {
  return {
    ...(activity.isPersisted() && { id: activity.id }),
    user_id: activity.userId,
    category_id: activity.categoryId,
    name: activity.name,
    ticker: activity.ticker?.value,
    interval: `${activity.interval} DAYS`,
  };
}

export function persistenceToDomain(activity: IActivityRow): Activity {
  let ticker: ActivityTicker | undefined;
  if (activity.ticker) {
    ticker = ActivityTicker.create(activity.ticker);
  }

  return Activity.createNew({
    id: activity.id,
    userId: activity.user_id,
    categoryId: activity.category_id,
    name: activity.name,
    ticker,
    interval: parseInt(activity.interval.split(' ')[0], 10),
    daysUntil: Number(activity.days_until),
  });
}

export function rawToActivityWithCategoryDTO(
  row: any,
): ActivityWithCategoryDTO {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    ticker: row.ticker,
    interval: parseInt(row.interval_days as string, 10),
    categoryId: row.category_id,
    daysUntil: Number(row.days_until),
    ...(row.category && {
      category: {
        id: row.category.id,
        userId: row.category.user_id,
        name: row.category.name,
        color: row.category.color,
      },
    }),
    ...(row.goal && {
      goal: {
        id: row.goal.id,
        activityId: row.goal.activity_id,
        targetPerWeek: row.goal.target_per_week,
      },
    }),
    ...(row.current_week_count !== undefined && {
      goalProgress: {
        currentWeekCount: Number(row.current_week_count),
      },
    }),
  } as ActivityWithCategoryDTO;
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}
