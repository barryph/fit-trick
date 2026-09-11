import Activity from '../../src/modules/activities/domain/activity.entity';
import ActivityTicker from '../../src/modules/activities/domain/activityTicker.vo';
import ActivitiesRepo from '../../src/modules/activities/repos/activities.repository';
import { KnexService } from '../../src/shared/knex/knex.service';

export interface ActivityFactoryOverrides {
  userId: string;
  name?: string;
  interval?: number;
  ticker?: string;
  categoryId?: number;
}

export function buildActivity(overrides: ActivityFactoryOverrides): Activity {
  let ticker: ActivityTicker | undefined;
  if (overrides.ticker) {
    ticker = ActivityTicker.create(overrides.ticker);
  }

  return Activity.createNew({
    userId: overrides.userId,
    name: overrides.name ?? 'Exercise',
    interval: overrides.interval ?? 7,
    ticker,
    categoryId: overrides.categoryId,
  });
}

/**
 * The client date the factory inserts with.
 *
 * An insert can never see completions (the activity does not exist yet), so the
 * countdown is 0 whatever this is; it only has to be a valid calendar date.
 * Tests that assert on `daysUntil` pass their own date explicitly.
 */
const DEFAULT_TODAY = '2026-03-02';

export async function insertActivity(
  knexService: KnexService,
  overrides: ActivityFactoryOverrides,
  today: string = DEFAULT_TODAY,
): Promise<Activity> {
  const repo = new ActivitiesRepo(knexService);
  return repo.create(buildActivity(overrides), today);
}
