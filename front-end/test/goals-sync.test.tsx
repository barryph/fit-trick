/**
 * Regression tests: the Goals page must reflect activity completions.
 *
 * Covers three synchronization mechanisms in the existing architecture:
 *  1. Completion mutations invalidate the goals list + stats queries.
 *  2. Goals query keys are keyed by `today` so cached data can never be
 *     served for the wrong date.
 *  3. Returning to a Goals screen refetches only when the cached data is
 *     stale, so tab switches never trigger requests for fresh data.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';

import { TestQueryProvider } from '@/test/setup/test-query-client';
import { goalsAPI } from '@/api/api.goals';
import { activitiesAPI } from '@/api/api.activity';
import { queryKeys } from '@/lib/query/keys';
import { useGoalsQuery, useGoalStatsQuery } from '@/hooks/queries/use-goals';
import { useStaleRefetchOnFocus } from '@/hooks/queries/use-stale-refetch-on-focus';
import { useCompleteActivityMutation } from '@/hooks/mutations/use-activity-mutations';

jest.mock('@/api/api.goals', () => ({
  goalsAPI: {
    getAll: jest.fn(),
    getStats: jest.fn(),
  },
}));

jest.mock('@/api/api.activity', () => ({
  activitiesAPI: {
    complete: jest.fn(),
    undo: jest.fn(),
  },
}));

const mockGoalsGetAll = goalsAPI.getAll as jest.Mock;
const mockGoalsGetStats = goalsAPI.getStats as jest.Mock;
const mockComplete = activitiesAPI.complete as jest.Mock;
const mockUseFocusEffect = useFocusEffect as jest.Mock;

const TODAY = '2026-08-24';

function goalFixture(currentWeekCount: number) {
  return {
    goalId: 'g1',
    activityId: '1',
    activityName: 'Squats',
    targetPerWeek: 3,
    currentWeekCount,
    categoryColor: null,
  };
}

function statsFixture(currentWeekCount: number) {
  return {
    goal: { id: 'g1', activityId: '1', targetPerWeek: 3 },
    activityName: 'Squats',
    currentWeekCount,
    weeklyPerformance: [],
    adherence: { applicable: 1, met: 0, percentage: 0 },
    heatmap: [],
    firstCompletionDate: null,
  };
}

/** Harness that mounts the goals list query next to the completion mutation. */
function GoalsSyncHarness() {
  const { data: goals = [] } = useGoalsQuery(TODAY);
  const complete = useCompleteActivityMutation();
  return (
    <>
      <Text testID="count">{goals[0]?.currentWeekCount ?? 'none'}</Text>
      <Text
        testID="complete"
        onPress={() => complete.mutate({ activityId: 1, date: TODAY })}
      >
        complete
      </Text>
    </>
  );
}

/** Harness that mounts a goal's stats query next to the completion mutation. */
function GoalStatsSyncHarness() {
  const { data: stats } = useGoalStatsQuery(1, TODAY);
  const complete = useCompleteActivityMutation();
  return (
    <>
      <Text testID="count">{stats?.currentWeekCount ?? 'none'}</Text>
      <Text
        testID="complete"
        onPress={() => complete.mutate({ activityId: 1, date: TODAY })}
      >
        complete
      </Text>
    </>
  );
}

/** Harness exercising the focus-refetch hook against the goals list query. */
function FocusRefetchHarness() {
  useStaleRefetchOnFocus(queryKeys.goals.all(TODAY));
  const { data: goals = [] } = useGoalsQuery(TODAY);
  return <Text testID="count">{goals[0]?.currentWeekCount ?? 'none'}</Text>;
}

describe('goals query keys', () => {
  it('are keyed by today so cached data is never served for the wrong date', () => {
    expect(queryKeys.goals.all('2026-08-24')).toEqual([
      'goals',
      'all',
      '2026-08-24',
    ]);
    expect(queryKeys.goals.all('2026-08-25')).not.toEqual(
      queryKeys.goals.all('2026-08-24'),
    );
    expect(queryKeys.goals.detail(5, '2026-08-24')).toEqual([
      'goals',
      '5',
      '2026-08-24',
    ]);
  });

  it('keeps the base prefix so invalidations still match every goals query', () => {
    expect(queryKeys.goals.base).toEqual(['goals']);
  });
});

