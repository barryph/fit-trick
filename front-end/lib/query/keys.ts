/**
 * Every date's detail entry for one activity.
 *
 * Kept as a separate prefix (rather than a one-off literal at the call site) so
 * it cannot drift out of shape from `detail`, which extends it with the date.
 */
function activityDetails(id: number | string) {
  return ['activities', 'detail', String(id)] as const;
}

export const queryKeys = {
  activities: {
    /**
     * Prefix matching every activities query (list and detail, any date).
     * Used by category mutations to invalidate the whole feature.
     */
    base: ['activities'] as const,
    /**
     * Prefix matching only the activities *list* queries, so a cache patch
     * written for one date cannot be applied to a detail entry (whose data is
     * a single activity, not an array) or to another day's list.
     */
    list: ['activities', 'list'] as const,
    /**
     * The activities list is date-dependent (`daysUntil`, `currentWeekCount`),
     * so the user's local date is part of the key: a device left open across
     * midnight must not keep serving yesterday's counts from the cache.
     */
    all: (today: string) => ['activities', 'list', today] as const,
    details: activityDetails,
    detail: (id: number | string, today: string) =>
      [...activityDetails(id), today] as const,
  },
  categories: {
    all: ['categories'] as const,
  },
  timeline: {
    all: ['timeline'] as const,
    month: (month: string) => ['timeline', month] as const,
  },
  events: {
    all: ['events'] as const,
    range: (from: string, to: string) => ['events', from, to] as const,
  },
  goals: {
    // Prefix matching every goals query (list + any detail, any date).
    // Used by mutations to invalidate goals after activity/category changes.
    base: ['goals'] as const,
    all: (today: string) => ['goals', 'all', today] as const,
    detail: (activityId: number | string, today: string) =>
      ['goals', String(activityId), today] as const,
  },
};
