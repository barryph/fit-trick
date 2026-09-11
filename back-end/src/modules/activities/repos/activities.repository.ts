import { Injectable } from '@nestjs/common';
import { KnexService } from 'src/shared/knex/knex.service';
import Activity from '../domain/activity.entity';
import * as ActivityMap from '../mappers/activityMap';
import { IActivityRow } from '../mappers/activityMap';
import { daysUntilExpression } from '../sql/activity-days-until';
import type { Knex } from 'knex';

/**
 * Every method that returns an activity takes the caller's local calendar date
 * (`today`) and uses it to hydrate `daysUntil`.
 *
 * That value is relative to the user's own date, so it cannot be derived from
 * the database session's clock (`CURRENT_DATE` resolves in the *server's*
 * timezone) and it cannot be a constant. Both were wrong in different ways
 * before: the value was either the server's day or a hardcoded 0, which meant
 * an activity edited or loaded through this repository reported a countdown
 * that had nothing to do with its completions.
 */
interface IActivitiesRepo {
  create(
    activity: Activity,
    today: string,
    trx?: Knex.Transaction,
  ): Promise<Activity>;
  getById(id: string, today: string): Promise<Activity | null>;
  update(
    activity: Activity,
    today: string,
    trx?: Knex.Transaction,
  ): Promise<Activity>;
  delete(id: string): Promise<boolean>;
}

@Injectable()
export default class ActivitiesRepo implements IActivitiesRepo {
  constructor(private readonly knexService: KnexService) {}

  async create(
    activityDomain: Activity,
    today: string,
    trx?: Knex.Transaction,
  ): Promise<Activity> {
    const activity = ActivityMap.toPersistence(activityDomain);
    const connection = trx ?? this.knexService.connection;
    const result = await connection.raw<{
      rows: IActivityRow[];
    }>(
      `
        INSERT INTO activities (user_id, category_id, name, ticker, interval)
        VALUES (:userId, :categoryId, :name, :ticker, :interval)
        RETURNING *,
          EXTRACT(DAY FROM interval) || ' DAYS' AS interval,
          ${daysUntilExpression()} AS days_until
      `,
      {
        userId: activity.user_id,
        categoryId: activity.category_id || null,
        name: activity.name,
        ticker: activity.ticker || null,
        interval: activity.interval,
        today,
      },
    );
    const newActivity = result.rows[0];
    return ActivityMap.persistenceToDomain(newActivity);
  }

  /**
   * Loads an activity for authorization and mutation.
   *
   * The countdown is computed from the caller's `today` rather than the
   * database clock; the read models (`GetActivityByIdQuery`,
   * `GetActivitiesByUserIdQuery`) project the same expression, so an activity
   * reports one consistent value on every path.
   */
  async getById(id: string, today: string): Promise<Activity | null> {
    const result = await this.knexService.connection.raw<{
      rows: IActivityRow[];
    }>(
      `
        SELECT
          activities.*,
          EXTRACT(DAY FROM activities.interval) || ' DAYS' AS interval,
          ${daysUntilExpression()} AS days_until
        FROM activities
        WHERE id = :id
      `,
      { id, today },
    );
    if (result.rows.length === 0) {
      return null;
    }
    return ActivityMap.persistenceToDomain(result.rows[0]);
  }

  async update(
    activityDomain: Activity,
    today: string,
    trx?: Knex.Transaction,
  ): Promise<Activity> {
    const activity = ActivityMap.toPersistence(activityDomain);
    const connection = trx ?? this.knexService.connection;
    const result = await connection.raw<{
      rows: IActivityRow[];
    }>(
      `
        UPDATE activities
        SET name = :name, ticker = :ticker, interval = :interval, category_id = :category_id
        WHERE id = :id
        RETURNING *,
          EXTRACT(DAY FROM interval) || ' DAYS' AS interval,
          ${daysUntilExpression()} AS days_until
      `,
      {
        id: activity.id,
        name: activity.name,
        ticker: activity.ticker || null,
        interval: activity.interval,
        category_id: activity.category_id || null,
        today,
      },
    );
    const updatedActivity = result.rows[0];
    return ActivityMap.persistenceToDomain(updatedActivity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.knexService.connection.raw<{ rowCount: number }>(
      `
        DELETE FROM activities
        WHERE id = :id
      `,
      { id },
    );

    return result.rowCount > 0;
  }
}
