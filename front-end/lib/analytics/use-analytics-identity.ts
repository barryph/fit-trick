import { useEffect } from 'react';

import { useAuth } from '@/context/auth-context';
import { setAnalyticsUserId } from './analytics';
import { setCrashlyticsUserId } from '@/lib/crashlytics/crashlytics';

/**
 * Keeps Analytics and Crashlytics in sync with the authenticated user.
 *
 * Runs inside a component nested under the `AuthProvider`, so it sees the
 * current user as soon as auth state changes. Only the app's opaque user id
 * is sent — never an email or other personally identifiable information.
 * Logout clears the ids.
 */
export function useAnalyticsIdentity(): void {
  const { user } = useAuth();

  useEffect(() => {
    setAnalyticsUserId(user?.id ?? null);
    setCrashlyticsUserId(user?.id ?? null);
  }, [user?.id]);
}
