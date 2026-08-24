import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/context/auth-context';

/**
 * Root navigation stack + session gate.
 * Redirects unauthenticated users to auth screens and authenticated users away from them.
 */
export function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  const inAuthGroup =
    segments[0] === 'login' ||
    segments[0] === 'register' ||
    segments[0] === 'forgot-password' ||
    segments[0] === 'reset-password';

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/');
    } else {
      setIsReady(true);
    }
  }, [isAuthenticated, isLoading, segments, router, inAuthGroup]);

  // Keep the navigator mounted while the session-gate effect redirects: the
  // `replace` action must reach a navigator that still registers the target
  // route, or it is dropped as unhandled. Protected screens are safe to render
  // briefly against a logged-out user because they return null when `user` is
  // absent, so no user-dependent hook runs.
  if (!isReady) return null;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: 'modal', title: 'Modal' }}
      />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
    </Stack>
  );
}
