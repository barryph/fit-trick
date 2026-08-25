import { useEffect } from 'react';
import { useSegments } from 'expo-router';

import { logScreenView } from './analytics';

/**
 * Logs a `screen_view` analytics event whenever the active route changes.
 *
 * Fire-and-forget feature-adoption signal; never affects navigation. Derives
 * a stable route name from the current expo-router segments (e.g.
 * `(tabs)/activities/insights` -> `(tabs)/activities/insights`) so it stays
 * unambiguous in reports. Uses only `useSegments` (already relied on by
 * `RootLayoutNav`) so it works in test environments that mock expo-router.
 */
export function useScreenTracking(): void {
  const segments = useSegments();

  useEffect(() => {
    logScreenView(segments.join('/') || '/');
  }, [segments]);
}
