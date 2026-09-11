---
name: dates-and-timezones
description: Handle calendar dates and timezones in Kadence (NestJS/Postgres API + Expo app). Trigger when storing, parsing, formatting, comparing or deriving a date — "today", day/week/month boundaries, countdowns and streaks, scheduling and expiry, DATE columns, or date-scoped query keys.
---

# Dates and timezones

A **calendar date is the user's local date** — never the server's, never UTC.
Kadence is used at every UTC offset, and near midnight the device, the API host
and the database are routinely on three different days. Nearly every date bug in
this repo has come from code quietly answering with the *host's* day instead of
the user's.

## Two kinds of value — never mix them

| Kind | Examples | How to handle |
|---|---|---|
| **Calendar date** | completion dates, `lastDone`, "today", a week's Monday, a month key | opaque `YYYY-MM-DD` strings, owned by the device |
| **Instant** | session expiry, `password_reset_expires`, `created_at`/`updated_at` | ordinary absolute timestamps; `Date`, `NOW()` and `timestamptz` are fine and out of scope here |

Convert only at the boundary: the device turns its instant into its own calendar
date (`YYYYMMDD(date)`), sends it as `?today=`, and everything downstream treats
it as an opaque string.

## Backend

- **`?today=YYYY-MM-DD` is required** on every `/activities` and `/goals`
  endpoint (`TodayQueryDTO`, `GetGoalsQueryDTO`); missing or malformed → 400.
  There is deliberately **no fallback**: a server clock or `CURRENT_DATE`
  answers with the host's day, which is the bug this skill exists to prevent.
  `DELETE /activities/:id` carries it too, because the read that authorizes the
  delete also hydrates the date-relative countdown. Do not make it optional
  "for old clients".
- **`daysUntil` is computed per request**, from the client's `today` and the
  activity's most recent completion. It has exactly one definition -
  `daysUntilExpression()` in `back-end/src/modules/activities/sql/activity-days-until.ts`
  - projected by both read models (`getActivitiesByUserId.query.ts`,
  `getActivityById.query.ts`) and by the repository's insert/update/load
  statements (`repos/activities.repository.ts`). Never inline the expression,
  never hardcode `0 AS days_until`, never reach for `CURRENT_DATE`.
  `IActivityRow.days_until` is **required** by the type: a new statement feeding
  `persistenceToDomain` must project it or it will not compile.
- **SQL rules**
  - Project `DATE` columns as `to_char(date, 'YYYY-MM-DD')`. The driver's default
    parser builds a local-midnight `Date` in the API process, which shifts the
    day for every positive offset.
  - Never use `CURRENT_DATE`, `CURRENT_TIMESTAMP`, `LOCALTIME` or `NOW()` to
    derive a **calendar date**. (Using `NOW()` for an instant column such as
    `updated_at` is correct and unrelated.)
  - **Never write `::` casts in raw SQL.** Knex scans `:name` tokens anywhere, so
    `:today::date` renders as `$1:$2` the moment a `date` binding exists.
    Use `CAST(x AS type)`. `src/shared/knex/sql-bindings.spec.ts` enforces this.
- Sessions are pinned to UTC (`knexfile.ts`) and `src/shared/knex/date-parsers.ts`
  returns `DATE` columns as strings — both are backstops, not a licence to use
  the database clock.
- Week maths (Mon–Sun) lives in
  `back-end/src/modules/activity-goals/domain/goal-performance.calculator.ts` and
  runs on UTC day numbers, so a week is always exactly seven days.

## Frontend

- **`useToday()` from `@/hooks/use-today` is the single source of "today".** It
  re-renders at the device's local midnight and on foreground. Never call
  `new Date()` during render to get a calendar date.
- Any query whose *response* depends on the date must include it in the cache
  key (`queryKeys.activities.all(today)`), or a device left open overnight keeps
  serving yesterday's `daysUntil`/counts.
- Date arithmetic goes through `front-end/utils/date.ts`, which works on UTC day
  numbers (`addDays`, `diffInDays`, `getWeekDates`, `getMonthDates`,
  `getWeekStartMonday`, `getLastNWeekRange`). Only the boundary converters
  (`YYYYMMDD`, `getTodayISO`, `formatDateISO`) read the device clock — and
  `getLastNWeekRange`'s default `endDate`, so always pass `today` explicitly.
  `toLocalDate` is display-only: do not do arithmetic on its result.
- Never use `Intl`/`toLocale*` for a value that must be stable (API payloads,
  chart labels): Hermes' ICU data is not guaranteed. Use `formatWeekLabel`-style
  deterministic formatting.
- Mutations read `YYYYMMDD()` at call time, not at render time, so a completion
  made just after local midnight is recorded against the new day.

## Testing

- `pnpm run test:timezones` (in both packages) runs the suite under UTC,
  `Pacific/Kiritimati` (UTC+14) and `America/Los_Angeles` (UTC-8). CI enforces it.
- `withoutAmbientTime()` — `test/setup/local-time-guard.ts` (frontend),
  `src/shared/testing/local-time-guard.ts` (backend) — swaps `Date` for a UTC-only
  stand-in whose local-time and `now()` entry points throw. Wrap date logic in it
  to *prove* it ignores the ambient clock and timezone.
- Integration/E2E keep the host's timezone (`test/global-setup.ts`) and send
  client dates that fall on a different day from the host's.
- `daysUntil` behaviour is asserted against a real database in
  `repos/activities.repository.int-spec.ts`. When touching that SQL, confirm the
  tests still fail if you reintroduce a literal — a green suite that passes with
  the placeholder is not evidence.

## Common mistakes

- Assuming the server's day equals the user's day, or that "the DB is UTC so
  it's fine".
- Adding a `today` fallback, or making it optional, to keep an old caller working.
- Hardcoding a derived value (`0 AS days_until`) to make a test or a type pass -
  that deletes the feature rather than fixing it.
- `new Date()` in a component body, or a `useMemo(() => range(new Date()), [])`
  that freezes the window at mount.
- `toISOString().slice(0, 10)` on a calendar date, or any UTC-noon trick that
  quietly shifts the day.
- Local `Date#setDate`/`getDay()` arithmetic on a `YYYY-MM-DD` string.

## Where it lives

| Concern | File |
|---|---|
| Client date query param | `back-end/src/modules/activities/dtos/today.dto.ts`, `activity-goals/dtos/getGoals.dto.ts` |
| Countdown definition | `back-end/src/modules/activities/sql/activity-days-until.ts` |
| Read models | `back-end/src/modules/activities/queries/{getActivitiesByUserId,getActivityById}.query.ts` |
| Week maths (API) | `back-end/src/modules/activity-goals/domain/goal-performance.calculator.ts` |
| DATE parsing / session TZ | `back-end/src/shared/knex/date-parsers.ts`, `back-end/knexfile.ts` |
| Calendar helpers (app) | `front-end/utils/date.ts` |
| "Today" for the app | `front-end/hooks/use-today.ts` |
| Date-scoped cache keys | `front-end/lib/query/keys.ts` |
