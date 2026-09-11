import {
  computeAdherence,
  computeHeatmapWeeks,
  filterApplicableWeeks,
  getCurrentWeekCount,
  getFirstCompletionWeek,
  getGoalWeekRange,
  getLastNWeekStarts,
  getWeekStartMonday,
  getWeeklyCounts,
} from './goal-performance.calculator';
import { withoutAmbientTime } from 'src/shared/testing/local-time-guard';

describe('goal-performance calculator', () => {
  describe('getWeekStartMonday', () => {
    it('returns Monday for a Wednesday', () => {
      expect(getWeekStartMonday('2026-08-05')).toBe('2026-08-03');
    });

    it('returns the same date when already Monday', () => {
      expect(getWeekStartMonday('2026-08-03')).toBe('2026-08-03');
    });

    it('groups Sunday into the week starting the previous Monday', () => {
      expect(getWeekStartMonday('2026-08-09')).toBe('2026-08-03');
    });

    it('handles year boundaries', () => {
      expect(getWeekStartMonday('2026-01-01')).toBe('2025-12-29');
    });
  });

  describe('getGoalWeekRange', () => {
    it('returns Monday-Sunday for the current week', () => {
      expect(getGoalWeekRange('2026-08-05')).toEqual({
        from: '2026-08-03',
        to: '2026-08-09',
      });
    });

    it('keeps Sunday in the same week', () => {
      expect(getGoalWeekRange('2026-08-09')).toEqual({
        from: '2026-08-03',
        to: '2026-08-09',
      });
    });
  });

  describe('getLastNWeekStarts', () => {
    it('returns consecutive Monday week starts ending on the current week', () => {
      expect(getLastNWeekStarts(3, '2026-08-05')).toEqual([
        '2026-07-20',
        '2026-07-27',
        '2026-08-03',
      ]);
    });
  });

  describe('getWeeklyCounts / getCurrentWeekCount', () => {
    const weekStarts = ['2026-07-27', '2026-08-03'];

    it('counts completions per Monday-Sunday week', () => {
      const events = ['2026-07-27', '2026-07-31', '2026-08-02', '2026-08-03'];
      expect(getWeeklyCounts(events, weekStarts, '2026-08-05')).toEqual([
        { weekStart: '2026-07-27', count: 3 },
        { weekStart: '2026-08-03', count: 1 },
      ]);
    });

    it('keeps Sunday within its own week', () => {
      const events = ['2026-08-02', '2026-08-09'];
      expect(getWeeklyCounts(events, weekStarts, '2026-08-05')).toEqual([
        { weekStart: '2026-07-27', count: 1 },
        { weekStart: '2026-08-03', count: 0 },
      ]);
    });

    it('caps the current partial week at today', () => {
      const events = ['2026-08-03', '2026-08-07'];
      expect(getWeeklyCounts(events, weekStarts, '2026-08-05')).toEqual([
        { weekStart: '2026-07-27', count: 0 },
        { weekStart: '2026-08-03', count: 1 },
      ]);
    });

    it('returns 0 for no completions', () => {
      expect(getWeeklyCounts([], weekStarts, '2026-08-05')).toEqual([
        { weekStart: '2026-07-27', count: 0 },
        { weekStart: '2026-08-03', count: 0 },
      ]);
    });

    it('counts multiple completions in one week', () => {
      const events = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
      expect(getCurrentWeekCount(events, '2026-08-05')).toBe(3);
    });
  });

  describe('getFirstCompletionWeek / filterApplicableWeeks', () => {
    it('returns null when there is no history', () => {
      expect(getFirstCompletionWeek([])).toBeNull();
    });

    it('returns the Monday of the earliest completion', () => {
      expect(getFirstCompletionWeek(['2026-08-05', '2026-07-15'])).toBe(
        '2026-07-13',
      );
    });

    it('excludes weeks before the first completion', () => {
      const buckets = [
        { weekStart: '2026-06-08', count: 0 },
        { weekStart: '2026-06-15', count: 2 },
        { weekStart: '2026-06-22', count: 0 },
      ];
      const applicable = filterApplicableWeeks(buckets, ['2026-06-17']);
      expect(applicable).toEqual([
        { weekStart: '2026-06-15', count: 2 },
        { weekStart: '2026-06-22', count: 0 },
      ]);
    });

    it('returns nothing when there is no history at all', () => {
      expect(
        filterApplicableWeeks([{ weekStart: '2026-06-15', count: 0 }], []),
      ).toEqual([]);
    });
  });

  describe('computeAdherence', () => {
    const target = 3;

    it('counts a met week at exactly the target', () => {
      const adherence = computeAdherence(
        [{ weekStart: '2026-08-03', count: 3 }],
        target,
      );
      expect(adherence).toEqual({ applicable: 1, met: 1, percentage: 1 });
    });

    it('counts a week below the target as missed', () => {
      const adherence = computeAdherence(
        [{ weekStart: '2026-08-03', count: 2 }],
        target,
      );
      expect(adherence).toEqual({ applicable: 1, met: 0, percentage: 0 });
    });

    it('counts a week above the target as met', () => {
      const adherence = computeAdherence(
        [{ weekStart: '2026-08-03', count: 5 }],
        target,
      );
      expect(adherence).toEqual({ applicable: 1, met: 1, percentage: 1 });
    });

    it('mixes met and missed weeks with equal weight', () => {
      const adherence = computeAdherence(
        [
          { weekStart: '2026-07-13', count: 3 },
          { weekStart: '2026-07-20', count: 2 },
          { weekStart: '2026-07-27', count: 5 },
          { weekStart: '2026-08-03', count: 0 },
        ],
        target,
      );
      expect(adherence).toEqual({ applicable: 4, met: 2, percentage: 0.5 });
    });

    it('returns null percentage when there are no applicable weeks', () => {
      const adherence = computeAdherence([], target);
      expect(adherence).toEqual({ applicable: 0, met: 0, percentage: null });
    });
  });

  describe('computeHeatmapWeeks', () => {
    it('includes the current partial week', () => {
      const heatmap = computeHeatmapWeeks(['2026-08-03'], '2026-08-05');
      expect(heatmap[heatmap.length - 1]).toEqual({
        weekStart: '2026-08-03',
        count: 1,
      });
    });

    it('covers the previous ~6 months (26 weeks)', () => {
      const heatmap = computeHeatmapWeeks(['2026-08-03'], '2026-08-05', 26);
      expect(heatmap).toHaveLength(1);
      expect(heatmap[0].weekStart).toBe('2026-08-03');
    });

    it('excludes weeks before the relevant history', () => {
      const events = ['2026-07-06', '2026-07-13'];
      const heatmap = computeHeatmapWeeks(events, '2026-08-05', 26);
      expect(heatmap[0].weekStart).toBe('2026-07-06');
      expect(heatmap.some((w) => w.weekStart < '2026-07-06')).toBe(false);
    });

    it('returns [] when the activity has no history', () => {
      expect(computeHeatmapWeeks([], '2026-08-05')).toEqual([]);
    });

    it('has 26 weeks for long history', () => {
      const events: string[] = [];
      for (let i = 0; i < 26 * 7; i++) {
        events.push(
          new Date(Date.UTC(2026, 1, 2 + i)).toISOString().slice(0, 10),
        );
      }
      const heatmap = computeHeatmapWeeks(events, '2026-08-05', 26);
      expect(heatmap).toHaveLength(26);
      expect(heatmap[0].weekStart).toBe('2026-02-09');
    });
  });

  describe('client-today anchoring', () => {
    it('computes the current week from the supplied today, not a server date', () => {
      const events = ['2026-08-08', '2026-08-09', '2026-08-10'];
      // Sunday -> the week Mon 03 Aug - Sun 09 Aug includes the 08 and 09
      expect(getCurrentWeekCount(events, '2026-08-09')).toBe(2);
      // Monday -> a fresh week starts, only the 10 counts so far
      expect(getCurrentWeekCount(events, '2026-08-10')).toBe(1);
    });
  });

  /**
   * The API host may sit in any timezone, and it is frequently on a different
   * calendar date from the user. Every function here therefore has to work
   * purely from its `YYYY-MM-DD` arguments.
   */
  describe('timezone independence', () => {
    it('never reads the host clock or the host timezone', () => {
      withoutAmbientTime(() => {
        expect(getWeekStartMonday('2026-08-05')).toBe('2026-08-03');
        expect(getGoalWeekRange('2026-08-05')).toEqual({
          from: '2026-08-03',
          to: '2026-08-09',
        });
        expect(getLastNWeekStarts(3, '2026-08-05')).toEqual([
          '2026-07-20',
          '2026-07-27',
          '2026-08-03',
        ]);
        expect(
          getWeeklyCounts(['2026-08-03'], ['2026-08-03'], '2026-08-05'),
        ).toEqual([{ weekStart: '2026-08-03', count: 1 }]);
        expect(getCurrentWeekCount(['2026-08-03'], '2026-08-05')).toBe(1);
        expect(getFirstCompletionWeek(['2026-08-05'])).toBe('2026-08-03');
        expect(
          filterApplicableWeeks(
            [{ weekStart: '2026-08-03', count: 1 }],
            ['2026-08-03'],
          ),
        ).toEqual([{ weekStart: '2026-08-03', count: 1 }]);
        expect(computeHeatmapWeeks(['2026-08-03'], '2026-08-05')).toEqual([
          { weekStart: '2026-08-03', count: 1 },
        ]);
        expect(
          computeAdherence([{ weekStart: '2026-08-03', count: 3 }], 3),
        ).toEqual({ applicable: 1, met: 1, percentage: 1 });
      });
    });

    it('keeps calendar arithmetic stable across DST transitions', () => {
      // US spring-forward (2026-03-08) and autumn fall-back (2026-11-01), plus
      // the southern-hemisphere equivalents. A day is always exactly one day,
      // regardless of whether a 23- or 25-hour day sits between the two dates.
      const dstDates = ['2026-03-07', '2026-03-08', '2026-03-09'];
      expect(dstDates.map(getWeekStartMonday)).toEqual([
        '2026-03-02',
        '2026-03-02',
        '2026-03-09',
      ]);

      expect(getGoalWeekRange('2026-11-01')).toEqual({
        from: '2026-10-26',
        to: '2026-11-01',
      });

      // Weeks stay exactly seven calendar days apart across both transitions.
      // Asserted as literal dates so the expectation is independent of the
      // arithmetic under test.
      expect(getLastNWeekStarts(6, '2026-11-02')).toEqual([
        '2026-09-28',
        '2026-10-05',
        '2026-10-12',
        '2026-10-19',
        '2026-10-26',
        '2026-11-02',
      ]);
    });

    it('treats a client date ahead of the server date as its own week', () => {
      // A UTC+13 client: their 2026-03-02 (Monday) is still 2026-03-01 on a
      // UTC server. The week must be the client's, not the server's.
      expect(getGoalWeekRange('2026-03-02')).toEqual({
        from: '2026-03-02',
        to: '2026-03-08',
      });
      expect(getCurrentWeekCount(['2026-03-02'], '2026-03-02')).toBe(1);
    });
  });
});
