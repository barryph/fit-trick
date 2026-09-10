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

/**
 * Returns the current local month as YYYY-MM.
 */
export function getCurrentMonth(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseDateISO(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Returns the Monday (YYYY-MM-DD) of the calendar week containing the given date.
 * Weeks run Monday -> Sunday in local time.
 */
export function getWeekStartMonday(dateStr: string): string {
  const date = parseDateISO(dateStr);
  const dayOfWeek = date.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return formatDateISO(date);
}

export function getWeekStartMondayFromDate(date: Date): string {
  return getWeekStartMonday(formatDateISO(date));
}

export interface WeekRange {
  from: string;
  to: string;
  weekStarts: string[];
}

/**
 * Returns a date range covering the last N calendar weeks (Mon-Sun),
 * ending on the given date (defaults to today).
 */
export function getLastNWeekRange(
  weekCount = 12,
  endDate = new Date(),
): WeekRange {
  const to = formatDateISO(endDate);
  const currentWeekStart = parseDateISO(getWeekStartMondayFromDate(endDate));

  const weekStarts: string[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - i * 7);
    weekStarts.push(formatDateISO(weekStart));
  }

  return {
    from: weekStarts[0],
    to,
    weekStarts,
  };
}

/**
 * Formats a week start date as a short label for chart axes.
 */
export function formatWeekLabel(weekStart: string): string {
  const date = parseDateISO(weekStart);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}
