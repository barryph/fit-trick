import type { IUser } from './api.types';
import { apiClient, type OptionalOptions } from './api.client';

export type AuthProvider = 'google' | 'apple';

interface FetchUserResponse {
  user: IUser;
  // External providers the account is linked to, derived server-side from the
  // account's external identity records. Never trusted from the client.
  authProviders: AuthProvider[];
}

export const usersAPI = {
  getCurrentUser(options?: OptionalOptions) {
    return apiClient.get<FetchUserResponse>('/users/current', options);
  },
};
