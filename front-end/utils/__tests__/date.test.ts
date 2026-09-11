import { withoutAmbientTime } from '@/test/setup/local-time-guard';
import {
  addDays,
  diffInDays,
  formatDateISO,
  formatWeekLabel,
  getLastNWeekRange,
  getMonthDates,
  getMonthOf,
  getTodayISO,
  getWeekDates,
  getWeekStartMonday,
  toLocalDate,
  YYYYMMDD,
} from '../date';

describe('date utils', () => {
  describe('formatDateISO', () => {
    it('formats a date as YYYY-MM-DD', () => {
      const date = new Date(2026, 6, 28); // July 28, 2026
      expect(formatDateISO(date)).toBe('2026-07-28');
    });

    it('zero-pads single-digit months and days', () => {
      const date = new Date(2026, 0, 5); // January 5, 2026
      expect(formatDateISO(date)).toBe('2026-01-05');
    });

    it('reads the device-local calendar date, whatever the offset is', () => {
      // Built from local components, so it round-trips to the same calendar day
      // in every timezone the test process could be running in.
      expect(formatDateISO(new Date(2026, 2, 2, 0, 0, 1))).toBe('2026-03-02');
      expect(formatDateISO(new Date(2026, 2, 2, 23, 59, 59))).toBe(
        '2026-03-02',
      );
    });
  });

  describe('YYYYMMDD', () => {
    // This value is the calendar date sent to the API, so it must be derived
    // from the local date parts and never from locale/ICU formatting.
    it('is built from the local date parts, not the runtime locale', () => {
      const lateEvening = new Date(2026, 6, 28, 23, 30);
      expect(YYYYMMDD(lateEvening)).toBe('2026-07-28');
      expect(YYYYMMDD(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
    });

    it('always returns a YYYY-MM-DD shaped date', () => {
      expect(YYYYMMDD()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns today in YYYY-MM-DD format by default', () => {
      const today = new Date();
      const expected = new Intl.DateTimeFormat('en-CA').format(today);
      expect(YYYYMMDD()).toBe(expected);
    });

    it('formats a given date in YYYY-MM-DD format', () => {
      const date = new Date(2026, 6, 28);
      expect(YYYYMMDD(date)).toBe('2026-07-28');
    });

    it('is the same value as getTodayISO', () => {
      const date = new Date(2026, 2, 2, 12);
      expect(getTodayISO(date)).toBe(YYYYMMDD(date));
      expect(getTodayISO(date)).toBe('2026-03-02');
    });
  });

  describe('getWeekStartMonday', () => {
    it('returns Monday for a Wednesday date', () => {
      expect(getWeekStartMonday('2026-03-04')).toBe('2026-03-02');
    });

    it('returns the same date when the input is already Monday', () => {
      expect(getWeekStartMonday('2026-03-02')).toBe('2026-03-02');
    });

    it('groups Sunday into the week starting the previous Monday', () => {
      expect(getWeekStartMonday('2026-03-08')).toBe('2026-03-02');
    });

    it('handles year boundaries', () => {
      expect(getWeekStartMonday('2026-01-01')).toBe('2025-12-29');
    });

    it('matches the backend week maths, which is UTC day-number based', () => {
      // The API computes week boundaries from these same strings; a divergence
      // here would put the client and the server in different weeks.
      const reference = (dateStr: string): string => {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dayNumber = Math.floor(
          Date.UTC(year, month - 1, day) / 86_400_000,
        );
        const daysSinceMonday = (((dayNumber - 4) % 7) + 7) % 7;
        const date = new Date((dayNumber - daysSinceMonday) * 86_400_000);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      };

      for (let day = 1; day <= 28; day++) {
        const dateStr = `2026-02-${String(day).padStart(2, '0')}`;
        expect(getWeekStartMonday(dateStr)).toBe(reference(dateStr));
      }
    });
  });

  describe('getWeekDates', () => {
    it('returns the seven Mon-Sun dates of the containing week', () => {
      expect(getWeekDates('2026-03-04')).toEqual([
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
      ]);
    });
  });

  describe('addDays / diffInDays', () => {
    it('counts calendar days, not elapsed hours', () => {
      expect(addDays('2026-03-01', 1)).toBe('2026-03-02');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('walks across a month and a year boundary', () => {
      expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
      expect(diffInDays('2027-01-01', '2026-12-31')).toBe(1);
    });
  });

  describe('getLastNWeekRange', () => {
    it('returns consecutive Monday week starts ending on the given date', () => {
      const range = getLastNWeekRange(3, new Date(2026, 2, 10));

      expect(range.from).toBe('2026-02-23');
      expect(range.to).toBe('2026-03-10');
      expect(range.weekStarts).toEqual([
        '2026-02-23',
        '2026-03-02',
        '2026-03-09',
      ]);
    });

    it('accepts a calendar date string, as the screens pass', () => {
      expect(getLastNWeekRange(3, '2026-03-10')).toEqual({
        from: '2026-02-23',
        to: '2026-03-10',
        weekStarts: ['2026-02-23', '2026-03-02', '2026-03-09'],
      });
    });

    it('keeps every week exactly seven days apart across DST transitions', () => {
      // US spring-forward (2026-03-08) and fall-back (2026-11-01).
      for (const today of ['2026-03-08', '2026-03-09', '2026-11-01']) {
        const { weekStarts } = getLastNWeekRange(8, today);
        for (let i = 1; i < weekStarts.length; i++) {
          expect(diffInDays(weekStarts[i], weekStarts[i - 1])).toBe(7);
        }
        weekStarts.forEach((weekStart) =>
          expect(getWeekStartMonday(weekStart)).toBe(weekStart),
        );
      }
    });
  });

  describe('getMonthDates', () => {
    it('returns the whole month for a past month, capped at its real length', () => {
      const dates = getMonthDates('2026-02', '2026-03-10');
      expect(dates).toHaveLength(28);
      expect(dates[0]).toBe('2026-02-01');
      expect(dates[dates.length - 1]).toBe('2026-02-28');
    });

    it('never renders a future date in the current month', () => {
      expect(getMonthDates('2026-03', '2026-03-02')).toEqual([
        '2026-03-01',
        '2026-03-02',
      ]);
    });

    it('returns nothing for a month that has not started', () => {
      expect(getMonthDates('2026-04', '2026-03-02')).toEqual([]);
    });

    it('walks the last day of a month without slipping a day', () => {
      // A UTC-midnight Date read back with local getters would report
      // 2026-03-30 for the last day on any negative UTC offset.
      const march = getMonthDates('2026-03', '2026-04-15');
      expect(march).toHaveLength(31);
      expect(march[march.length - 1]).toBe('2026-03-31');
    });

    it('handles a leap February', () => {
      expect(getMonthDates('2028-02', '2028-03-01')).toHaveLength(29);
    });
  });

  describe('formatWeekLabel', () => {
    it('labels a week without depending on the runtime locale', () => {
      expect(formatWeekLabel('2026-03-02')).toBe('Mar 2');
      expect(formatWeekLabel('2026-01-05')).toBe('Jan 5');
      expect(formatWeekLabel('2026-12-28')).toBe('Dec 28');
    });
  });

  describe('toLocalDate', () => {
    it('round-trips a calendar date through the device timezone', () => {
      expect(formatDateISO(toLocalDate('2026-03-02'))).toBe('2026-03-02');
    });
  });

  /**
   * A JS runtime only exposes one timezone at a time, so these assert the
   * stronger property directly: the calendar helpers derive everything from the
   * string they are handed and read neither the device clock nor its offset.
   */
  describe('timezone independence', () => {
    it('never reads the device clock or the device timezone', () => {
      withoutAmbientTime(() => {
        expect(getWeekStartMonday('2026-03-04')).toBe('2026-03-02');
        expect(getWeekDates('2026-03-04')).toHaveLength(7);
        expect(addDays('2026-03-02', 7)).toBe('2026-03-09');
        expect(diffInDays('2026-03-09', '2026-03-02')).toBe(7);
        expect(getLastNWeekRange(3, '2026-03-10')).toEqual({
          from: '2026-02-23',
          to: '2026-03-10',
          weekStarts: ['2026-02-23', '2026-03-02', '2026-03-09'],
        });
        expect(getMonthDates('2026-03', '2026-03-02')).toEqual([
          '2026-03-01',
          '2026-03-02',
        ]);
        expect(getMonthOf('2026-03-02')).toBe('2026-03');
        expect(formatWeekLabel('2026-03-02')).toBe('Mar 2');
      });
    });
  });

  /**
   * The API host, the database and the device can each be on a different
   * calendar date. These scenarios pin the client's half of that contract: the
   * date the app works with is always the *device's* local calendar date.
   */
  describe('frontend and backend on different calendar dates', () => {
    it('takes the device date even when UTC is still on the previous day', () => {
      // Device at UTC+13, 09:00 local on 2026-03-02 == 2026-03-01T20:00Z. A UTC
      // server is still on 2026-03-01; the device is already on Monday the 2nd.
      const deviceInstant = new Date(2026, 2, 2, 9, 0);

      expect(YYYYMMDD(deviceInstant)).toBe('2026-03-02');
      expect(getTodayISO(deviceInstant)).toBe('2026-03-02');
      expect(getWeekStartMonday(getTodayISO(deviceInstant))).toBe('2026-03-02');
    });

    it('takes the device date even when UTC has already rolled over', () => {
      // Device at UTC-8, 21:00 local on 2026-03-01 == 2026-03-02T05:00Z. The
      // server has already moved on; the device has not.
      const deviceInstant = new Date(2026, 2, 1, 21, 0);

      expect(YYYYMMDD(deviceInstant)).toBe('2026-03-01');
      // Sunday, so the device's week is the one that started 2026-02-23.
      expect(getWeekStartMonday(getTodayISO(deviceInstant))).toBe('2026-02-23');
    });

    it('gives every offset the same answer for the same device date', () => {
      // Whatever the offset, a device date of 2026-03-02 is a Monday and its
      // week is 2026-03-02..2026-03-08. Nothing here consults an offset.
      expect(
        ['2026-03-02', '2026-03-01', '2026-03-03'].map(getWeekStartMonday),
      ).toEqual(['2026-03-02', '2026-02-23', '2026-03-02']);
    });
  });
});
