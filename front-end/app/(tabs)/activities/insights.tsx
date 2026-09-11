import { useMemo, useState } from 'react';

import { toggleSingleSelectFilter } from '@/components/filter-list/filter-by-category';
import WeeklyInsightsScreen from '@/components/insights/weekly-insights-screen';
import { useActivitiesQuery } from '@/hooks/queries/use-activities';
import { useActivityEventsQuery } from '@/hooks/queries/use-activity-events';
import {
  aggregateActivityWeeklyUniqueDays,
  filterActivitySeries,
  getActivityColor,
  hasAnyWeeklyActivity,
} from '@/lib/insights/activity-weekly-unique-days';
import { getLastNWeekRange } from '@/utils/date';
import { useToday } from '@/hooks/use-today';

const WEEK_COUNT = 8;

export default function ActivityInsightsScreen() {
  // Anchored to the user's local date and recomputed when it rolls over: a
  // window frozen at mount would keep requesting, and charting, last week's
  // range and would drop every completion logged since.
  const today = useToday();
  const weekRange = useMemo(
    () => getLastNWeekRange(WEEK_COUNT, today),
    [today],
  );
  const {
    data: activities = [],
    isPending: isActivitiesPending,
    isError: isActivitiesError,
    refetch: refetchActivities,
  } = useActivitiesQuery();
  const {
    data: events = [],
    isPending: isEventsPending,
    isError: isEventsError,
    refetch: refetchEvents,
  } = useActivityEventsQuery(weekRange.from, weekRange.to);

  const [activeActivityId, setActiveActivityId] = useState<number | null>(null);

  const filterItems = useMemo(
    () =>
      activities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        color: getActivityColor(activity),
      })),
    [activities],
  );

  const allSeries = useMemo(
    () =>
      aggregateActivityWeeklyUniqueDays(
        events,
        activities,
        weekRange.weekStarts,
      ),
    [activities, events, weekRange.weekStarts],
  );

  const visibleSeries = useMemo(
    () => filterActivitySeries(allSeries, activeActivityId),
    [allSeries, activeActivityId],
  );

  const hasActivity = hasAnyWeeklyActivity(allSeries);

  function handleActivityPress(activityId: number) {
    setActiveActivityId((current) =>
      toggleSingleSelectFilter(current, activityId),
    );
  }

  return (
    <WeeklyInsightsScreen
      title="Activity Insights"
      filterLabel="Activities"
      filterItems={filterItems}
      selectedIds={activeActivityId}
      onItemPress={handleActivityPress}
      visibleSeries={visibleSeries}
      weekStarts={weekRange.weekStarts}
      weekCount={WEEK_COUNT}
      isLoading={isActivitiesPending || isEventsPending}
      isError={isActivitiesError || isEventsError}
      errorMessage="Unable to load activity insights."
      onRetry={() => {
        void refetchActivities();
        void refetchEvents();
      }}
      hasActivity={hasActivity}
      noItemsMessage="Add activities to start tracking completion trends."
      noActivityMessage="No activity completions in this period yet. Complete activities to see trends here."
      emptyMessage="Select activities to compare, or add activities to begin tracking insights."
    />
  );
}
