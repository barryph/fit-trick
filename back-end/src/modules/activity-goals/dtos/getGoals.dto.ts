import { IsString, Matches } from 'class-validator';
import { ActivityGoalDTO } from '../mappers/activityGoalMap';

/**
 * The client's own calendar date, as `YYYY-MM-DD`.
 *
 * Required: week boundaries and "this week" counts are relative to the user's
 * local date, so there is no server-side value that could stand in for it.
 */
export default class GetGoalsQueryDTO {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'today must be in YYYY-MM-DD format',
  })
  today: string;
}

export interface GoalProgressDTO {
  goalId: string;
  activityId: string;
  activityName: string;
  targetPerWeek: number;
  currentWeekCount: number;
  categoryColor?: string | null;
}

export interface GoalWeeklyPoint {
  weekStart: string;
  count: number;
}

export interface GoalAdherenceDTO {
  applicable: number;
  met: number;
  /** Fraction 0..1, or null when there are no applicable weeks */
  percentage: number | null;
}

export interface GoalStatsDTO {
  goal: ActivityGoalDTO;
  activityName: string;
  currentWeekCount: number;
  weeklyPerformance: GoalWeeklyPoint[];
  adherence: GoalAdherenceDTO;
  heatmap: GoalWeeklyPoint[];
  firstCompletionDate: string | null;
}
