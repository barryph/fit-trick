import { apiClient, type OptionalOptions } from './api.client';
import { ICategory } from './api.categories';
import { IGoal } from './api.goals';

export interface IActivity {
  id: number;
  userId: string;
  name: string;
  ticker?: string;
  interval: number;
  categoryId?: number;
  category?: ICategory;
  daysUntil: number;
  goal?: IGoal;
  goalProgress?: {
    currentWeekCount: number;
  };
}

// Extend IActivity for client-side properties
export interface IActivityClient extends IActivity {
  queued?: boolean;
  completedToday?: boolean;
}

interface CreateActivityDTO {
  name: string;
  ticker?: string;
  interval: number;
  categoryId?: number;
  lastDone?: string;
  goalTargetPerWeek?: number | null;
}

interface CreateActivityResponse {
  activity: IActivity;
}

interface GetAllActivitiesByUserResponse {
  activities: IActivity[];
}

interface GetActivityByIdResponse {
  activity: IActivity;
}

interface EditActivityDTO {
  name?: string;
  ticker?: string;
  interval?: number;
  categoryId?: number | null;
  goalTargetPerWeek?: number | null;
}

interface EditActivityResponse {
  activity: IActivity;
}

interface CompleteActivityResponse {
  activity: IActivity;
}

interface UndoActivityResponse {
  activity: IActivity;
}

interface DeleteActivityResponse {
  id: number | string;
}

export const activitiesAPI = {
  getById(
    activityId: number | string,
    today: string,
    options?: OptionalOptions,
  ) {
    return apiClient.get<GetActivityByIdResponse>(
      `/activities/${activityId}?today=${encodeURIComponent(today)}`,
      options,
    );
  },

  editActivity(
    activityId: number | string,
    body: EditActivityDTO,
    today: string,
    options?: OptionalOptions,
  ) {
    return apiClient.put<EditActivityResponse>(
      `/activities/edit/${activityId}?today=${encodeURIComponent(today)}`,
      body,
      options,
    );
  },

  createActivity(
    body: CreateActivityDTO,
    today: string,
    options?: OptionalOptions,
  ) {
    return apiClient.post<CreateActivityResponse>(
      `/activities?today=${encodeURIComponent(today)}`,
      body,
      options,
    );
  },

  getAllByUser(today: string, options?: OptionalOptions) {
    return apiClient.get<GetAllActivitiesByUserResponse>(
      `/activities?today=${encodeURIComponent(today)}`,
      options,
    );
  },

  complete(
    activityId: number | string,
    date: string,
    today: string,
    options?: OptionalOptions,
  ) {
    return apiClient.post<CompleteActivityResponse>(
      `/activities/${activityId}/complete?today=${encodeURIComponent(today)}`,
      { date },
      options,
    );
  },

  undo(
    activityId: number | string,
    date: string,
    today: string,
    options?: OptionalOptions,
  ) {
    return apiClient.post<UndoActivityResponse>(
      `/activities/${activityId}/undo?today=${encodeURIComponent(today)}`,
      { date },
      options,
    );
  },

  /**
   * Deletes an activity.
   *
   * Takes the device's local date like every other activity endpoint: the
   * delete flow authorizes through the same read that returns the activity's
   * date-relative countdown, so the API needs the user's calendar date to make
   * that read well-defined.
   */
  deleteActivity(
    activityId: number | string,
    today: string,
    options?: OptionalOptions,
  ) {
    return apiClient.delete<DeleteActivityResponse>(
      `/activities/${activityId}?today=${encodeURIComponent(today)}`,
      options,
    );
  },
};
