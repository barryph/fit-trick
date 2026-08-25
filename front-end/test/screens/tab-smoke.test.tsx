import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { TestSafeAreaProvider } from '@/test/setup/test-safe-area';
import { TestQueryProvider } from '@/test/setup/test-query-client';
import HomeScreen from '@/app/(tabs)/index';
import TimelineScreen from '@/app/(tabs)/timeline';
import CategoriesScreen from '@/app/(tabs)/categories/index';
import ProfileScreen from '@/app/(tabs)/profile';
import { useActivitiesQuery } from '@/hooks/queries/use-activities';
import { useCategoriesQuery } from '@/hooks/queries/use-categories';
import { useTimelineQuery } from '@/hooks/queries/use-timeline';
import { testActivities } from '@/test/setup/fixtures/activities';
import { testCategories } from '@/test/setup/fixtures/categories';
import { testTimeline } from '@/test/setup/fixtures/timeline';
import { timelineToSet } from '@/lib/query/timeline-utils';
import { setMockAuth } from '@/test/setup/mock-auth';
import { resetActivityQueueCache } from '@/lib/storage/activity-queue';

jest.mock('@/hooks/queries/use-activities');
jest.mock('@/hooks/queries/use-categories');
jest.mock('@/hooks/queries/use-timeline');
jest.mock('@/hooks/mutations/use-activity-mutations', () => ({
  useCompleteActivityMutation: () => ({ mutateAsync: jest.fn() }),
  useUndoActivityMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/context/auth-context', () =>
  require('@/test/setup/mock-auth').createAuthContextMock(),
);

const mockUseActivitiesQuery = useActivitiesQuery as jest.Mock;
const mockUseCategoriesQuery = useCategoriesQuery as jest.Mock;
const mockUseTimelineQuery = useTimelineQuery as jest.Mock;

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <TestQueryProvider>
      <TestSafeAreaProvider>{ui}</TestSafeAreaProvider>
    </TestQueryProvider>,
  );
}

beforeEach(() => {
  resetActivityQueueCache();
  setMockAuth({ isAuthenticated: true });
  mockUseActivitiesQuery.mockReturnValue({
    data: testActivities,
    isPending: false,
    isError: false,
  });
  mockUseCategoriesQuery.mockReturnValue({
    data: testCategories,
    isPending: false,
    isError: false,
  });
  mockUseTimelineQuery.mockReturnValue({
    data: timelineToSet(testTimeline),
    isPending: false,
    isFetching: false,
    isError: false,
  });
});

describe('Tab screen smoke tests', () => {
  it('Home tab mounts', async () => {
    await renderWithProviders(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText('Activities Center')).toBeTruthy();
    });
  });

  it('Timeline tab mounts', async () => {
    await renderWithProviders(<TimelineScreen />);
    await waitFor(() => {
      expect(screen.getByText('RUN')).toBeTruthy();
    });
  });

  it('Categories tab mounts', async () => {
    await renderWithProviders(<CategoriesScreen />);
    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeTruthy();
    });
  });

  it('Profile tab mounts', async () => {
    await renderWithProviders(<ProfileScreen />);
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeTruthy();
    });
  });
});
