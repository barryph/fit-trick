/**
 * Versioned storage keys for client-persisted state.
 * Scope user-specific keys by userId so accounts on one device stay isolated.
 */
export const storageKeys = {
  activityQueue: (userId: string) => `activity-queue:v1:${userId}`,
  /**
   * Versioned key for a finished/dismissed guide. `pageId` should describe
   * which page's onboarding this is (e.g. `home`), so each page keeps its own
   * independent auto-show state.
   */
  guideCompleted: (pageId: string) => `guide-completed:v1:${pageId}`,
  /**
   * Tracks that a user has completed at least one activity (for the
   * `first_activity_completed` analytics event).
   */
  userCompletedActivity: (userId: string) => `user-completed:v1:${userId}`,
} as const;
