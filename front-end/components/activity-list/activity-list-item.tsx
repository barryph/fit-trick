import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import { ThemedText } from '@/components/base/themed-text';
import SwipeRow from '@/components/swipe-row';
import type { IActivityClient } from '@/api/api.activity';
import ListItemShell from '@/components/list-item-shell';
import GoalProgressBar from '@/components/goals/goal-progress-bar';
import ProgressBadge from '../progress-badge';

/** Success gradient for completed / queued activity progress bars */
const COMPLETED_BAR_COLORS = ['#087cff', '#08d8ff', '#52f2a8'] as const;
const DAYS_IN_WEEK = 7;

interface IProps {
  activity: IActivityClient;
  onEdit: (activity: IActivityClient) => void;
  onComplete: (id: number) => void;
  onClick: (activity: IActivityClient) => void;
}

export default function ActivityListItem({
  activity,
  onEdit,
  onComplete,
  onClick,
}: IProps) {
  const completedToday = !!activity.completedToday;
  const remainingPercent = Math.min(
    Math.max((activity.daysUntil || 0) / DAYS_IN_WEEK, 0),
    1,
  );
  const barFlex = completedToday ? 1 : 1 - remainingPercent;

  return (
    <ListItemShell
      style={{
        borderWidth: 0,
        opacity: completedToday ? 0.72 : 1,
      }}
    >
      <Pressable
        onPress={() => {
          if (!completedToday) onClick(activity);
        }}
      >
        <SwipeRow
          onSwipeLeft={() => onEdit(activity)}
          onSwipeRight={() => onComplete(activity.id)}
          disableSwipeRight={completedToday}
          swipeLeftChild={
            <ThemedText style={{ fontSize: 24, color: '#eee' }}>
              <FontAwesome6 name="gear" size={26} />
            </ThemedText>
          }
          swipeLeftColor="inherit"
          swipeRightChild={
            <ThemedText style={{ fontSize: 24, color: '#000' }}>
              <Ionicons name="checkmark-done" size={24} color="#fff" />
            </ThemedText>
          }
          swipeRightColor="#fff"
          queued={activity.queued}
        >
          <View
            style={[
              styles.activityInner,
              activity.queued && styles.activityInnerSelected,
            ]}
          >
            <View style={[styles.activityMain]}>
              <View style={styles.activityTitleRow}>
                <View style={styles.activityNameGroup}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[
                      styles.activityName,
                      activity.queued && styles.activityNameSelected,
                    ]}
                  >
                    {activity.name}
                  </ThemedText>
                  {activity.category && (
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          borderColor: activity.category.color,
                          backgroundColor: `${activity.category.color}45`,
                        },
                      ]}
                    >
                      <ThemedText style={[styles.categoryText]}>
                        {activity.category.name}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <View style={styles.activityDetails}>
                  {completedToday ? (
                    <ProgressBadge
                      color={COMPLETED_BAR_COLORS[2]}
                      icon={
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={COMPLETED_BAR_COLORS[2]}
                        />
                      }
                    >
                      DONE
                    </ProgressBadge>
                  ) : (
                    <ThemedText
                      style={[
                        styles.activityDetailsText,
                        activity.queued && styles.activityDetailsTextSelected,
                      ]}
                    >
                      REMAIN:
                      <ThemedText
                        style={[
                          styles.activityDetailsSpan,
                          activity.queued && styles.activityDetailsSpanSelected,
                        ]}
                      >
                        {activity.daysUntil}
                      </ThemedText>
                    </ThemedText>
                  )}
                  <ThemedText
                    style={[
                      styles.activityDetailsText,
                      activity.queued && styles.activityDetailsTextSelected,
                    ]}
                  >
                    INTRVL:
                    <ThemedText
                      style={[
                        styles.activityDetailsSpan,
                        activity.queued && styles.activityDetailsSpanSelected,
                      ]}
                    >
                      {activity.interval}
                    </ThemedText>
                  </ThemedText>
                </View>
              </View>

              <View style={styles.activityBarContainer}>
                {/* Notches overlay */}
                <View style={styles.activityBarNotches}>
                  {Array.from({ length: DAYS_IN_WEEK }, (_, day) => (
                    <View
                      key={`${activity.id}-notch-${day}`}
                      style={[
                        styles.activityBarNotch,
                        day < DAYS_IN_WEEK - 1 && styles.activityBarNotchBorder,
                      ]}
                    />
                  ))}
                </View>

                {/* Progress gradient */}
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    flexDirection: 'row',
                  }}
                >
                  {completedToday || activity.queued ? (
                    <LinearGradient
                      colors={[...COMPLETED_BAR_COLORS]}
                      locations={[0, 0.62, 1]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ flex: barFlex }}
                    />
                  ) : activity.daysUntil === 0 ? (
                    <LinearGradient
                      colors={['#087cff', '#08d8ff', '#ff3d54']}
                      locations={[0, 0.5, 1]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ flex: barFlex }}
                    />
                  ) : (
                    <LinearGradient
                      colors={['#087cff', '#0096ff', '#08d8ff']}
                      locations={[0, 0.42, 1]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={{ flex: barFlex }}
                    />
                  )}
                </View>
              </View>

              {activity.goal && activity.goalProgress && (
                <GoalProgressBar
                  count={activity.goalProgress.currentWeekCount}
                  target={activity.goal.targetPerWeek}
                  height={6}
                  trackColor="#4b4b5c"
                  style={styles.goalProgress}
                />
              )}
            </View>
          </View>
        </SwipeRow>
      </Pressable>
    </ListItemShell>
  );
}

const styles = StyleSheet.create({
  activityInner: {
    // backgroundColor: '#fff',
  },
  activityInnerSelected: {
    // backgroundColor: '#0072ff', // Simplification of gradient
  },
  activityMain: {
    width: '100%',
    paddingTop: 11,
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  activityTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    // marginBottom: 4,
  },
  activityNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityName: {
    fontFamily: "'system-ui'",
    fontWeight: '600',
    lineHeight: 28,
    color: '#fff',
  },
  activityNameSelected: {
    color: '#fff',
  },
  categoryBadge: {
    marginLeft: 12,
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 20,
    fontWeight: '600',
  },
  activityDetails: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  activityDetailsText: {
    fontSize: 12,
    // fontSize: '.78rem',
    // color: '#8f98aa',
    color: '#7e91b6',
    // letterSpacing: '-.045em',
    letterSpacing: -0.45,
    fontWeight: 500,
  },
  activityDetailsSpan: {
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    marginLeft: 3,
  },
  activityDetailsTextSelected: {
    color: '#eee',
  },
  activityDetailsSpanSelected: {
    color: '#fff',
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  doneText: {
    fontSize: 12,
    fontWeight: 700,
    color: COMPLETED_BAR_COLORS[2],
    letterSpacing: -0.45,
  },
  activityBarContainer: {
    // Horizontal margin is for angled dividers. Which doesn't work on android
    // marginHorizontal: 3,
    height: 12,
    // backgroundColor: '#d6daea',
    backgroundColor: '#4b4b5c',
    position: 'relative',
    overflow: 'hidden',
    transform: [{ skewX: '-24deg' }],
    marginTop: 3,
    borderRadius: 4,
  },
  activityBarNotches: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 2,
  },
  activityBarNotch: {
    flex: 1,
    height: '100%',
  },
  activityBarNotchBorder: {
    borderRightWidth: 2,
    borderRightColor: '#00000088',
  },
  goalProgress: {
    marginTop: 6,
  },
  goalText: {
    textAlign: 'right',
    marginTop: 0,
  },
});
