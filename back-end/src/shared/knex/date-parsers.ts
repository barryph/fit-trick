import { types } from 'pg';

/**
 * Timezone-safe handling of Postgres `DATE` columns.
 *
 * A `DATE` has no time zone: it is a calendar date, and the app stores the
 * user's *local* calendar dates in it (completion dates, `lastDone`). The
 * node-postgres driver's default parser for `date` (OID 1082) builds a JS
 * `Date` at **local midnight of the server process**, which turns an opaque
 * calendar date into a server-timezone-dependent instant. Any later
 * `toISOString()` then renders it as the previous day for every positive UTC
 * offset, shifting completion dates by a day whenever the API host is not on
 * UTC.
 *
 * Returning the raw `YYYY-MM-DD` string instead keeps the value exactly as
 * Postgres sent it, so no parsing step can re-interpret it in the server's
 * timezone. This is the same guarantee the `to_char(date, 'YYYY-MM-DD')`
 * projections in the queries provide, applied as a safety net so a future
 * `SELECT *` on a table with a DATE column cannot silently reintroduce the bug.
 */
export const DATE_OID = 1082;

/** Passes a `DATE` through untouched, exactly as Postgres rendered it. */
export function parseDateColumn(value: string): string {
  return value;
}

/**
 * Registers the DATE parser. Global to the `pg` module, so it must run before
 * the first connection is opened - `knexfile.ts` calls it at module load, which
 * covers the API, migrations, seeds, and tests alike.
 */
export function registerDateTypeParser(): void {
  types.setTypeParser(DATE_OID, parseDateColumn);
}
