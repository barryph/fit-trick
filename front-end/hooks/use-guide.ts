import { useEffect, useState } from 'react';

import {
  isGuideCompleted,
  markGuideCompleted,
} from '@/lib/storage/guide-state';

interface UseGuideOptions {
  /**
   * Stable id scoping this page's guide state so the auto-show only applies
   * to this page (e.g. `home`). Keep it stable — changing it re-shows.
   */
  pageId: string;
  /** Auto-open the guide on the first visit. Defaults to true. */
  autoShow?: boolean;
  /** Optional callback when the user runs the final step. */
  onComplete?: () => void;
}

/**
 * Controls for a page's onboarding guide.
 *
 * - Auto-shows the guide the first time the page is visited.
 * - Persists completion/dismissal so it stays hidden on later visits.
 * - Exposes `open` so the page's info (i) icon can reopen it any time.
 *
 * Wire it up like: `visible={guide.isOpen} onClose={guide.dismiss}
 * onComplete={guide.finish}`, and press the (i) icon with `guide.open`.
 */
export function useGuide({
  pageId,
  autoShow = true,
  onComplete,
}: UseGuideOptions) {
  const [isOpen, setIsOpen] = useState(false);
  // `hydrated` is true once we know whether the guide was seen, so we never
  // flash it open for a returning user.
  const [hydrated, setHydrated] = useState(!autoShow);

  useEffect(() => {
    if (!autoShow) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    void isGuideCompleted(pageId).then((completed) => {
      if (cancelled) return;
      setHydrated(true);
      if (!completed) {
        setIsOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pageId, autoShow]);

  /** Persists that the user has seen the guide (so it stops auto-showing). */
  function recordSeen() {
    void markGuideCompleted(pageId);
  }

  function open() {
    setIsOpen(true);
  }

  /** Dismissal (backdrop / close ×) — also records the guide as seen. */
  function dismiss() {
    recordSeen();
    setIsOpen(false);
  }

  /** Finishing the final step — records as seen and fires the callback. */
  function finish() {
    recordSeen();
    setIsOpen(false);
    onComplete?.();
  }

  return { isOpen, hydrated, open, dismiss, finish };
}
