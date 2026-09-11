import { Injectable } from '@nestjs/common';
import { KnexService } from 'src/shared/knex/knex.service';

import * as ActivityMap from '../mappers/activityMap';
import { ActivityWithCategoryDTO } from '../dtos/activityWithCategory.dto';
import { daysUntilExpression } from '../sql/activity-days-until';
import type { GoalWeekRange } from '../../activity-goals/domain/goal-performance.calculator';

@Injectable()
export class GetActivitiesByUserIdQuery {
  constructor(private readonly knexService: KnexService) {}

  async execute(
    userId: string,
    goalWeekRange: GoalWeekRange,
    today: string,
  ): Promise<ActivityWithCategoryDTO[]> {
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
        WHERE activities.user_id = :userId
      `,
      {
        userId,
        today,
        goalFrom: goalWeekRange.from,
        goalTo: goalWeekRange.to,
      },
    );

    return result.rows.map((row) =>
      ActivityMap.rawToActivityWithCategoryDTO(row),
    );
  }
}
