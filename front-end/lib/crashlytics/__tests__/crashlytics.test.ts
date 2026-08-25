import {
  logCrashlyticsBreadcrumb,
  recordCrashlyticsError,
  setCrashlyticsCollectionEnabled,
  setCrashlyticsCustomKey,
  setCrashlyticsUserId,
} from '@/lib/crashlytics/crashlytics';
import {
  log,
  recordError,
  setAttribute,
  setCrashlyticsCollectionEnabled as rnfbSetCollectionEnabled,
  setUserId,
} from '@react-native-firebase/crashlytics';

describe('crashlytics wrapper', () => {
  const instance = expect.anything();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a caught error without throwing', () => {
    expect(() => recordCrashlyticsError(new Error('boom'))).not.toThrow();
    expect(recordError).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({ message: 'boom' }),
    );
  });

  it('sanitizes non-Error values into a reportable error', () => {
    recordCrashlyticsError({ unexpected: 'object' });
    expect(recordError).toHaveBeenCalledWith(instance, expect.any(Error));
  });

  it('adds a breadcrumb log line', () => {
    logCrashlyticsBreadcrumb('opened timeline');
    expect(log).toHaveBeenCalledWith(instance, 'opened timeline');
  });

  it('sets the crashlytics user id with the opaque id', () => {
    setCrashlyticsUserId('user-123');
    expect(setUserId).toHaveBeenCalledWith(instance, 'user-123');

    setCrashlyticsUserId(null);
    expect(setUserId).toHaveBeenCalledWith(instance, '');
  });

  it('sets a custom key', () => {
    setCrashlyticsCustomKey('app_variant', 'production');
    expect(setAttribute).toHaveBeenCalledWith(
      instance,
      'app_variant',
      'production',
    );
  });

  it('toggles crash collection', () => {
    setCrashlyticsCollectionEnabled(false);
    expect(rnfbSetCollectionEnabled).toHaveBeenCalledWith(instance, false);
  });
});