describe('activity completion -> goals synchronization', () => {
  beforeEach(() => {
    mockGoalsGetAll.mockReset();
    mockGoalsGetStats.mockReset();
    mockComplete.mockReset();
  });

  it('refetches the goals list and shows the updated week count', async () => {
    mockGoalsGetAll
      .mockResolvedValueOnce({
        data: { goals: [goalFixture(2)] },
      })
      .mockResolvedValueOnce({
        data: { goals: [goalFixture(3)] },
      });
    mockComplete.mockResolvedValue({
      data: { activity: { id: 1, name: 'Squats' } },
    });

    await render(
      <TestQueryProvider>
        <GoalsSyncHarness />
      </TestQueryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('2'),
    );

    screen.getByTestId('complete').props.onPress();

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('3'),
    );
    expect(mockGoalsGetAll).toHaveBeenCalledTimes(2);
    // The refetch is keyed to the same date the list was fetched with.
    expect(mockGoalsGetAll).toHaveBeenLastCalledWith(TODAY);
  });

  it("refetches a goal's stats after the activity is completed", async () => {
    mockGoalsGetStats
      .mockResolvedValueOnce({ data: statsFixture(2) })
      .mockResolvedValueOnce({ data: statsFixture(3) });
    mockComplete.mockResolvedValue({
      data: { activity: { id: 1, name: 'Squats' } },
    });

    await render(
      <TestQueryProvider>
        <GoalStatsSyncHarness />
      </TestQueryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('2'),
    );

    screen.getByTestId('complete').props.onPress();

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('3'),
    );
    expect(mockGoalsGetStats).toHaveBeenCalledTimes(2);
    expect(mockGoalsGetStats).toHaveBeenLastCalledWith(1, TODAY);
  });
});

describe('stale-only refetch on screen focus', () => {
  beforeEach(() => {
    mockGoalsGetAll.mockReset();
    mockUseFocusEffect.mockReset();
  });

  it('refetches when the cached goals data is stale', async () => {
    // Default test client uses staleTime 0, so fetched data is immediately
    // stale — the exact case a mounted Goals tab can hit on focus.
    mockGoalsGetAll
      .mockResolvedValueOnce({ data: { goals: [goalFixture(2)] } })
      .mockResolvedValueOnce({ data: { goals: [goalFixture(4)] } });

    let focusCallback: () => void = () => {};
    mockUseFocusEffect.mockImplementation((cb: () => void) => {
      focusCallback = cb;
    });

    await render(
      <TestQueryProvider>
        <FocusRefetchHarness />
      </TestQueryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('2'),
    );
    expect(mockGoalsGetAll).toHaveBeenCalledTimes(1);

    // Simulate the tab regaining focus.
    await act(async () => {
      focusCallback();
    });

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('4'),
    );
    expect(mockGoalsGetAll).toHaveBeenCalledTimes(2);

    // Drain the refetch's remaining async state updates so they cannot leak
    // into the next test's act scope.
    await act(async () => {});
  });

  it('does not refetch when the cached goals data is still fresh', async () => {
    mockGoalsGetAll.mockResolvedValue({
      data: { goals: [goalFixture(2)] },
    });

    const freshClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60_000, retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });

    let focusCallback: () => void = () => {};
    mockUseFocusEffect.mockImplementation((cb: () => void) => {
      focusCallback = cb;
    });

    await render(
      <TestQueryProvider client={freshClient}>
        <FocusRefetchHarness />
      </TestQueryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('2'),
    );
    expect(mockGoalsGetAll).toHaveBeenCalledTimes(1);

    // Simulate the tab regaining focus while the data is fresh.
    await act(async () => {
      focusCallback();
    });

    // Allow any (incorrect) refetch a moment to fire, then assert none did.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockGoalsGetAll).toHaveBeenCalledTimes(1);
  });
});
