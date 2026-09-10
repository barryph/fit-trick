import { ErrorCode, type ApiResponse, type AppError } from '@/api/api.types';

export class ApiError extends Error {
  appError: AppError;

  constructor(appError: AppError) {
    super(appError.message);
    this.name = 'ApiError';
    this.appError = appError;
  }
}

export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (response.error) {
    throw new ApiError(response.error);
  }

  if (response.data === undefined) {
    throw new ApiError({
      code: ErrorCode.GENERIC_ERROR,
      message: 'Something went wrong, please try again.',
    });
  }

  return response.data;
}
