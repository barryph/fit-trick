import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from './database.module';
import { KnexService } from './knex.service';

/**
 * Proves, against a real database, that a Postgres `DATE` reaches the
 * application as the same calendar date Postgres sent.
 *
 * The driver's default parser builds a JS `Date` at local midnight of the
 * *server* process, which `toISOString()` then renders as the previous day for
 * every positive UTC offset - so completion dates shifted by a day depending on
 * where the API happened to be deployed. These assertions are absolute (they
 * never consult the host offset), so they hold wherever the suite runs: a UTC
 * CI runner included.
 */
describe('DATE column round-trip (integration)', () => {
  let knexService: KnexService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    knexService = moduleRef.get(KnexService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('returns a DATE as a plain YYYY-MM-DD string, not a Date instance', async () => {
    const result = await knexService.connection.raw<{
      rows: Array<{ d: unknown }>;
    }>(`SELECT DATE '2026-03-02' AS d`);

    // A `Date` here is the bug: the driver built it at local midnight of the
    // API process, and serialising it could land on the neighbouring day.
    expect(typeof result.rows[0].d).toBe('string');
    expect(result.rows[0].d).toBe('2026-03-02');
  });

  it('keeps the calendar date stable across month and year boundaries', async () => {
    const result = await knexService.connection.raw<{
      rows: Array<Record<string, string>>;
    }>(
      `SELECT
         DATE '2026-12-31' AS d1,
         DATE '2027-01-01' AS d2,
         DATE '2028-02-29' AS d3`,
    );

    expect(result.rows[0]).toEqual({
      d1: '2026-12-31',
      d2: '2027-01-01',
      d3: '2028-02-29',
    });
  });

  it('matches a client-supplied calendar date against a stored DATE', async () => {
    // The API compares and stores dates by binding a `YYYY-MM-DD` string, which
    // is the direction that must not be re-interpreted in the session's zone.
    // `CAST(...)` rather than `:date::date`: knex's named-binding scanner reads
    // `:date` out of `::date` whenever a `date` binding is present, rendering
    // `$1:$2` and failing - see `date-bindings.spec.ts`.
    const result = await knexService.connection.raw<{
      rows: Array<{ matches: boolean; as_text: string }>;
    }>(
      `SELECT
         (DATE '2026-03-02' = CAST(:date AS date)) AS matches,
         to_char(CAST(:date AS date), 'YYYY-MM-DD') AS as_text`,
      { date: '2026-03-02' },
    );

    expect(result.rows[0].matches).toBe(true);
    expect(result.rows[0].as_text).toBe('2026-03-02');
  });

  it('runs every session on UTC, so raw clock expressions are deterministic', async () => {
    // Nothing in the product derives a calendar date from the database session
    // any more; pinning the zone keeps that true for any query added later.
    // This is checking the `options: '-c TimeZone=UTC'` connection setting is
    // actually applied - the server's own default differs from UTC on a
    // developer machine (Pacific/Auckland here), so the assertion would fail
    // without it there.
    const result = await knexService.connection.raw<{
      rows: Array<{ TimeZone: string }>;
    }>(`SHOW TimeZone`);

    expect(result.rows[0].TimeZone).toBe('UTC');
  });
});
