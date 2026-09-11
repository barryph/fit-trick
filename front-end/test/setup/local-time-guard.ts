/**
 * Test helper that proves a piece of code cannot depend on the device clock or
 * the device timezone.
 *
 * A JS runtime only exposes one timezone at a time, so "run the same assertion
 * in three timezones" on its own cannot show that a function ignores the
 * ambient one. Swapping in a `Date` whose local-time and "now" entry points
 * throw is a positive proof: if the code under test still produces the expected
 * result, it derived everything from the arguments it was given.
 */

const REAL_DATE = Date;

/**
 * Runs `fn` with `Date` replaced by a UTC-only stand-in.
 *
 * Allowed: `Date.UTC`, `new Date(number)`, `new Date(string)`, `new Date(y, m,
 * d, ...)` and the `getUTC*` accessors - none of these consult the host
 * timezone for arithmetic.
 *
 * Forbidden (they read the host timezone or the host clock):
 * `new Date()` with no arguments, `Date.now()`, `getTimezoneOffset()`, every
 * local-field accessor, and any `to*String()`/`toLocale*` conversion.
 */
export function withoutAmbientTime<T>(fn: () => T): T {
  class UtcOnlyDate extends REAL_DATE {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        throw new Error(
          'Ambient clock read: new Date() depends on the host timezone.',
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...(args as []));
    }

    static now(): number {
      throw new Error('Ambient clock read: Date.now() is the host clock.');
    }

    getTimezoneOffset(): number {
      throw new Error('Ambient timezone read: getTimezoneOffset().');
    }

    getFullYear(): number {
      throw new Error('Ambient timezone read: getFullYear().');
    }

    getMonth(): number {
      throw new Error('Ambient timezone read: getMonth().');
    }

    getDate(): number {
      throw new Error('Ambient timezone read: getDate().');
    }

    getDay(): number {
      throw new Error('Ambient timezone read: getDay().');
    }

    getHours(): number {
      throw new Error('Ambient timezone read: getHours().');
    }

    toString(): string {
      throw new Error('Ambient timezone read: toString().');
    }

    toDateString(): string {
      throw new Error('Ambient timezone read: toDateString().');
    }

    toLocaleString(): string {
      throw new Error('Ambient timezone read: toLocaleString().');
    }

    toLocaleDateString(): string {
      throw new Error('Ambient timezone read: toLocaleDateString().');
    }
  }

  (globalThis as { Date: unknown }).Date = UtcOnlyDate;
  try {
    return fn();
  } finally {
    (globalThis as { Date: unknown }).Date = REAL_DATE;
  }
}
