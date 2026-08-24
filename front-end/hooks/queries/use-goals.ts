import { useQuery } from '@tanstack/react-query';
import { goalsAPI, type IGoalProgress, type IGoalStats } from '@/api/api.goals';
import { queryKeys } from '@/lib/query/keys';
import { unwrapApiResponse } from '@/lib/query/unwrap';

async function fetchGoals(today: string): Promise<IGoalProgress[]> {
  const resp = await goalsAPI.getAll(today);
  const data = unwrapApiResponse(resp);
  return data.goals;
}

async function fetchGoalStats(
  activityId: number | string,
  today: string,
): Promise<IGoalStats> {
  const resp = await goalsAPI.getStats(activityId, today);
  return unwrapApiResponse(resp);
}

export function useGoalsQuery(today: string) {
  return useQuery({
    queryKey: queryKeys.goals.all(today),
    queryFn: () => fetchGoals(today),
    enabled: today.length > 0,
  });
}

export function useGoalStatsQuery(
  activityId: number | string | undefined,
  today: string,
) {
  return useQuery({
    queryKey: queryKeys.goals.detail(activityId ?? '', today),
    queryFn: () => fetchGoalStats(activityId!, today),
    enabled: activityId !== undefined && activityId !== '' && today.length > 0,
  });
}
