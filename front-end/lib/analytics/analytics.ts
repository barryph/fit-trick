/**
 * Thin, type-safe wrapper around `@react-native-firebase/analytics` (v26
 * modular API).
 *
 * Centralizes Firebase-specific analytics detail and guarantees analytics can
 * never break the app: every public call is non-throwing and fails silently
 * (factory errors / missing native module log to console and return).
 *
 * Analytics collection is enabled in all build variants (free tier). We rely on
 * Firebase's automatic events (first_open, session_start, app_open,
 * user_engagement, app_exception, screen_view via auto screen tracking) and
 * only send the intentional custom events in `lib/analytics/events.ts`.
 *
 * NOTE: `logScreenView` is called from a generic hook
 * (`lib/analytics/use-screen-tracking.ts`) rather than scattering navigation
 * calls through the app.
 */
import {
  getAnalytics,
  logEvent as rnfbLogEvent,
  logScreenView as rnfbLogScreenView,
  logSignUp as rnfbLogSignUp,
  logLogin as rnfbLogLogin,
  setUserId as rnfbSetUserId,
  type Analytics,
} from '@react-native-firebase/analytics';

import { EVENTS, type AuthMethod, type ErrorCode } from './events';

let instance: Analytics | null = null;

/**
 * Lazily resolve the (default) Analytics instance. Non-throwing so analytics
 * can never crash the app even if the native module isn't available.
 */
function getInstance(): Analytics | null {
  if (instance) return instance;
  try {
    instance = getAnalytics();
  } catch (e) {
    console.warn('analytics.getAnalytics failed', e);
    return null;
  }
  return instance;
}

/** Attach the app's opaque user id (never an email) to analytics sessions. */
export function setAnalyticsUserId(userId: string | null | undefined): void {
  const analytics = getInstance();
  if (!analytics) return;
  void rnfbSetUserId(analytics, userId?.toString() ?? null).catch((e) =>
    console.warn('analytics.setUserId failed', e),
  );
}

/** Fire a custom analytics event without throwing (best-effort). */
export function logEvent(
  event: string,
  params?: Record<string, unknown>,
): void {
  const analytics = getInstance();
  if (!analytics) return;
  try {
    rnfbLogEvent(analytics, event, params);
  } catch (e) {
    // Analytics must never crash the app, even mid-render.
    console.warn(`analytics.logEvent(${event}) threw`, e);
  }
}

/**
 * Onboarding funnel events. `step_count` is fixed for a given guide — screens
 * should pass the real total for exact reporting.
 */
export function logOnboardingStart(pageId: string): void {
  logEvent(EVENTS.ONBOARDING_START, { page_id: pageId });
}

export function logOnboardingStepView(
  stepIndex: number,
  stepName: string,
  stepCount: number,
): void {
  logEvent(EVENTS.ONBOARDING_STEP_VIEW, {
    step_index: stepIndex,
    step_name: stepName,
    step_count: stepCount,
  });
}

export function logOnboardingStepComplete(
  stepIndex: number,
  stepCount: number,
): void {
  logEvent(EVENTS.ONBOARDING_STEP_COMPLETE, {
    step_index: stepIndex,
    step_count: stepCount,
  });
}

export function logOnboardingComplete(stepCount: number): void {
  logEvent(EVENTS.ONBOARDING_COMPLETE, { step_count: stepCount });
}

export function logOnboardingSkip(stepIndex: number, stepCount: number): void {
  logEvent(EVENTS.ONBOARDING_SKIP, {
    step_index: stepIndex,
    step_count: stepCount,
  });
}

/** Recommended sign_up / login events (method = how the user authenticated). */
export function logSignUp(method: AuthMethod): void {
  const analytics = getInstance();
  if (!analytics) return;
  void rnfbLogSignUp(analytics, { method }).catch((e) =>
    console.warn('analytics.logSignUp failed', e),
  );
}

export function logLogin(method: AuthMethod): void {
  const analytics = getInstance();
  if (!analytics) return;
  void rnfbLogLogin(analytics, { method }).catch((e) =>
    console.warn('analytics.logLogin failed', e),
  );
}

export function logSignUpFailed(
  method: AuthMethod,
  errorCode: ErrorCode,
): void {
  logEvent(EVENTS.SIGN_UP_FAILED, { method, error_code: errorCode });
}

export function logLoginFailed(method: AuthMethod, errorCode: ErrorCode): void {
  logEvent(EVENTS.LOGIN_FAILED, { method, error_code: errorCode });
}

/** Core action events (activity / category usage). */
export function logCreateActivity(hasGoal: boolean): void {
  logEvent(EVENTS.CREATE_ACTIVITY, { has_goal: hasGoal });
}

export function logEditActivity(): void {
  logEvent(EVENTS.EDIT_ACTIVITY);
}

export function logDeleteActivity(): void {
  logEvent(EVENTS.DELETE_ACTIVITY);
}

export function logCreateCategory(): void {
  logEvent(EVENTS.CREATE_CATEGORY);
}

/** Any activity completion (fired on every completion). */
export function logActivityCompleted(): void {
  logEvent(EVENTS.ACTIVITY_COMPLETED);
}

/** Fired once for the user's first-ever completion. */
export function logFirstActivityCompleted(): void {
  logEvent(EVENTS.FIRST_ACTIVITY_COMPLETED);
}

export function logScreenView(screenName: string): void {
  const analytics = getInstance();
  if (!analytics) return;
  void rnfbLogScreenView(analytics, {
    screen_name: screenName,
    screen_class: screenName,
  }).catch((e) => console.warn('analytics.logScreenView failed', e));
}
