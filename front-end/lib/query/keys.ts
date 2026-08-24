export const queryKeys = {
  activities: {
    all: ['activities'] as const,
    detail: (id: number | string) => ['activities', String(id)] as const,
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
