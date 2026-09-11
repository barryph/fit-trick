import knex from 'knex';
import type { Knex } from 'knex';
import { KnexService } from 'src/shared/knex/knex.service';
import { GetActivitiesByUserIdQuery } from './getActivitiesByUserId.query';
import { GetActivityByIdQuery } from './getActivityById.query';
import { GetActivityTimelineQuery } from './getActivityTimeline.query';
import { GetActivityEventsQuery } from './getActivityEvents.query';
import { GetActivityGoalStatsQuery } from '../../activity-goals/queries/getActivityGoalStats.query';
import { GetActivityGoalsByUserIdQuery } from '../../activity-goals/queries/getActivityGoalsByUserId.query';
import { daysUntilExpression } from '../sql/activity-days-until';

/**
 * A calendar date is a property of the user, never of the host.
 *
 * These tests assert the SQL contract directly: no date-sensitive statement may
 * ask the database what "today" is, and every relative calculation must be
 * driven by the client's `today` binding. `CURRENT_DATE` (and friends) resolve
 * in the *server's* timezone, so a query that uses them returns the wrong day
 * for every user whose offset differs from the host's.
 */
const SERVER_CLOCK_FUNCTIONS =
  /\bCURRENT_DATE\b|\bCURRENT_TIMESTAMP\b|\bLOCALTIME(STAMP)?\b|\bNOW\s*\(|\bSTATEMENT_TIMESTAMP\s*\(|\bTRANSACTION_TIMESTAMP\s*\(/i;

/**
 * A literal that ignores both the activity's completions and the caller's date,
 * i.e. the countdown replaced by a placeholder.
 */
const HARDCODED_DAYS_UNTIL = /\b0\s+AS\s+days_until\b/i;

interface RecordedQuery {
  name: string;
  sql: string;
  bindings: Record<string, unknown>;
}

interface BuilderCall {
  method: string;
  args: unknown[];
}

/**
 * Captures every raw statement with its named bindings, and every builder call
 * with its real arguments (rather than a rendered string), so assertions can
 * check the values a query was scoped to.
 */
function createRecordingKnex(rowsByCall: unknown[][] = []) {
  const queries: RecordedQuery[] = [];
  const builderCalls: BuilderCall[] = [];
  let rawCallIndex = 0;

  class RecordingBuilder {
    private chain(method: string, args: unknown[]): this {
      builderCalls.push({ method, args });
      return this;
    }

    innerJoin(...args: unknown[]) {
      return this.chain('innerJoin', args);
    }
    leftJoin(...args: unknown[]) {
      return this.chain('leftJoin', args);
    }
    where(...args: unknown[]) {
      return this.chain('where', args);
    }
    whereBetween(...args: unknown[]) {
      return this.chain('whereBetween', args);
    }
    select(...args: unknown[]) {
      return this.chain('select', args);
    }
    orderBy(...args: unknown[]) {
      return this.chain('orderBy', args);
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?:
        ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const rows = rowsByCall[rawCallIndex] ?? [];
      rawCallIndex += 1;
      return Promise.resolve(rows).then(onfulfilled, onrejected);
    }
  }

  const connection = ((table: string) => {
    builderCalls.push({ method: 'from', args: [table] });
    return new RecordingBuilder();
  }) as unknown as Knex;

  const raw = jest.fn((sql: string, bindings?: Record<string, unknown>) => {
    queries.push({
      name: sql,
      sql,
      bindings: bindings ?? {},
    });
    const rows = rowsByCall[rawCallIndex] ?? [];
    rawCallIndex += 1;
    return Promise.resolve({ rows });
  });

  const knexService = {
    connection: Object.assign(connection, { raw }),
  } as unknown as KnexService;

  return { knexService, queries, builderCalls };
}

const TODAY = '2026-03-02'; // A Monday, and a day ahead of a UTC server's date.
const WEEK_RANGE = { from: '2026-03-02', to: '2026-03-08' };

describe('client date in date-sensitive SQL', () => {
  it('binds the client today, not the database clock, when listing activities', async () => {
    const { knexService, queries } = createRecordingKnex([[]]);

    await new GetActivitiesByUserIdQuery(knexService).execute(
      'user-1',
      WEEK_RANGE,
      TODAY,
    );

    const [statement] = queries;
    expect(statement.bindings).toMatchObject({
      today: TODAY,
      userId: 'user-1',
      goalFrom: WEEK_RANGE.from,
      goalTo: WEEK_RANGE.to,
    });
    expect(statement.sql).not.toMatch(SERVER_CLOCK_FUNCTIONS);
    expect(statement.sql).toContain(daysUntilExpression());
  });

  it('binds the client today when reading a single activity', async () => {
    const { knexService, queries } = createRecordingKnex([
      [{ id: '1', user_id: 'user-1' }],
    ]);

    await new GetActivityByIdQuery(knexService).execute(
      '1',
      'user-1',
      WEEK_RANGE,
      TODAY,
    );

    const [statement] = queries;
    expect(statement.bindings).toMatchObject({
      today: TODAY,
      activityId: '1',
    });
    expect(statement.sql).not.toMatch(SERVER_CLOCK_FUNCTIONS);
    expect(statement.sql).toContain(daysUntilExpression());
  });

  it('scopes the timeline and event queries to client-supplied boundaries', async () => {
    const { knexService, queries } = createRecordingKnex([[], []]);

    await new GetActivityTimelineQuery(knexService).execute(
      'user-1',
      '2026-03',
    );
    expect(queries[0].bindings).toMatchObject({
      userId: 'user-1',
      month: '2026-03',
    });
    expect(queries[0].sql).not.toMatch(SERVER_CLOCK_FUNCTIONS);

    const events = createRecordingKnex([[]]);
    await new GetActivityEventsQuery(events.knexService).execute(
      'user-1',
      WEEK_RANGE.from,
      WEEK_RANGE.to,
    );
    expect(events.queries[0].sql).not.toMatch(SERVER_CLOCK_FUNCTIONS);
    expect(events.builderCalls).toContainEqual({
      method: 'whereBetween',
      args: ['activity_events.date', [WEEK_RANGE.from, WEEK_RANGE.to]],
    });
  });

  it('never lets a goal query derive dates from the database clock', async () => {
    const stats = createRecordingKnex([
      [
        {
          id: '1',
          activity_id: '1',
          target_per_week: 3,
          activity_name: 'Squats',
        },
      ],
      [],
    ]);
    await new GetActivityGoalStatsQuery(stats.knexService).execute(
      '1',
      'user-1',
    );

    const goals = createRecordingKnex([[], []]);
    await new GetActivityGoalsByUserIdQuery(goals.knexService).execute(
      'user-1',
      WEEK_RANGE,
    );

    for (const statement of [...stats.queries, ...goals.queries]) {
      expect(statement.sql).not.toMatch(SERVER_CLOCK_FUNCTIONS);
    }
    expect(goals.queries[1].bindings).toMatchObject({
      from: WEEK_RANGE.from,
      to: WEEK_RANGE.to,
    });
  });

  it('renders every event date as a YYYY-MM-DD calendar string', async () => {
    // A DATE projected as a raw column would go through node-postgres' parser,
    // which builds a local-midnight Date on the server and shifts the day for
    // positive UTC offsets. `to_char` keeps it an opaque calendar date.
    const { knexService, queries } = createRecordingKnex([[]]);
    await new GetActivityEventsQuery(knexService).execute(
      'user-1',
      WEEK_RANGE.from,
      WEEK_RANGE.to,
    );

    expect(queries[0].sql).toContain(
      "to_char(activity_events.date, 'YYYY-MM-DD')",
    );
  });

  it('never replaces the countdown with a literal', async () => {
    // `days_until` was previously hardcoded to 0 on the write paths, which
    // reported every activity as "due now" regardless of its history.
    const listing = createRecordingKnex([[]]);
    await new GetActivitiesByUserIdQuery(listing.knexService).execute(
      'user-1',
      WEEK_RANGE,
      TODAY,
    );

    const detail = createRecordingKnex([[{ id: '1', user_id: 'user-1' }]]);
    await new GetActivityByIdQuery(detail.knexService).execute(
      '1',
      'user-1',
      WEEK_RANGE,
      TODAY,
    );

    for (const statement of [...listing.queries, ...detail.queries]) {
      expect(statement.sql).not.toMatch(HARDCODED_DAYS_UNTIL);
      expect(statement.sql).toContain('MAX(date)');
    }
  });

  it('renders each statement with exactly one placeholder per binding', async () => {
    // Catches a binding swallowed by a `::` cast, which knex renders as `$1:$2`
    // and Postgres rejects at runtime.
    const listing = createRecordingKnex([[]]);
    await new GetActivitiesByUserIdQuery(listing.knexService).execute(
      'user-1',
      WEEK_RANGE,
      TODAY,
    );

    const renderer = knex({ client: 'pg' });

    for (const { sql, bindings } of listing.queries) {
      const rendered = renderer.raw(sql, bindings).toSQL() as unknown as {
        sql: string;
        bindings: readonly unknown[];
      };

      expect(rendered.sql).not.toMatch(/:/);
      expect(rendered.bindings).toHaveLength(
        (rendered.sql.match(/\?/g) ?? []).length,
      );
    }
  });
});
