import { useMemo, useState } from 'react';

import { toggleSingleSelectFilter } from '@/components/filter-list/filter-by-category';
import WeeklyInsightsScreen from '@/components/insights/weekly-insights-screen';
import { useActivityEventsQuery } from '@/hooks/queries/use-activity-events';
import { useCategoriesQuery } from '@/hooks/queries/use-categories';
import {
  aggregateCategoryWeeklyUniqueDays,
  filterCategorySeries,
  hasAnyWeeklyActivity,
} from '@/lib/insights/category-weekly-unique-days';
import { getLastNWeekRange } from '@/utils/date';
import { useToday } from '@/hooks/use-today';

const WEEK_COUNT = 8;

export default function CategoryInsightsScreen() {
  // Anchored to the user's local date and recomputed when it rolls over: a
  // window frozen at mount would keep requesting, and charting, last week's
  // range and would drop every completion logged since.
  const today = useToday();
  const weekRange = useMemo(
    () => getLastNWeekRange(WEEK_COUNT, today),
    [today],
  );
  const {
    data: categories = [],
    isPending: isCategoriesPending,
    isError: isCategoriesError,
    refetch: refetchCategories,
  } = useCategoriesQuery();
  const {
    data: events = [],
    isPending: isEventsPending,
    isError: isEventsError,
    refetch: refetchEvents,
  } = useActivityEventsQuery(weekRange.from, weekRange.to);

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  const filterItems = useMemo(
    () =>
      categories
        .filter((category) => category.id !== undefined)
        .map((category) => ({
          id: category.id!,
          name: category.name,
          color: category.color,
        })),
    [categories],
  );

  const allSeries = useMemo(
    () =>
      aggregateCategoryWeeklyUniqueDays(
        events,
        categories,
        weekRange.weekStarts,
      ),
    [categories, events, weekRange.weekStarts],
  );

  const visibleSeries = useMemo(
    () => filterCategorySeries(allSeries, activeCategoryId),
    [allSeries, activeCategoryId],
  );

  const hasActivity = hasAnyWeeklyActivity(allSeries);

  function handleCategoryPress(categoryId: number) {
    setActiveCategoryId((current) =>
      toggleSingleSelectFilter(current, categoryId),
    );
  }

  return (
    <WeeklyInsightsScreen
      title="Category Insights"
      filterLabel="Categories"
      filterItems={filterItems}
      selectedIds={activeCategoryId}
      onItemPress={handleCategoryPress}
      visibleSeries={visibleSeries}
      weekStarts={weekRange.weekStarts}
      weekCount={WEEK_COUNT}
      isLoading={isCategoriesPending || isEventsPending}
      isError={isCategoriesError || isEventsError}
      errorMessage="Unable to load category insights."
      onRetry={() => {
        void refetchCategories();
        void refetchEvents();
      }}
      hasActivity={hasActivity}
      noItemsMessage="Add categories to start tracking completion trends."
      noActivityMessage="No category completions in this period yet. Complete activities to see trends here."
      emptyMessage="Select categories to compare, or add categories to begin tracking insights."
    />
  );
}
