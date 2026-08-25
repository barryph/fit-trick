import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getCachedGuideCompleted,
  isGuideCompleted,
  markGuideCompleted,
  resetGuideCache,
} from '@/lib/storage/guide-state';
import { storageKeys } from '@/lib/storage/keys';

describe('guide storage', () => {
  beforeEach(async () => {
    resetGuideCache();
    await AsyncStorage.clear();
  });

  it('treats an unseen guide as incomplete', async () => {
    await expect(isGuideCompleted('home')).resolves.toBe(false);
  });

  it('persists and reloads a completed guide', async () => {
    await markGuideCompleted('home');

    resetGuideCache();

    await expect(isGuideCompleted('home')).resolves.toBe(true);
    const raw = await AsyncStorage.getItem(storageKeys.guideCompleted('home'));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).completedAt).toEqual(expect.any(Number));
  });

  it('scopes guide state per page id', async () => {
    await markGuideCompleted('home');

    resetGuideCache();

    await expect(isGuideCompleted('home')).resolves.toBe(true);
    await expect(isGuideCompleted('timeline')).resolves.toBe(false);
  });

  it('caches completion in memory after a write', async () => {
    await markGuideCompleted('home');

    expect(getCachedGuideCompleted('home')).toBe(true);
    expect(await isGuideCompleted('home')).toBe(true);
  });
});
