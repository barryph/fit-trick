import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { YYYYMMDD } from '@/utils/date';

/**
 * The device's current local calendar date (`YYYY-MM-DD`), kept up to date.
 *
 * Reading `new Date()` during render is only correct until the next midnight:
 * every habit screen derives "completed today", the countdown, the current week
 * and the visible timeline month from that value, and a phone left on the
 * dashboard overnight would otherwise keep answering with yesterday.
 *
 * The value is shared by the whole app rather than owned by each hook instance:
 * several screens are mounted at once, and they must all cross the day boundary
 * in the same update rather than each waiting on its own timer. The single
 * subscription re-renders every subscriber at the device's local midnight, and
 * again whenever the app returns to the foreground - which also covers a device
 * whose timezone changed while the app was backgrounded (e.g. a flight).
 */

let currentToday = YYYYMMDD();
const subscribers = new Set<(today: string) => void>();
let timeoutId: ReturnType<typeof setTimeout> | undefined;
let appStateSubscription: { remove: () => void } | undefined;

function scheduleNextLocalMidnight(): void {
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }

  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  // A second of slack so a timer that fires marginally early still lands on the
  // new day. Timers are not exact across suspend/resume, and the AppState
  // listener is the backstop for anything longer.
  const msUntilMidnight = nextMidnight.getTime() - now.getTime() + 1000;

  timeoutId = setTimeout(refresh, Math.max(msUntilMidnight, 1000));

  // React Native's timer has no `unref`, but Node's does. Unref'ing keeps a
  // timer that can be up to 24 hours away from holding the event loop open
  // under Jest, where the effect's cleanup may not run in every teardown.
  (timeoutId as unknown as { unref?: () => void }).unref?.();
}

/** Recomputes the date and notifies subscribers only when it really changed. */
function refresh(): void {
  const next = YYYYMMDD();
  if (next !== currentToday) {
    currentToday = next;
    for (const notify of subscribers) {
      notify(next);
    }
  }
  scheduleNextLocalMidnight();
}

function handleAppStateChange(state: AppStateStatus): void {
  // Only the transition into the foreground can have skipped a midnight while
  // the JS timers were suspended.
  if (state === 'active') {
    refresh();
  }
}

function subscribe(notify: (today: string) => void): () => void {
  if (subscribers.size === 0) {
    // Catch up on anything missed before this component mounted, then start
    // watching the clock for the whole app.
    currentToday = YYYYMMDD();
    scheduleNextLocalMidnight();
    appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
  }

  subscribers.add(notify);

  return () => {
    subscribers.delete(notify);

    if (subscribers.size === 0) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      appStateSubscription?.remove();
      appStateSubscription = undefined;
    }
  };
}

/** The user's current local calendar date, as `YYYY-MM-DD`. */
export function useToday(): string {
  const [today, setToday] = useState(currentToday);

  useEffect(() => {
    // `subscribe` refreshes the shared value (it may have moved on since this
    // component's first render), so sync *after* subscribing - otherwise a
    // component mounting across a day boundary would keep the old date.
    const unsubscribe = subscribe(setToday);
    setToday(currentToday);
    return unsubscribe;
  }, []);

  return today;
}

/** Test helper — drops the shared subscription so cases stay isolated. */
export function resetTodayState(): void {
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
    timeoutId = undefined;
  }
  appStateSubscription?.remove();
  appStateSubscription = undefined;
  subscribers.clear();
  currentToday = YYYYMMDD();
}
