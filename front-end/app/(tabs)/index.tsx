import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

import { IActivityClient } from '@/api/api.activity';
import { ThemedText } from '@/components/base/themed-text';
import LoaderScreen from '@/components/base/loader-screen';
import ErrorScreen from '@/components/base/error-screen';
import Background from '@/components/backgrounds/background';
import ActivityListItem from '@/components/activity-list/activity-list-item';
import FloatingActionButton from '@/components/ui/floating-action-button';
import ListItemShell from '@/components/list-item-shell';
import Dot from '@/components/dot';
import Container from '@/components/base/container';
import FilterList from '@/components/filter-list/filter-list';
import { getMonthOf, YYYYMMDD } from '@/utils/date';
import { useToday } from '@/hooks/use-today';
import {
  filterByCategoryId,
  toggleSingleSelectFilter,
} from '@/components/filter-list/filter-by-category';
import { useAuth } from '@/context/auth-context';
import { useActivitiesQuery } from '@/hooks/queries/use-activities';
import { useCategoriesQuery } from '@/hooks/queries/use-categories';
import { useTimelineQuery } from '@/hooks/queries/use-timeline';
import { useCompleteActivityMutation } from '@/hooks/mutations/use-activity-mutations';
import { useActivityQueue } from '@/hooks/use-activity-queue';
import { useGuide } from '@/hooks/use-guide';
import GuideModal from '@/components/guide/guide-modal';
import GuideInfoButton from '@/components/guide/guide-info-button';
import { HOME_GUIDE_STEPS } from '@/components/guide/home-guide-steps';
import {
  logOnboardingComplete,
  logOnboardingSkip,
  logOnboardingStart,
  logOnboardingStepComplete,
  logOnboardingStepView,
} from '@/lib/analytics/analytics';

function sortActivities(acts: IActivityClient[] = []) {
  return [...acts].sort((a, b) => {
    // queued items go first
    if (a.queued !== b.queued) {
      if (a.queued) return -1;
      if (b.queued) return 1;
    }

    // completed items go last
    if (!!a.completedToday !== !!b.completedToday) {
      if (a.completedToday) return 1;
      if (b.completedToday) return -1;
    }

    const daysUntilSort = (a.daysUntil || 0) - (b.daysUntil || 0);
    if (daysUntilSort !== 0) return daysUntilSort;
    return a.name.localeCompare(b.name);
  });
}

function partitionActivities(acts: IActivityClient[]) {
  const queued: IActivityClient[] = [];
  const available: IActivityClient[] = [];
  const completed: IActivityClient[] = [];

  for (const activity of acts) {
    if (activity.completedToday) {
      completed.push(activity);
    } else if (activity.queued) {
      queued.push(activity);
    } else {
      available.push(activity);
    }
  }

  return { queued, available, completed };
}

const ACTIVITY_SECTIONS = [
  { title: 'Queued', key: 'queued' },
  { title: 'Pending', key: 'available' },
  { title: 'Completed', key: 'completed' },
] as const;

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return <DashboardContent userId={user.id} />;
}

