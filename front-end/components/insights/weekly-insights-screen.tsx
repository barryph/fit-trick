import { ScrollView, StyleSheet, View, Pressable } from 'react-native';

import Background from '@/components/backgrounds/background';
import Container from '@/components/base/container';
import LoaderScreen from '@/components/base/loader-screen';
import ErrorScreen from '@/components/base/error-screen';
import { ThemedText } from '@/components/base/themed-text';
import FilterList, {
  type FilterListItem,
} from '@/components/filter-list/filter-list';
import InsightsLineChartKit, {
  type InsightsLineSeries,
} from '@/components/insights/insights-line-chart-kit';
import ListItemShell from '@/components/list-item-shell';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

interface WeeklyInsightsScreenProps {
  title: string;
  filterLabel: string;
  filterItems: FilterListItem[];
  selectedIds: number | null;
  onItemPress: (id: number) => void;
  visibleSeries: InsightsLineSeries[];
  weekStarts: string[];
  weekCount: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  /** Retries the failed request. */
  onRetry?: () => void;
  hasActivity: boolean;
  noItemsMessage: string;
  noActivityMessage: string;
  emptyMessage: string;
}

export default function WeeklyInsightsScreen({
  title,
  filterLabel,
  filterItems,
  selectedIds,
  onItemPress,
  visibleSeries,
  weekStarts,
  weekCount,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  hasActivity,
  noItemsMessage,
  noActivityMessage,
  emptyMessage,
}: WeeklyInsightsScreenProps) {
  const router = useRouter();

  if (isLoading) {
    return <LoaderScreen text="Loading insights..." />;
  }

  if (isError) {
    return <ErrorScreen message={errorMessage} onRetry={onRetry} />;
  }

  const showNoItems = filterItems.length === 0;
  const showNoActivity = !showNoItems && !hasActivity;

  return (
    <View style={styles.container}>
      <Background showRed={false} />

      <ScrollView>
        <Container style={styles.scrollContent}>
          <View style={styles.titleRow}>
            <Pressable onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={27} color="white" />
            </Pressable>
            <ThemedText type="title" size="medium">
              {title}
            </ThemedText>
          </View>

          <ThemedText size="small" style={styles.subtitle}>
            Number of days you&apos;ve logged per week, over the last{' '}
            {weekCount} weeks.
          </ThemedText>

          <FilterList
            label={filterLabel}
            items={filterItems}
            selectedIds={selectedIds}
            onItemPress={onItemPress}
            style={styles.filterList}
          />

          {showNoItems ? (
            <ListItemShell style={styles.messageShell}>
              <ThemedText size="small" style={styles.messageText}>
                {noItemsMessage}
              </ThemedText>
            </ListItemShell>
          ) : (
            <View style={styles.chartShell}>
              {showNoActivity ? (
                <View style={styles.emptyChartMessage}>
                  <ThemedText size="small" style={styles.messageText}>
                    {noActivityMessage}
                  </ThemedText>
                </View>
              ) : (
                <InsightsLineChartKit
                  series={visibleSeries}
                  weekStarts={weekStarts}
                  emptyMessage={emptyMessage}
                />
              )}
            </View>
          )}
        </Container>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 2,
  },
  subtitle: {
    opacity: 0.65,
    lineHeight: 20,
  },
  filterList: {
    marginTop: 8,
  },
  chartShell: {
    paddingVertical: 0,
    marginTop: 4,
  },
  messageShell: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginTop: 4,
  },
  messageText: {
    opacity: 0.7,
    lineHeight: 20,
  },
  emptyChartMessage: {
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
});
