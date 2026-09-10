import type { Router } from 'expo-router';

/**
 * Goes back when there is somewhere to go back to, otherwise returns home.
 *
 * These screens are reachable by deep link (the Android manifest declares the
 * `kadence` scheme), and a deep link opens them with an empty history. A bare
 * `router.back()` then does nothing at all, leaving the screen's back control
 * dead - and on `goals/[activityId]` there is no other way out.
 */
export function goBackOrHome(router: Router): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}
