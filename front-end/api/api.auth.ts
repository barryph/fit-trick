import type { IUser } from './api.types';
import { apiClient } from './api.client';

interface LoginDTO {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: IUser;
}

interface RegisterDTO {
  email: string;
  password: string;
  passwordConfirm: string;
}

export interface RegisterResponse {
  user: IUser;
}

interface ForgotPasswordDTO {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

interface ResetPasswordDTO {
  token: string;
  password: string;
}

export interface ResetPasswordResponse {
  message: string;
}

interface GoogleLoginDTO {
  idToken: string;
}

interface AppleLoginDTO {
  idToken: string;
  nonce: string;
  // Apple's authorization code for this sign-in. The backend exchanges it for
  // a refresh token it stores server-side (never returned here) so it can
  // revoke the user's Sign in with Apple authorization on account deletion.
  authorizationCode: string;
}

export interface DeleteAccountResponse {
  message: string;
}

export const authAPI = {
  login(body: LoginDTO) {
    return apiClient.post<LoginResponse>('/auth/login', body);
  },

  logout() {
    return apiClient.delete<undefined>('/auth/logout');
  },

  register(body: RegisterDTO) {
    return apiClient.post<RegisterResponse>('/auth/register', body);
  },

  googleLogin(body: GoogleLoginDTO) {
    return apiClient.post<LoginResponse>('/auth/google', body);
  },

  appleLogin(body: AppleLoginDTO) {
    return apiClient.post<LoginResponse>('/auth/apple', body);
  },

  forgotPassword(body: ForgotPasswordDTO) {
    return apiClient.post<ForgotPasswordResponse>(
      '/auth/forgot-password',
      body,
    );
  },

  resetPassword(body: ResetPasswordDTO) {
    return apiClient.post<ResetPasswordResponse>('/auth/reset-password', body);
  },

  /**
   * Deletes the authenticated user's account. The backend derives the account
   * exclusively from the session; no identifier is sent or accepted here.
   */
  deleteAccount() {
    return apiClient.delete<DeleteAccountResponse>('/account');
  },
};
