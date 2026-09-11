import knex from 'knex';
import { KnexService } from 'src/shared/knex/knex.service';
import ActivitiesRepo from './activities.repository';
import Activity from '../domain/activity.entity';

/**
 * Structural guarantees for the repository's SQL.
 *
 * The behaviour - that `days_until` is actually the right number of days - is
 * proven against a real database in `activities.repository.int-spec.ts`. These
 * tests cover the parts that would let a wrong *shape* slip back in: a
 * hardcoded placeholder, a server-clock expression, or a binding that knex
 * mangles before Postgres ever sees it.
 */
const SERVER_CLOCK_FUNCTIONS =
  /\bCURRENT_DATE\b|\bCURRENT_TIMESTAMP\b|\bLOCALTIME(STAMP)?\b|\bNOW\s*\(/i;

/** A literal that ignores both the activity's completions and the caller's date. */
const HARDCODED_DAYS_UNTIL = /\b0\s+AS\s+days_until\b/i;

const TODAY = '2026-03-02'; // A Monday, a day ahead of a UTC server's date.

function createRecordingKnex(rows: unknown[] = []) {
  const statements: Array<{ sql: string; bindings: Record<string, unknown> }> =
    [];
  const raw = jest.fn((sql: string, bindings?: Record<string, unknown>) => {
    statements.push({ sql, bindings: bindings ?? {} });
    return Promise.resolve({ rows });
  });

  const knexService = {
    connection: { raw },
  } as unknown as KnexService;

  return { knexService, statements };
}

const persistedRow = {
  id: '1',
  user_id: 'user-1',
  category_id: null,
  name: 'Squats',
  ticker: null,
  interval: '7 DAYS',
  days_until: 4,
};

function buildActivity(): Activity {
  return Activity.reconstitute({
    id: '1',
    userId: 'user-1',
    name: 'Squats',
    interval: 7,
  });
}

describe('ActivitiesRepo SQL contract', () => {
  it('computes days_until from the client date instead of hardcoding it', async () => {
    const { knexService, statements } = createRecordingKnex([persistedRow]);
    const repo = new ActivitiesRepo(knexService);

    await repo.create(buildActivity(), TODAY);
    await repo.getById('1', TODAY);
    await repo.update(buildActivity(), TODAY);

    expect(statements).toHaveLength(3);
    for (const { sql, bindings } of statements) {
      expect(sql).toContain('days_until');
      expect(sql).not.toMatch(HARDCODED_DAYS_UNTIL);
      // The countdown must reference the completions and the client's date.
      expect(sql).toContain('activity_events');
      expect(sql).toContain('CAST(:today AS date)');
      expect(bindings.today).toBe(TODAY);
    }
  });

  it('never derives a date from the database clock', async () => {
    const { knexService, statements } = createRecordingKnex([persistedRow]);
    const repo = new ActivitiesRepo(knexService);

    await repo.create(buildActivity(), TODAY);
    await repo.getById('1', TODAY);
    await repo.update(buildActivity(), TODAY);
    await repo.delete('1');

    for (const { sql } of statements) {
      expect(sql).not.toMatch(SERVER_CLOCK_FUNCTIONS);
    }
  });

  it('surfaces the computed days_until on the domain entity', async () => {
    const { knexService } = createRecordingKnex([persistedRow]);

    const activity = await new ActivitiesRepo(knexService).getById('1', TODAY);

    expect(activity?.daysUntil).toBe(4);
    expect(activity?.interval).toBe(7);
  });

  it('renders every statement without binding collisions', async () => {
    const { knexService, statements } = createRecordingKnex([persistedRow]);
    const repo = new ActivitiesRepo(knexService);
    await repo.create(buildActivity(), TODAY);
    await repo.getById('1', TODAY);
    await repo.update(buildActivity(), TODAY);

    const renderer = knex({ client: 'pg' });

    for (const { sql, bindings } of statements) {
      const rendered = renderer.raw(sql, bindings).toSQL() as unknown as {
        sql: string;
        bindings: readonly unknown[];
      };

      // A leftover `:name` token means knex did not recognise it, and a count
      // mismatch means it recognised too much (e.g. `:today::date` swallowing
      // `:date` as a second binding). Either way Postgres would reject it.
      expect(rendered.sql).not.toMatch(/:/);
      expect(rendered.bindings).toHaveLength(
        (rendered.sql.match(/\?/g) ?? []).length,
      );
      expect(rendered.bindings).toContain(TODAY);
    }
  });
});
