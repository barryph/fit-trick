import { Injectable } from '@nestjs/common';
import { KnexService } from 'src/shared/knex/knex.service';
import ActivityEvent from '../domain/activityEvent.entity';
import { DuplicateActivityEventError } from '../activitiyEvent.errors';

interface IActivityEventRepo {
  create(activityEvent: ActivityEvent): Promise<ActivityEvent>;
  removeByActivityIdAndDate(activityId: string, date: string): Promise<boolean>;
  removeByActivityId(activityId: string): Promise<void>;
}

@Injectable()
export default class ActivityEventRepo implements IActivityEventRepo {
  constructor(private readonly knexService: KnexService) {}

  async create(activityEventDomain: ActivityEvent): Promise<ActivityEvent> {
    let result: { rows: any[] };
    try {
      result = await this.knexService.connection.raw<{
        rows: any[];
      }>(
        `
          INSERT INTO activity_events (activity_id, date)
          VALUES (:activityId, :date)
          RETURNING
            id,
            activity_id,
            TO_CHAR(date, 'YYYY-MM-DD') AS date
        `,
        {
          activityId: activityEventDomain.activityId,
          date: activityEventDomain.date,
        },
      );
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error?.constraint === 'activity_events_activity_id_date_unique') {
        throw new DuplicateActivityEventError();
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error?.name === 'unique_violation') {
        throw new DuplicateActivityEventError();
      }
      throw error;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const row = result.rows[0];
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    /* eslint-disable @typescript-eslint/no-unsafe-call */
    return ActivityEvent.reconstitute({
      id: row.id.toString(),
      activityId: row.activity_id.toString(),
      date: row.date,
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    /* eslint-enable @typescript-eslint/no-unsafe-call */
  }

  async removeByActivityIdAndDate(
    activityId: string,
    date: string,
  ): Promise<boolean> {
    const result = await this.knexService.connection.raw<{ rowCount: number }>(
      `
        DELETE FROM activity_events
        WHERE activity_id = :activityId
          AND date = :date
      `,
      { activityId, date },
    );

    return result.rowCount > 0;
  }

  async removeByActivityId(activityId: string): Promise<void> {
    await this.knexService.connection.raw(
      `
        DELETE FROM activity_events
        WHERE activity_id = :activityId
      `,
      { activityId },
    );
  }
}
