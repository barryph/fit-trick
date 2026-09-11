/**
 * Calendar-date helpers.
 *
 * Two different kinds of value live in this app and they must not be confused:
 *
 *  - **Instants** (session expiry, `created_at`). Correctly handled by `Date`
 *    and absolute timestamps; never touched here.
 *  - **Calendar dates** (a completion's date, "today", a week's Monday). These
 *    are the *user's* local dates, not the server's and not UTC. They are
 *    represented everywhere as opaque `YYYY-MM-DD` strings.
 *
 * Every function below operates on those strings. Where arithmetic is needed it
 * goes through UTC day numbers rather than `Date#setDate`, so a day is always
 * exactly one day: no DST transition, no host timezone and no device offset can
 * make a week 6 or 8 days long or land a date on the wrong calendar day.
 *
 * The only functions that read the device clock or its local fields are the
 * explicit boundary converters (`YYYYMMDD`, `formatDateISO`), which exist
 * precisely to turn the device's instant into the user's calendar date.
 */

const DAY_IN_MS = 86_400_000;
const DAYS_IN_WEEK = 7;

/** 1970-01-05 (day number 4) is a Monday, so 0 => Monday and 6 => Sunday. */
const MONDAY_DAY_NUMBER = 4;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Calendar date (YYYY-MM-DD) of a device-local `Date`. */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the date in YYYY-MM-DD format,
 * The date is local, aka matches the current devices date.
 */
export function YYYYMMDD(date = new Date()): string {
  // Built from the local date parts rather than via Intl: this value is the
  // calendar date sent to the API, and a locale-derived format is at the mercy
  // of the engine's ICU data (Hermes historically resolves locales
  // inconsistently, e.g. 'en-CA' degrading to M/D/YYYY). The backend treats it
  // as an opaque calendar date, so it must never depend on the device locale.
  return formatDateISO(date);
}

/** Alias that reads better at call sites that mean "the user's today". */
export function getTodayISO(date = new Date()): string {
  return YYYYMMDD(date);
}

/** The `YYYY-MM` month a `YYYY-MM-DD` calendar date falls in. */
export function getMonthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Day number since the epoch, counted in whole calendar days.
 *
 * Uses `Date.UTC`, which is immune to the host timezone and to DST, so
 * subtracting two day numbers is always a count of calendar days.
 */
function toDayNumber(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_IN_MS);
}

function fromDayNumber(dayNumber: number): string {
  const date = new Date(dayNumber * DAY_IN_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Adds (or subtracts) whole calendar days from a `YYYY-MM-DD` date. */
export function addDays(dateStr: string, days: number): string {
  return fromDayNumber(toDayNumber(dateStr) + days);
}

/**
 * Number of calendar days between two `YYYY-MM-DD` dates (`to - from`).
 * Negative when `to` precedes `from`.
 */
export function diffInDays(to: string, from: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * Builds a device-local `Date` for a calendar date, for display formatting
 * only. Never use the result for arithmetic or to derive a date string again -
 * go through the string helpers above instead.
 */
function parseDateISO(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Returns the Monday (YYYY-MM-DD) of the calendar week containing the given date.
 * Weeks run Monday -> Sunday in the user's local calendar.
 */
export function getWeekStartMonday(dateStr: string): string {
  const dayNumber = toDayNumber(dateStr);
  const daysSinceMonday =
    (((dayNumber - MONDAY_DAY_NUMBER) % DAYS_IN_WEEK) + DAYS_IN_WEEK) %
    DAYS_IN_WEEK;
  return fromDayNumber(dayNumber - daysSinceMonday);
}

/** The Monday-Sunday dates of the week containing `dateStr`. */
export function getWeekDates(dateStr: string): string[] {
  const weekStart = getWeekStartMonday(dateStr);
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    addDays(weekStart, index),
  );
}

export interface WeekRange {
  from: string;
  to: string;
  weekStarts: string[];
}

/**
 * Returns a date range covering the last N calendar weeks (Mon-Sun),
 * ending on the given date (defaults to today).
 *
 * Takes the user's calendar date as a string; a `Date` is still accepted for
 * callers that already hold a device instant, and is converted through its
 * local calendar date.
 */
export function getLastNWeekRange(
  weekCount = 12,
  endDate: string | Date = new Date(),
): WeekRange {
  const to = typeof endDate === 'string' ? endDate : formatDateISO(endDate);
  const currentWeekStart = toDayNumber(getWeekStartMonday(to));

  const weekStarts: string[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    weekStarts.push(fromDayNumber(currentWeekStart - i * DAYS_IN_WEEK));
  }

  return {
    from: weekStarts[0],
    to,
    weekStarts,
  };
}

/**
 * Every calendar date of `month` (YYYY-MM) up to and including `today`, or the
 * whole month when `month` is in the past.
 *
 * Future dates are never produced: a timeline cell for tomorrow would offer to
 * complete a habit that has not happened yet. The cap is derived from the
 * caller's `today` string, so it follows the user's calendar rather than the
 * device's current instant.
 */
export function getMonthDates(month: string, today: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
  // Day 0 of the following month is the last day of this one. Computed through
  // UTC day numbers so the result cannot slide into the neighbouring day on a
  // device whose offset differs from UTC.
  const lastDay = fromDayNumber(
    Math.floor(Date.UTC(year, monthNumber, 0) / DAY_IN_MS),
  );
  const currentDay = today > lastDay ? lastDay : today;

  if (currentDay < firstDay) {
    return [];
  }

  const dates: string[] = [];
  for (let day = toDayNumber(firstDay); day <= toDayNumber(currentDay); day++) {
    dates.push(fromDayNumber(day));
  }
  return dates;
}

/**
 * Formats a week start date as a short label for chart axes.
 *
 * Deliberately not `Intl`-based: this string is a fixed chart axis label, and
 * the runtime's ICU data is not guaranteed (Hermes may ignore the options
 * object entirely and return a full numeric date).
 */
export function formatWeekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split('-').map(Number);
  return `${MONTH_LABELS[month - 1]} ${day}`;
}

/** `YYYY-MM-DD` -> a device-local `Date` at local midnight (display only). */
export function toLocalDate(dateStr: string): Date {
  return parseDateISO(dateStr);
}
