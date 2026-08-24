import React from 'react';
import type { ApiResponse, IUser } from '@/api/api.types';
import type { LoginResponse, RegisterResponse } from '@/api/api.auth';
import { testUser } from './fixtures/users';

export interface MockAuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: IUser | null;
  login: jest.Mock<
    Promise<ApiResponse<LoginResponse>>,
    [email: string, password: string]
  >;
  logout: jest.Mock<Promise<void>, []>;
  register: jest.Mock<
    Promise<ApiResponse<RegisterResponse>>,
    [email: string, password: string, passwordConfirm: string]
  >;
  signInWithGoogle: jest.Mock<Promise<ApiResponse<LoginResponse>>, []>;
  signInWithApple: jest.Mock<Promise<ApiResponse<LoginResponse>>, []>;
  deleteAccount: jest.Mock<Promise<void>, []>;
}

export function createMockAuthValue(
  overrides: Partial<MockAuthContextValue> = {},
): MockAuthContextValue {
  return {
    isAuthenticated: true,
    isLoading: false,
    user: testUser,
    login: jest.fn().mockResolvedValue({ data: { user: testUser } }),
    logout: jest.fn().mockResolvedValue(undefined),
    register: jest.fn().mockResolvedValue({ data: { user: testUser } }),
    signInWithGoogle: jest.fn().mockResolvedValue({ data: { user: testUser } }),
    signInWithApple: jest.fn().mockResolvedValue({ data: { user: testUser } }),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Mutable auth value returned by the shared useAuth mock. */
let currentAuth = createMockAuthValue();

export function getMockAuth(): MockAuthContextValue {
  return currentAuth;
}

/**
 * Replace the shared mock auth value. Pass overrides to tweak individual fields.
 * Returns the new value so tests can assert against spies (e.g. auth.login).
 */
export function setMockAuth(
  overrides: Partial<MockAuthContextValue> = {},
): MockAuthContextValue {
  currentAuth = createMockAuthValue(overrides);
  return currentAuth;
}

export function resetMockAuth(): MockAuthContextValue {
  currentAuth = createMockAuthValue();
  return currentAuth;
}

/**
 * Factory for `jest.mock('@/context/auth-context', ...)`.
 * useAuth() reads the mutable value from setMockAuth / resetMockAuth.
 */
export function createAuthContextMock() {
  return {
    useAuth: () => getMockAuth(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  };
}
