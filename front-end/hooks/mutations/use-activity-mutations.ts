import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  activitiesAPI,
  type IActivity,
  type IActivityClient,
} from '@/api/api.activity';
import { queryKeys } from '@/lib/query/keys';
import { patchTimelineSet } from '@/lib/query/timeline-utils';
import { unwrapApiResponse } from '@/lib/query/unwrap';
import { YYYYMMDD } from '@/utils/date';
import {
  logCreateActivity,
  logDeleteActivity,
  logEditActivity,
  logActivityCompleted,
  logFirstActivityCompleted,
} from '@/lib/analytics/analytics';
import {
  hasUserCompletedEver,
  markUserCompletedEver,
} from '@/lib/storage/completion-state';

/**
 * Writes a fresh activity into every cached activities *list*, whatever date it
 * was fetched for. The lists are keyed by the user's local date, and a mutation
 * response is authoritative for the date it was made on, so the update is
 * applied by list prefix rather than to one exact key. Detail entries are
 * deliberately not matched: their data is a single activity, not an array.
 */
function updateActivitiesListCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (activities: IActivity[]) => IActivity[],
) {
  queryClient.setQueriesData<IActivity[]>(
    { queryKey: queryKeys.activities.list },
    (current) => (current ? updater(current) : current),
  );
}

/**
 * Fire `activity_completed` on every completion, and `first_activity_completed`
 * exactly once per user (persisted in AsyncStorage). Best-effort — analytics
 * failures must never affect the completion flow.
 */
function reportActivityCompletion(userId: string): void {
  logActivityCompleted();
  void hasUserCompletedEver(userId).then((completedEver) => {
    if (completedEver) return;
    void markUserCompletedEver(userId).then(() => logFirstActivityCompleted());
  });
}

function setActivityInCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  activity: IActivity,
  today: string,
) {
  queryClient.setQueryData(
    queryKeys.activities.detail(activity.id, today),
    activity,
  );
  updateActivitiesListCache(queryClient, (activities) =>
    activities.map((item) => (item.id === activity.id ? activity : item)),
  );
}

function removeActivityFromCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  activityId: number | string,
) {
  // Detail queries are date-scoped, so remove by prefix to catch every date's.
  queryClient.removeQueries({
    queryKey: queryKeys.activities.details(activityId),
  });
  updateActivitiesListCache(queryClient, (activities) =>
    activities.filter((item) => String(item.id) !== String(activityId)),
  );
}

function invalidateTimeline(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.timeline.all });
}

function invalidateGoals(queryClient: ReturnType<typeof useQueryClient>) {
  // The base prefix matches the goals list and every goal's stats query
  // regardless of the `today` each was fetched with.
  void queryClient.invalidateQueries({ queryKey: queryKeys.goals.base });
}

export function useCreateActivityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      body: Parameters<typeof activitiesAPI.createActivity>[0],
    ) => {
      // Read the user's local date at request time rather than at render time:
      // a mutation fired just after local midnight must carry the new day, and
      // the API treats it as the calendar date every calculation is relative to.
      const today = YYYYMMDD();
      const resp = await activitiesAPI.createActivity(body, today);
      const data = unwrapApiResponse(resp);
      return { activity: data.activity, today };
    },
    onSuccess: ({ activity, today }) => {
      updateActivitiesListCache(queryClient, (activities) => [
        ...activities,
        activity,
      ]);
      queryClient.setQueryData(
        queryKeys.activities.detail(activity.id, today),
        activity,
      );
      logCreateActivity(Boolean(activity.goal));
      void invalidateTimeline(queryClient);
      invalidateGoals(queryClient);
    },
  });
}

export function useEditActivityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      body,
    }: {
      activityId: number | string;
      body: Parameters<typeof activitiesAPI.editActivity>[1];
    }) => {
      const today = YYYYMMDD();
      const resp = await activitiesAPI.editActivity(activityId, body, today);
      const data = unwrapApiResponse(resp);
      return { activity: data.activity, today };
    },
    onSuccess: ({ activity, today }) => {
      setActivityInCaches(queryClient, activity, today);
      logEditActivity();
      void invalidateTimeline(queryClient);
      invalidateGoals(queryClient);
    },
  });
}

export function useDeleteActivityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activityId: number | string) => {
      // Read at request time so the delete carries the user's current day, like
      // every other activity mutation.
      const today = YYYYMMDD();
      const resp = await activitiesAPI.deleteActivity(activityId, today);
      const data = unwrapApiResponse(resp);
      return data.id;
    },
    onSuccess: (activityId) => {
      removeActivityFromCaches(queryClient, activityId);
      logDeleteActivity();
      void invalidateTimeline(queryClient);
      invalidateGoals(queryClient);
    },
  });
}

export function useCompleteActivityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      date,
    }: {
      activityId: number | string;
      date: string;
    }) => {
      const today = YYYYMMDD();
      const resp = await activitiesAPI.complete(activityId, date, today);
      const data = unwrapApiResponse(resp);
      return { activity: data.activity, date, today };
    },
    onSuccess: ({ activity, date, today }) => {
      setActivityInCaches(queryClient, activity, today);
      queryClient.setQueriesData(
        { queryKey: queryKeys.timeline.all },
        (current: ReturnType<typeof patchTimelineSet> | undefined) =>
          current
            ? patchTimelineSet(current, activity.id, date, true)
            : current,
      );
      invalidateGoals(queryClient);
      void reportActivityCompletion(activity.userId);
    },
  });
}

export function useUndoActivityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      date,
    }: {
      activityId: number | string;
      date: string;
    }) => {
      const today = YYYYMMDD();
      const resp = await activitiesAPI.undo(activityId, date, today);
      const data = await unwrapApiResponse(resp);
      return { activity: data.activity, date, today };
    },
    onSuccess: ({ activity, date, today }) => {
      setActivityInCaches(queryClient, activity, today);
      queryClient.setQueriesData(
        { queryKey: queryKeys.timeline.all },
        (current: ReturnType<typeof patchTimelineSet> | undefined) =>
          current
            ? patchTimelineSet(current, activity.id, date, false)
            : current,
      );
      invalidateGoals(queryClient);
    },
  });
}

export type { IActivityClient };