function DashboardContent({ userId }: { userId: string }) {
  const router = useRouter();
  const {
    data: activities = [],
    isPending: isActivitiesPending,
    isError: isActivitiesError,
    refetch: refetchActivities,
  } = useActivitiesQuery();
  const {
    data: categories = [],
    isPending: isCategoriesPending,
    isError: isCategoriesError,
    refetch: refetchCategories,
  } = useCategoriesQuery();
  // The user's local date, refreshed at their midnight: everything below
  // ("completed today", the current month's timeline) is relative to it.
  const today = useToday();
  const currentMonth = getMonthOf(today);
  const { data: timeline } = useTimelineQuery(currentMonth);
  const completeActivity = useCompleteActivityMutation();
  const {
    queuedIds,
    isHydrated: isQueueHydrated,
    toggleQueuedActivity,
    removeFromQueue,
  } = useActivityQueue(userId);

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  // Home onboarding guide — auto-shows on first visit; the info (i) icon reopens it.
  const guide = useGuide({ pageId: 'home' });

  // --- Onboarding funnel analytics -------------------------------------------
  // The guide IS onboarding. We measure: start, per-step view, per-step
  // completion, completion, and skip (dismissal without finishing).
  const stepCount = HOME_GUIDE_STEPS.length;
  const stepNames = HOME_GUIDE_STEPS.map((s) => s.title);
  // Index of the step currently (or last) being viewed, so we can derive
  // "step complete" whenever the user moves forward.
  const viewedStepRef = useRef(0);

  // Guide opened → funnel starts on the first step.
  useEffect(() => {
    if (!guide.isOpen) return;
    viewedStepRef.current = 0;
    logOnboardingStart('home');
    logOnboardingStepView(0, stepNames[0] ?? '', stepCount);
  }, [guide.isOpen, stepCount, stepNames]);

  function handleOnboardingStepChange(index: number) {
    if (index > viewedStepRef.current) {
      // Moving forward: the previously-viewed step was completed.
      logOnboardingStepComplete(viewedStepRef.current, stepCount);
    }
    viewedStepRef.current = index;
    logOnboardingStepView(index, stepNames[index] ?? '', stepCount);
  }

  function handleOnboardingDismiss() {
    // Dismissal = skip (abandoned before finishing the funnel).
    logOnboardingSkip(viewedStepRef.current, stepCount);
    guide.dismiss();
  }

  function handleOnboardingComplete() {
    logOnboardingComplete(stepCount);
    guide.finish();
  }

  const activitiesWithQueue = useMemo(() => {
    const withClientState = activities.map((activity) => {
      const completedToday =
        timeline?.[String(activity.id)]?.has(today) ?? false;
      return {
        ...activity,
        queued: !completedToday && queuedIds.has(activity.id),
        completedToday,
      };
    });
    return sortActivities(withClientState);
  }, [activities, queuedIds, timeline, today]);

  function handleActivityClick(activity: IActivityClient) {
    if (activity.completedToday) return;
    toggleQueuedActivity(activity.id);
  }

  async function handleComplete(activityId: number) {
    try {
      await completeActivity.mutateAsync({
        activityId,
        // The user's local date, read at tap time so a completion made just
        // after their midnight is recorded against the new day.
        date: YYYYMMDD(),
      });
      removeFromQueue(activityId);
      Toast.show({
        type: 'success',
        text1: 'Activity Completed',
      });
    } catch (error) {
      console.error('Error completing activity', error);
    }
  }

  function handleEdit(activity: IActivityClient) {
    router.push(`/activities/edit/${activity.id}`);
  }

  function handleCategoryPress(categoryId: number) {
    setActiveCategoryId((current) =>
      toggleSingleSelectFilter(current, categoryId),
    );
  }

  const filteredActivities = filterByCategoryId(
    activitiesWithQueue,
    activeCategoryId,
  );

  const activitySections = useMemo(() => {
    const groups = partitionActivities(filteredActivities);
    return ACTIVITY_SECTIONS.map(({ title, key }) => ({
      title,
      items: groups[key],
    })).filter((section) => section.items.length > 0);
  }, [filteredActivities]);

  // Queue hydration is local and usually finishes with (or before) network data,
  // so this does not add a noticeable extra loading state.
  if (isActivitiesPending || isCategoriesPending || !isQueueHydrated) {
    return <LoaderScreen text="Loading activities..." />;
  }

  if (isActivitiesError || isCategoriesError) {
    return (
      <ErrorScreen
        message="Unable to load activities."
        onRetry={() => {
          void refetchActivities();
          void refetchCategories();
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Background />
      <ScrollView>
        <Container style={styles.scrollContent}>
          <View style={styles.headlineRow}>
            <ThemedText
              type="defaultBold"
              style={[
                styles.headline,
                !(categories.length > 0) && styles.headlineNoCategories,
              ]}
              size="medium"
            >
              Activities Center
            </ThemedText>

            <View style={styles.headlineActions}>
              <Pressable
                onPress={() => router.push('/activities/insights')}
                style={styles.insightsLink}
              >
                <ThemedText
                  size="small"
                  type="default"
                  style={styles.insightsLinkText}
                >
                  See Insights &rarr;
                </ThemedText>
              </Pressable>
              <GuideInfoButton onPress={guide.open} />
            </View>
          </View>

          <FilterList
            label="Categories"
            items={categories
              .filter((category) => category.id !== undefined)
              .map((category) => ({
                id: category.id!,
                name: category.name,
                color: category.color,
              }))}
            selectedIds={activeCategoryId}
            onItemPress={handleCategoryPress}
          />

          <View
            style={{
              marginTop: 6,
              display: 'flex',
              gap: 8,
            }}
          >
            {activities.length === 0 && (
              <ListItemShell style={styles.getStartedPill}>
                <View
                  style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}
                >
                  <Dot />
                  <ThemedText type="defaultBold">
                    Add your first activity
                  </ThemedText>
                </View>
                <ThemedText size="extraSmall">
                  Get started by adding your first activity!
                </ThemedText>
              </ListItemShell>
            )}
            {activitySections.map((section, sectionIndex) => (
              <View
                key={section.title}
                style={sectionIndex > 0 ? styles.sectionGroupSpaced : undefined}
              >
                <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
                  {section.title}
                </ThemedText>
                <View style={styles.sectionItems}>
                  {section.items.map((activity) => (
                    <ActivityListItem
                      key={activity.id}
                      activity={activity}
                      onClick={handleActivityClick}
                      onEdit={handleEdit}
                      onComplete={handleComplete}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </Container>
      </ScrollView>

      <FloatingActionButton
        label="Add Activity"
        onPress={() => router.push('/activities/create')}
      />

      <GuideModal
        visible={guide.isOpen}
        steps={HOME_GUIDE_STEPS}
        onClose={handleOnboardingDismiss}
        onComplete={handleOnboardingComplete}
        onStepChange={handleOnboardingStepChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181d23',
  },
  scrollContent: {
    display: 'flex',
    gap: 8,
    paddingBottom: 100,
  },
  headlineRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 3,
  },
  headlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headline: {
    color: '#fff',
    fontFamily: '"system-ui"',
    fontWeight: 700,
  },
  headlineNoCategories: {
    marginBottom: 3,
  },
  insightsLink: {},
  insightsLinkText: {},
  getStartedPill: {
    paddingTop: 14,
    paddingHorizontal: 15,
    paddingBottom: 12,
    gap: 2,
  },
  sectionHeader: {
    opacity: 0.6,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 13,
  },
  sectionGroupSpaced: {
    marginTop: 14,
  },
  sectionItems: {
    gap: 8,
  },
});
