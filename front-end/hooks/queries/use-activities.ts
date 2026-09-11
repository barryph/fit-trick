import { useQuery } from '@tanstack/react-query';
import { activitiesAPI, type IActivity } from '@/api/api.activity';
import { queryKeys } from '@/lib/query/keys';
import { unwrapApiResponse } from '@/lib/query/unwrap';
import { useToday } from '@/hooks/use-today';

async function fetchActivities(today: string): Promise<IActivity[]> {
  const resp = await activitiesAPI.getAllByUser(today);
  const data = unwrapApiResponse(resp);
  return data.activities;
}

async function fetchActivity(
  id: number | string,
  today: string,
): Promise<IActivity> {
  const resp = await activitiesAPI.getById(id, today);
  const data = unwrapApiResponse(resp);
  return data.activity;
}

/**
 * The activities list, scoped to the user's current local date.
 *
 * `today` comes from `useToday()` rather than being computed inside the query
 * function, so the cache key and the request always agree and the list
 * refreshes by itself when the user's day rolls over.
 */
export function useActivitiesQuery() {
  const today = useToday();

  return useQuery({
    queryKey: queryKeys.activities.all(today),
    queryFn: () => fetchActivities(today),
  });
}

export function useActivityQuery(id: number | string | undefined) {
  const today = useToday();

  return useQuery({
    queryKey: queryKeys.activities.detail(id ?? '', today),
    queryFn: () => fetchActivity(id!, today),
    enabled: id !== undefined && id !== '',
  });
}
