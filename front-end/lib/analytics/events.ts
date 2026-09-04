/**
 * Central catalog of custom Analytics events and their parameters.
 *
 * Single source of truth so event names stay consistent and Firebase reports
 * stay clean. Only *custom* events are listed here — events Firebase already
 * collects automatically (first_open, session_start, app_open, app_exception,
 * etc.) are intentionally not duplicated. Recommended events (sign_up, login,
 * screen_view) are logged through the wrapped RNFirebase helpers but their
 * names are enumerated here for discoverability.
 *
 * Fire the events through `lib/analytics/analytics.ts`, never by importing
 * these names into screens directly.
 */

/**
 * Onboarding = the Home guide modal (see `hooks/use-guide.ts` and
 * `components/guide/home-guide-steps.tsx`). Each of these lets us measure the
 * onboarding funnel: start, per-step reach, per-step completion, finish, and
 * abandonment ("skip" = dismissed without completing).
 */
export const EVENTS = {
  /** Guide opened / first step shown. Param: `page_id`. */
  ONBOARDING_START: 'onboarding_start',
  /** A guide step was shown. Params: `step_index`, `step_name`, `step_count`. */
  ONBOARDING_STEP_VIEW: 'onboarding_step_view',
  /** The user advanced past a step. Param: `step_index`. */
  ONBOARDING_STEP_COMPLETE: 'onboarding_step_complete',
  /** The user finished the final guide step. Param: `step_count`. */
  ONBOARDING_COMPLETE: 'onboarding_complete',
  /** The guide was dismissed without completing. Params: `step_index`, `step_count`. */
  ONBOARDING_SKIP: 'onboarding_skip',

  /** Recommended event: registration succeeded. Param: `method`. */
  SIGN_UP: 'sign_up',
  /** Registration failed. Params: `method`, `error_code`. */
  SIGN_UP_FAILED: 'sign_up_failed',
  /** Recommended event: login succeeded. Param: `method`. */
  LOGIN: 'login',
  /** Login failed. Params: `method`, `error_code`. */
  LOGIN_FAILED: 'login_failed',

  /** Activity created (first creation = initial setup). Param: `has_goal`. */
  CREATE_ACTIVITY: 'create_activity',
  /** Activity edited. */
  EDIT_ACTIVITY: 'edit_activity',
  /** Activity deleted. */
  DELETE_ACTIVITY: 'delete_activity',

  /** Category created (feature adoption). */
  CREATE_CATEGORY: 'create_category',

  /** The user's very first activity completion ever (first meaningful action). */
  FIRST_ACTIVITY_COMPLETED: 'first_activity_completed',
  /** Any activity completion (subsequent completions). */
  ACTIVITY_COMPLETED: 'activity_completed',

  /** Route focus. Param: `screen_name`. */
  SCREEN_VIEW: 'screen_view',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Which screen/route name is current (for `screen_view`). */
export type ScreenName = string;

/** Auth method reported on sign-up/login events. */
export type AuthMethod = 'password' | 'google' | 'apple';

/** Short, stable app error codes used as event params (never raw messages). */
export type ErrorCode = string;
