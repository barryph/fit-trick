import { getJSON, setJSON } from '@/lib/storage/client';
import { storageKeys } from '@/lib/storage/keys';

/**
 * Tracks whether a user has ever completed an activity, so we can fire the
 * `first_activity_completed` analytics event exactly once per user without
 * querying the full history. Not user-identifying.
 */

export async function hasUserCompletedEver(userId: string): Promise<boolean> {
  const stored = await getJSON<{ completed: boolean }>(
    storageKeys.userCompletedActivity(userId),
  );
  return stored?.completed ?? false;
}

export async function markUserCompletedEver(userId: string): Promise<void> {
  await setJSON(storageKeys.userCompletedActivity(userId), {
    completed: true,
  });
}
