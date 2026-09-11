import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import Background from '@/components/backgrounds/background';
import LoaderScreen from '@/components/base/loader-screen';
import ErrorScreen from '@/components/base/error-screen';
import ListItemShell from '@/components/list-item-shell';
import { ThemedText } from '@/components/base/themed-text';
import GoalProgressBar from '@/components/goals/goal-progress-bar';
import GoalAreaChart from '@/components/goals/goal-area-chart';
import GoalAdherenceRing from '@/components/goals/goal-adherence-ring';
import GoalHeatmap from '@/components/goals/goal-heatmap';
import { useGoalStatsQuery } from '@/hooks/queries/use-goals';
import { useStaleRefetchOnFocus } from '@/hooks/queries/use-stale-refetch-on-focus';
import { queryKeys } from '@/lib/query/keys';
import { formatGoalProgress } from '@/lib/goals/goal-progress';
import { useToday } from '@/hooks/use-today';
import { goBackOrHome } from '@/lib/navigation/back';

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

export default function GoalInsightsScreen() {
  const { activityId } = useLocalSearchParams();
  const router = useRouter();
  const today = useToday();
  const {
    data: stats,
    isPending,
    isError,
    refetch: refetchStats,
  } = useGoalStatsQuery(isString(activityId) ? activityId : undefined, today);

  // Refresh silently when returning to this screen with stale stats, e.g.
  // after an activity was completed on another screen. Fresh data is kept.
  useStaleRefetchOnFocus(
    queryKeys.goals.detail(isString(activityId) ? activityId : '', today),
  );

  if (isPending) {
    return <LoaderScreen text="Loading goal insights..." />;
  }

  if (isError) {
    return (
      <ErrorScreen
        message="Unable to load goal insights."
        onRetry={() => void refetchStats()}
      />
    );
  }

  if (!stats) {
    return <LoaderScreen text="Goal not found." />;
  }

  const NUMBER_OF_WEEKS_REPORTED = stats.weeklyPerformance?.length || 0;

  return (
    <View style={styles.container}>
      <Background showRed={false} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <Pressable onPress={() => goBackOrHome(router)} hitSlop={8}>
            <Ionicons name="arrow-back" size={27} color="white" />
          </Pressable>
          <ThemedText weight="700" size="regular">
            Goal Insights
          </ThemedText>
        </View>

        <ThemedText weight="600" size="title" style={styles.activityName}>
          {stats.activityName}
        </ThemedText>

        <ListItemShell style={styles.section}>
          <ThemedText style={styles.sectionLabel} type="defaultSemiBold">
            This week
          </ThemedText>
          <ThemedText size="small" style={styles.progressText}>
            {formatGoalProgress(
              stats.currentWeekCount,
              stats.goal.targetPerWeek,
            )}
          </ThemedText>
          <GoalProgressBar
            count={stats.currentWeekCount}
            target={stats.goal.targetPerWeek}
            height={10}
            style={styles.progressBar}
          />
          {/* <hr */}
          {/*   style={{ */}
          {/*     width: '100%', */}
          {/*     borderColor: '#fafafa22', */}
          {/*     borderTopWidth: 0, */}
          {/*   }} */}
          {/* /> */}
          {/* <ThemedText style={[styles.sectionLabel]} type="defaultSemiBold"> */}
          {/*   Target Frequency:{' '} */}
          {/*   <ThemedText */}
          {/*     type="defaultSemiBold" */}
          {/*     style={[ */}
          {/*       styles.sectionLabel, */}
          {/*       { textTransform: 'none', opacity: 1 }, */}
          {/*     ]} */}
          {/*   > */}
          {/*     {stats.goal.targetPerWeek}x per week */}
          {/*   </ThemedText> */}
          {/* </ThemedText> */}
        </ListItemShell>

        <ListItemShell style={styles.section}>
          <ThemedText style={styles.sectionLabel} type="defaultSemiBold">
            Performance
          </ThemedText>
          <ThemedText size="small" style={styles.sectionHint}>
            Over the last{' '}
            {NUMBER_OF_WEEKS_REPORTED !== 1
              ? NUMBER_OF_WEEKS_REPORTED + ' weeks'
              : 'week'}
          </ThemedText>
          <GoalAreaChart
            data={stats.weeklyPerformance}
            targetPerWeek={stats.goal.targetPerWeek}
          />
        </ListItemShell>

        <ListItemShell style={[styles.section, styles.ringSection]}>
          <GoalAdherenceRing
            adherence={stats.adherence}
            periodLabel={`last ${NUMBER_OF_WEEKS_REPORTED !== 1 ? NUMBER_OF_WEEKS_REPORTED + ' weeks' : 'week'}`}
          />
        </ListItemShell>

        <ListItemShell style={styles.section}>
          <ThemedText style={styles.sectionLabel} type="defaultSemiBold">
            Cadence
          </ThemedText>
          <ThemedText size="small" style={styles.sectionHint}>
            Over the last{' '}
            {stats.heatmap.length !== 1
              ? `${stats.heatmap.length} weeks`
              : 'week'}
          </ThemedText>
          <GoalHeatmap
            data={stats.heatmap}
            targetPerWeek={stats.goal.targetPerWeek}
          />
        </ListItemShell>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    gap: 12,
  },
  topRow: {
    marginTop: 10,
    marginBottom: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityName: {
    marginBottom: 8,
  },
  targetText: {
    opacity: 0.65,
    marginBottom: 6,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 4,
  },
  ringSection: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 13,
    opacity: 0.6,
  },
  sectionHint: {
    opacity: 0.65,
    marginBottom: 8,
  },
  progressText: {
    opacity: 0.9,
  },
  progressBar: {
    marginTop: 8,
  },
});
