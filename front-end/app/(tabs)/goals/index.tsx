import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import Background from '@/components/backgrounds/background';
import Container from '@/components/base/container';
import LoaderScreen from '@/components/base/loader-screen';
import ListItemShell from '@/components/list-item-shell';
import { ThemedText } from '@/components/base/themed-text';
import GoalProgressBar from '@/components/goals/goal-progress-bar';
import { useGoalsQuery } from '@/hooks/queries/use-goals';
import { formatGoalProgress, isGoalMet } from '@/lib/goals/goal-progress';
import { YYYYMMDD } from '@/utils/date';
import ProgressBadge from '@/components/progress-badge';

export default function GoalsScreen() {
  const router = useRouter();
  const today = YYYYMMDD();
  const { data: goals = [], isPending, isError } = useGoalsQuery(today);

  if (isPending) {
    return <LoaderScreen text="Loading goals..." />;
  }

  if (isError) {
    return <LoaderScreen text="Unable to load goals." />;
  }

  return (
    <View style={styles.container}>
      <Background />

      <ScrollView>
        <Container style={styles.scrollContent}>
          <View>
            <ThemedText style={styles.title} type="defaultBold" size="medium">
              Monitor Your Frequency
            </ThemedText>
          </View>

          {goals.length === 0 ? (
            <ListItemShell style={styles.emptyShell}>
              <ThemedText size="small" style={styles.emptyText}>
                No goals yet. Set a weekly target when creating or editing an
                activity to start tracking your cadence.
              </ThemedText>
            </ListItemShell>
          ) : (
            <View style={styles.list}>
              {goals.map((goal) => {
                const met = isGoalMet(
                  goal.currentWeekCount,
                  goal.targetPerWeek,
                );
                return (
                  <ListItemShell key={goal.activityId}>
                    <Pressable
                      onPress={() => router.push(`/goals/${goal.activityId}`)}
                      style={styles.item}
                    >
                      <View style={styles.itemRow}>
                        <ThemedText
                          type="defaultBold"
                          style={styles.itemName}
                          numberOfLines={1}
                        >
                          {goal.activityName}
                        </ThemedText>

                        <View style={styles.itemRight}>
                          {goal.currentWeekCount >= goal.targetPerWeek ? (
                            <ProgressBadge
                              color="#52f2a8"
                              icon={
                                <Ionicons
                                  name="checkmark-circle"
                                  size={14}
                                  color="#52f2a8"
                                />
                              }
                            >
                              DONE
                            </ProgressBadge>
                          ) : (
                            <ProgressBadge
                              color="rgb(236, 232, 30)"
                              icon={
                                <MaterialCommunityIcons
                                  name="progress-clock"
                                  size={14}
                                  color="rgb(236, 232, 30)"
                                />
                              }
                            >
                              IN PROGRESS
                            </ProgressBadge>
                          )}
                        </View>
                      </View>
                      <GoalProgressBar
                        count={goal.currentWeekCount}
                        target={goal.targetPerWeek}
                        height={10}
                        style={styles.progressBar}
                      />
                      <View style={styles.bottomRow}>
                        <ThemedText size="extraSmall">
                          See Stats &rarr;
                        </ThemedText>
                        <ThemedText
                          size="small"
                          style={
                            met
                              ? styles.metText
                              : { color: 'rgb(236, 232, 30)' }
                          }
                        >
                          {formatGoalProgress(
                            goal.currentWeekCount,
                            goal.targetPerWeek,
                          )}
                        </ThemedText>
                      </View>
                    </Pressable>
                  </ListItemShell>
                );
              })}
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
    gap: 24,
    paddingBottom: 40,
  },
  title: {
    marginTop: 10,
    fontFamily: '"system-ui"',
    fontWeight: 700,
  },
  subTitle: {
    marginTop: 8,
  },
  list: {
    gap: 8,
  },
  item: {
    paddingTop: 13,
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  itemName: {
    fontSize: 18,
    lineHeight: 28,
    flexShrink: 1,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metText: {
    color: '#52f2a8',
  },
  progressBar: {
    marginTop: 8,
  },
  emptyShell: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyText: {
    opacity: 0.7,
    lineHeight: 20,
  },
  bottomRow: {
    marginTop: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
