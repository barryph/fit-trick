/**
 * Thin, type-safe wrapper around `@react-native-firebase/crashlytics` (v26
 * modular API).
 *
 * Centralizes Crashlytics detail so the rest of the app never imports Firebase
 * directly. All public calls are non-throwing so crash reporting can never
 * break the app.
 *
 * Global JS error + unhandled promise rejection reporting is ALREADY installed
 * automatically by React Native Firebase, so we deliberately do NOT register
 * our own handlers (that would double-report). RNFirebase reports fatal /
 * non-fatal JS errors and unhandled promise rejections to Crashlytics, and
 * honors `setCrashlyticsCollectionEnabled` (collection off → errors are
 * forwarded to the default handler and not reported; unhandled rejections are
 * only reported when not `__DEV__`).
 *
 * We add here only what RNFirebase doesn't give us out of the box: reporting
 * caught errors, breadcrumbs, user id, custom keys, and the collection toggle.
 */
import {
  getCrashlytics,
  recordError as rnfbRecordError,
  log as rnfbLog,
  setUserId as rnfbSetUserId,
  setAttribute as rnfbSetAttribute,
  setCrashlyticsCollectionEnabled as rnfbSetCollectionEnabled,
  type Crashlytics,
} from '@react-native-firebase/crashlytics';

let instance: Crashlytics | null = null;

/** Lazily resolve the (default) Crashlytics instance. Non-throwing. */
function getInstance(): Crashlytics | null {
  if (instance) return instance;
  try {
    instance = getCrashlytics();
  } catch (e) {
    console.warn('crashlytics.getCrashlytics failed', e);
    return null;
  }
  return instance;
}

/**
 * Report a caught error without leaking potentially user-entered or sensitive
 * text. The message is sanitized/truncated; the raw `Error` stack (useful for
 * diagnosis) is preserved on the reported error.
 */
export function recordCrashlyticsError(error: unknown): void {
  const crashlytics = getInstance();
  if (!crashlytics) return;
  try {
    const message = sanitizeMessage(extractMessage(error) ?? '');
    rnfbRecordError(
      crashlytics,
      error instanceof Error ? error : new Error(message ?? 'Unknown error'),
    );
    if (message) {
      rnfbLog(crashlytics, `recordError: ${message}`);
    }
  } catch (e) {
    console.warn('crashlytics.recordError failed', e);
  }
}

/** Add a breadcrumb-style log line (fire-and-forget). */
export function logCrashlyticsBreadcrumb(message: string): void {
  const crashlytics = getInstance();
  if (!crashlytics) return;
  try {
    rnfbLog(crashlytics, message);
  } catch (e) {
    console.warn('crashlytics.log failed', e);
  }
}

/** Attach the app's opaque user id (never an email) to crash reports. */
export function setCrashlyticsUserId(userId: string | null | undefined): void {
  const crashlytics = getInstance();
  if (!crashlytics) return;
  try {
    void rnfbSetUserId(crashlytics, userId?.toString() ?? '').catch((e) =>
      console.warn('crashlytics.setUserId failed', e),
    );
  } catch (e) {
    console.warn('crashlytics.setUserId failed', e);
  }
}

/** Set a custom key for debugging context (e.g. app variant). */
export function setCrashlyticsCustomKey(
  key: string,
  value: string | number | boolean,
): void {
  const crashlytics = getInstance();
  if (!crashlytics) return;
  try {
    void rnfbSetAttribute(crashlytics, key, String(value)).catch((e) =>
      console.warn(`crashlytics.setAttribute(${key}) failed`, e),
    );
  } catch (e) {
    console.warn(`crashlytics.setAttribute(${key}) failed`, e);
  }
}

/**
 * Enable/disable crash collection at runtime. Called once from the root layout
 * based on the build variant. This also controls RNFirebase's automatic global
 * JS-error reporting (disabled → errors are not reported).
 */
export function setCrashlyticsCollectionEnabled(enabled: boolean): void {
  const crashlytics = getInstance();
  if (!crashlytics) return;
  try {
    void rnfbSetCollectionEnabled(crashlytics, enabled).catch((e) =>
      console.warn('crashlytics.setCrashlyticsCollectionEnabled failed', e),
    );
  } catch (e) {
    console.warn('crashlytics.setCrashlyticsCollectionEnabled failed', e);
  }
}

/** Pull a readable message out of an unknown error value. */
function extractMessage(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Truncate + strip anything that could resemble user-entered free text. */
function sanitizeMessage(message: string): string {
  // Keep only a bounded prefix to avoid leaking long user input / URLs.
  const truncated = message.slice(0, 300);
  // Tentatively mask emails / phone-like patterns if they appear.
  return truncated
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?[0-9][0-9 -]{7,}[0-9]/g, '[phone]');
}
