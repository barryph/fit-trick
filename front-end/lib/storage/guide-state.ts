import { getJSON, setJSON } from '@/lib/storage/client';
import { storageKeys } from '@/lib/storage/keys';

/**
 * Persisted "has this page's guide been shown?" per page id.
 *
 * Storage detail stays here; pages interact through `useGuide`. Each page
 * passes its own `pageId` so onboarding state is isolated between pages.
 */

/** In-memory cache so remounts within a session don't re-read AsyncStorage. */
const memoryCache = new Set<string>();

type GuidePayload = {
  completedAt: number | null;
};

export function getCachedGuideCompleted(pageId: string): boolean | undefined {
  return memoryCache.has(pageId) ? true : undefined;
}

export async function isGuideCompleted(pageId: string): Promise<boolean> {
  if (memoryCache.has(pageId)) return true;

  const stored = await getJSON<GuidePayload>(
    storageKeys.guideCompleted(pageId),
  );
  const completed = Boolean(stored?.completedAt);
  if (completed) {
    memoryCache.add(pageId);
  }
  return completed;
}

/** Marks the guide as seen so it no longer auto-shows on the next visit. */
export async function markGuideCompleted(pageId: string): Promise<void> {
  memoryCache.add(pageId);
  await setJSON(storageKeys.guideCompleted(pageId), {
    completedAt: Date.now(),
  } satisfies GuidePayload);
}

/** Test helper — clears the in-memory cache between cases. */
export function resetGuideCache(): void {
  memoryCache.clear();
}
