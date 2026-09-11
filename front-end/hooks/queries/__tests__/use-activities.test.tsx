/**
 * The user's local date is part of the activities cache key, so the list is
 * refetched (not served from cache) when their day rolls over, and the cached
 * entry for yesterday is never mistaken for today's.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';

import { TestQueryProvider } from '@/test/setup/test-query-client';
import { activitiesAPI } from '@/api/api.activity';
import { queryKeys } from '@/lib/query/keys';
import { useActivitiesQuery } from '@/hooks/queries/use-activities';
import { useToday } from '@/hooks/use-today';

jest.mock('@/api/api.activity', () => ({
  activitiesAPI: {
    getAllByUser: jest.fn(),
    getById: jest.fn(),
  },
}));

jest.mock('@/hooks/use-today', () => ({
  useToday: jest.fn(),
}));

const mockGetAll = activitiesAPI.getAllByUser as jest.Mock;
const mockUseToday = useToday as jest.Mock;

const YESTERDAY = '2026-03-01';
const TODAY = '2026-03-02';
const TOMORROW = '2026-03-03';

function activityFixture(id: number, daysUntil: number) {
  return { id, name: `Activity ${id}`, interval: 3, daysUntil };
}

function ActivitiesHarness() {
  const { data: activities = [] } = useActivitiesQuery();
  return (
    <Text testID="days">
      {activities[0] ? String(activities[0].daysUntil) : 'none'}
    </Text>
  );
}

describe('activities date scoping', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockUseToday.mockReset();
  });

  it('requests the list with the device date', async () => {
    mockUseToday.mockReturnValue(TODAY);
    mockGetAll.mockResolvedValue({
      data: { activities: [activityFixture(1, 2)] },
    });

    await render(
      <TestQueryProvider>
        <ActivitiesHarness />
      </TestQueryProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('days')).toHaveTextContent('2'));
    expect(mockGetAll).toHaveBeenCalledWith(TODAY);
  });

  it('refetches against the new date when the day rolls over', async () => {
    mockUseToday.mockReturnValue(TODAY);
    mockGetAll.mockResolvedValueOnce({
      data: { activities: [activityFixture(1, 2)] },
    });

    const view = await render(
      <TestQueryProvider>
        <ActivitiesHarness />
      </TestQueryProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('days')).toHaveTextContent('2'));
    expect(mockGetAll).toHaveBeenCalledTimes(1);

    // Midnight passes: the same screen keeps rendering, but the countdown it
    // shows must come from a request made for the new day.
    mockGetAll.mockResolvedValueOnce({
      data: { activities: [activityFixture(1, 1)] },
    });
    mockUseToday.mockReturnValue(TOMORROW);
    await view.rerender(
      <TestQueryProvider>
        <ActivitiesHarness />
      </TestQueryProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('days')).toHaveTextContent('1'));
    expect(mockGetAll).toHaveBeenCalledTimes(2);
    expect(mockGetAll).toHaveBeenLastCalledWith(TOMORROW);
  });

  it('keys the list and the detail queries by date, without overlap', () => {
    expect(queryKeys.activities.all(TODAY)).toEqual([
      'activities',
      'list',
      TODAY,
    ]);
    expect(queryKeys.activities.detail(7, TODAY)).toEqual([
      'activities',
      'detail',
      '7',
      TODAY,
    ]);

    // Different days must not share a cache entry...
    expect(queryKeys.activities.all(YESTERDAY)).not.toEqual(
      queryKeys.activities.all(TODAY),
    );
    // ...and a list patch must be able to match every day's list without also
    // matching a detail entry (whose data is a single activity, not an array).
    expect(queryKeys.activities.all(YESTERDAY).slice(0, 2)).toEqual(
      queryKeys.activities.list,
    );
    expect(queryKeys.activities.detail(7, TODAY).slice(0, 2)).not.toEqual(
      queryKeys.activities.list,
    );
  });
});
