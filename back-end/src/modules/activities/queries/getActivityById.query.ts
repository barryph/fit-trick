import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { KnexService } from 'src/shared/knex/knex.service';

import * as ActivityMap from '../mappers/activityMap';
import { ActivityWithCategoryDTO } from '../dtos/activityWithCategory.dto';
import { daysUntilExpression } from '../sql/activity-days-until';
import type { GoalWeekRange } from '../../activity-goals/domain/goal-performance.calculator';

@Injectable()
export class GetActivityByIdQuery {
  constructor(private readonly knexService: KnexService) {}

  async execute(
    activityId: string,
    userId: string,
    goalWeekRange: GoalWeekRange,
    today: string,
  ): Promise<ActivityWithCategoryDTO> {
    const result = await this.knexService.connection.raw<{
      rows: any[];
    }>(
      `
        SELECT
          activities.*,
          EXTRACT(DAY FROM activities.interval) AS interval_days,
          row_to_json(categories) as category,
          row_to_json(activity_goals) as goal,
          CASE
            WHEN activity_goals.id IS NOT NULL THEN (
              SELECT COUNT(*)
              FROM activity_events
              WHERE activity_id = activities.id
                AND date BETWEEN :goalFrom AND :goalTo
            )
            ELSE 0
          END AS current_week_count,
          ${daysUntilExpression()} AS days_until
        FROM activities
        LEFT JOIN categories ON activities.category_id = categories.id
        LEFT JOIN activity_goals ON activity_goals.activity_id = activities.id
        WHERE activities.id = :activityId
      `,
      {
        activityId,
        today,
        goalFrom: goalWeekRange.from,
        goalTo: goalWeekRange.to,
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Activity not found');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (row.user_id !== userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return ActivityMap.rawToActivityWithCategoryDTO(row);
  }
}
