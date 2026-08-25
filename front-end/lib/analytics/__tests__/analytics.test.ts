import {
  logActivityCompleted,
  logCreateActivity,
  logDeleteActivity,
  logEditActivity,
  logEvent,
  logFirstActivityCompleted,
  logLogin,
  logLoginFailed,
  logOnboardingComplete,
  logOnboardingSkip,
  logOnboardingStart,
  logOnboardingStepComplete,
  logOnboardingStepView,
  logScreenView,
  logSignUp,
  logSignUpFailed,
  setAnalyticsUserId,
} from '@/lib/analytics/analytics';
import {
  logEvent as rnfbLogEvent,
  logLogin as rnfbLogLogin,
  logScreenView as rnfbLogScreenView,
  logSignUp as rnfbLogSignUp,
  setUserId as rnfbSetUserId,
} from '@react-native-firebase/analytics';

describe('analytics wrapper', () => {
  const instance = expect.anything();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs a custom event without throwing', () => {
    expect(() => logEvent('my_event', { a: 1 })).not.toThrow();
    expect(rnfbLogEvent).toHaveBeenCalledWith(instance, 'my_event', { a: 1 });
  });

  it('logs onboarding funnel events with consistent params', () => {
    logOnboardingStart('home');
    expect(rnfbLogEvent).toHaveBeenCalledWith(instance, 'onboarding_start', {
      page_id: 'home',
    });

    logOnboardingStepView(0, 'Welcome to Kadence', 4);
    expect(rnfbLogEvent).toHaveBeenCalledWith(
      instance,
      'onboarding_step_view',
      {
        step_index: 0,
        step_name: 'Welcome to Kadence',
        step_count: 4,
      },
    );

    logOnboardingStepComplete(0, 4);
    expect(rnfbLogEvent).toHaveBeenCalledWith(
      instance,
      'onboarding_step_complete',
      { step_index: 0, step_count: 4 },
    );

    logOnboardingComplete(4);
    expect(rnfbLogEvent).toHaveBeenCalledWith(instance, 'onboarding_complete', {
      step_count: 4,
    });

    logOnboardingSkip(2, 4);
    expect(rnfbLogEvent).toHaveBeenCalledWith(instance, 'onboarding_skip', {
      step_index: 2,
      step_count: 4,
    });
  });

  it('uses the recommended sign_up / login events with the auth method', () => {
    logSignUp('password');
    expect(rnfbLogSignUp).toHaveBeenCalledWith(instance, {
      method: 'password',
    });

    logLogin('google');
    expect(rnfbLogLogin).toHaveBeenCalledWith(instance, { method: 'google' });

    logSignUpFailed('apple', 'EMAIL_EXISTS');
    expect(rnfbLogEvent).toHaveBeenCalledWith(instance, 'sign_up_failed', {
      method: 'apple',
      error_code: 'EMAIL_EXISTS',
    });

    logLoginFailed('password', 'INVALID_CREDENTIALS');
    expect(rnfbLogEvent).toHaveBeenCalledWith(instance, 'login_failed', {
      method: 'password',
      error_code: 'INVALID_CREDENTIALS',
    });
  });

  it('logs core action events', () => {
    logCreateActivity(true);
    expect(rnfbLogEvent).toHaveBeenCalledWith(instance, 'create_activity', {
      has_goal: true,
    });

    logEditActivity();
    expect(rnfbLogEvent).toHaveBeenCalledWith(
      instance,
      'edit_activity',
      undefined,
    );

    logDeleteActivity();
    expect(rnfbLogEvent).toHaveBeenCalledWith(
      instance,
      'delete_activity',
      undefined,
    );

    logActivityCompleted();
    expect(rnfbLogEvent).toHaveBeenCalledWith(
      instance,
      'activity_completed',
      undefined,
    );

    logFirstActivityCompleted();
    expect(rnfbLogEvent).toHaveBeenCalledWith(
      instance,
      'first_activity_completed',
      undefined,
    );
  });

  it('logs screen view with a stable screen name', () => {
    logScreenView('(tabs)/activities/insights');
    expect(rnfbLogScreenView).toHaveBeenCalledWith(instance, {
      screen_name: '(tabs)/activities/insights',
      screen_class: '(tabs)/activities/insights',
    });
  });

  it('sets the analytics user id (and clears it on logout)', () => {
    setAnalyticsUserId('user-123');
    expect(rnfbSetUserId).toHaveBeenCalledWith(instance, 'user-123');

    setAnalyticsUserId(null);
    expect(rnfbSetUserId).toHaveBeenCalledWith(instance, null);
  });
});
