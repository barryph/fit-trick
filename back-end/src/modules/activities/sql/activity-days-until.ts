/**
 * The single definition of the "days until this activity is next due" rule.
 *
 * The countdown is relative to the *user's* calendar date, which arrives per
 * request as the `:today` binding, so it must never be derived from the server
 * clock (`CURRENT_DATE`) and must never be a constant. Every statement that
 * returns an activity - the two read models and the repository's own
 * insert/update/load statements - projects this same expression, so the value
 * cannot drift between the paths that expose it.
 *
 * Semantics, matching the product rule:
 * - `interval` days after the most recent completion the activity is due again;
 * - an activity that has never been completed counts as due now (Postgres'
 *   `GREATEST` ignores NULL arguments, so a missing `MAX(date)` yields 0);
 * - an activity past its interval is clamped to 0 rather than going negative.
 *
 * Verified against PostgreSQL 18: `UPDATE`/`INSERT ... RETURNING` can qualify
 * the target table by name inside the correlated subquery.
 *
 * Uses `CAST(... AS date)` rather than the `:today::date` shorthand on purpose.
 * Knex scans `:name` tokens across the whole statement, so `:today::date`
 * renders correctly only while no `date` binding happens to be present - adding
 * one silently turns it into two placeholders and a stray colon
 * (`$1:$2`). The parenthesised cast form cannot collide.
 *
 * @param activityTable the table name (or alias) holding `id` and `interval`.
 *   Usable in `RETURNING` because the target table is referenceable by name.
 */
export function daysUntilExpression(activityTable = 'activities'): string {
  return `GREATEST(EXTRACT(DAY FROM ${activityTable}.interval) - (CAST(:today AS date) - (SELECT MAX(date) FROM activity_events WHERE activity_id = ${activityTable}.id)), 0)`;
}
