import { ErrorCode, type ApiResponse, type ServerResponse } from './api.types';
import { errorMapper } from './errorHandler';

export interface OptionalOptions {
  signal?: AbortSignal;
}

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

class APIClient {
  async request<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
      console.log('Full URL', fullUrl);
      const response = await fetch(fullUrl, {
        // Set your default options here
        ...options,
        credentials: 'include',
        headers: new Headers({
          'Content-Type': 'application/json',
          ...options.headers,
        }),
      });

      if (options.method === 'DELETE') {
        let json: ServerResponse<T>;
        try {
          json = await response.json();
        } catch {
          return { data: undefined as T };
        }

        if (json.error) {
          return {
            error: errorMapper.mapError(json.error),
          };
        }

        if (!response.ok) {
          return {
            error: {
              code: ErrorCode.GENERIC_ERROR,
              message: 'Something went wrong, please try again.',
            },
          };
        }

        return {
          data: json.data!,
        };
      }

      const json: ServerResponse<T> = await response.json();

      if (json.error) {
        return {
          error: errorMapper.mapError(json.error),
        };
      }

      if (!response.ok) {
        return {
          error: {
            code: ErrorCode.GENERIC_ERROR,
            message: 'Something went wrong, please try again.',
          },
        };
      }

      return {
        data: json.data!,
      };
    } catch (error) {
      // Fetch only throws an error for specific network conditions, or permission/configuration issues
      console.error('Error while making request', error);
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
