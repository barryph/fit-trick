import { BadRequestException, Injectable } from '@nestjs/common';
import { KnexService } from 'src/shared/knex/knex.service';

import {
  ActivityEventDTO,
  ActivityEventsDTO,
} from '../dtos/getActivityEvents.dto';

@Injectable()
export class GetActivityEventsQuery {
  constructor(private readonly knexService: KnexService) {}

  async execute(
    userId: string,
    from: string,
    to: string,
  ): Promise<ActivityEventsDTO> {
    if (from > to) {
      throw new BadRequestException(
        'Invalid date range: from must be on or before to',
      );
    }

    const rows = (await this.knexService
      .connection('activity_events')
      .innerJoin('activities', 'activities.id', 'activity_events.activity_id')
      .where('activities.user_id', userId)
      .whereBetween('activity_events.date', [from, to])
      .select([
        'activities.id as activity_id',
        'activities.category_id as category_id',
        // Format in SQL rather than letting node-postgres parse the DATE column
        // into a JS Date. A DATE has no time zone, but the driver builds one at
        // local midnight, and toISOString() then renders it as the *previous*
        // day for every positive UTC offset - shifting every event date for a
        // server that is not running on UTC. Every other date query in the
        // module already selects to_char(...) for this reason.
        this.knexService.connection.raw(
          "to_char(activity_events.date, 'YYYY-MM-DD') as date",
        ),
      ])
      .orderBy('activity_events.date', 'asc')) as Array<{
      activity_id: string;
      category_id: number | null;
      date: string;
    }>;

    const events: ActivityEventDTO[] = rows.map((row) => ({
      activityId: row.activity_id,
      categoryId: row.category_id,
      date: row.date,
    }));

    return { events };
  }
}
