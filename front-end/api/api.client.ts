import {
  ErrorCode,
  type ApiResponse,
  type AppError,
  type ServerResponse,
} from './api.types';
import { errorMapper } from './errorHandler';
import { notifySessionExpired } from '@/lib/auth/session-expiry';

export interface OptionalOptions {
  signal?: AbortSignal;
}

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

/**
 * Reads the JSON body, tolerating responses that are not JSON.
 *
 * Reverse proxies return text/HTML for 502/504, and a failed `response.json()`
 * used to escape `request()` as a rejection. Callers on the auth screens await
 * the result without a try/catch, so the screen stayed on its loading spinner
 * forever with no message.
 */
async function readJson<T>(
  response: Response,
): Promise<ServerResponse<T> | null> {
  try {
    return (await response.json()) as ServerResponse<T>;
  } catch {
    return null;
  }
}

/** Maps a failed response to the app's error envelope. */
function toError(
  response: Response,
  json: ServerResponse<unknown> | null,
): AppError {
  const error = errorMapper.mapError(
    json?.error ?? { code: '', message: '' },
    response.status,
  );

  if (error.code === ErrorCode.UNAUTHORIZED) {
    // Only the auth layer can end the session, and only the API layer can see
    // the 401, so they are connected through this callback.
    notifySessionExpired();
  }

  return error;
}

class APIClient {
  async request<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
      const response = await fetch(fullUrl, {
        // Set your default options here
        ...options,
        credentials: 'include',
        headers: new Headers({
          'Content-Type': 'application/json',
          ...options.headers,
        }),
      });

      const json = await readJson<T>(response);

      if (json?.error) {
        return { error: toError(response, json) };
      }

      if (!response.ok) {
        return { error: toError(response, json) };
      }

      // A 204/DELETE may legitimately have no body.
      if (!json) {
        return { data: undefined as T };
      }

      return {
        data: json.data!,
      };
    } catch (error) {
      // Fetch only throws an error for specific network conditions, or permission/configuration issues
      // Network error
      if (error instanceof TypeError) {
        return {
          error: {
            code: ErrorCode.NETWORK_ERROR,
            message: 'Network error. Please check your connection.',
          },
        };
      }
      throw error;
    }
  }

  async get<T>(
    url: string,
    options: OptionalOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'GET', ...options });
  }

  async post<T>(
    url: string,
    body: Record<string, any>,
    options: OptionalOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options,
    });
  }

  async put<T>(
    url: string,
    body: Record<string, any>,
    options: OptionalOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...options,
    });
  }

  async delete<T>(
    url: string,
    options: OptionalOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'DELETE', ...options });
  }
}

export const apiClient = new APIClient();
