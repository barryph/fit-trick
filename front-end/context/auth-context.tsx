import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  authAPI,
  type LoginResponse,
  type RegisterResponse,
} from '../api/api.auth';
import {
  ErrorCode,
  type ApiResponse,
  type AppError,
  type IUser,
} from '@/api/api.types';
import { usersAPI } from '@/api/api.users';
import LoaderScreen from '@/components/base/loader-screen';
import { queryClient } from '@/lib/query/client';
import { ApiError } from '@/lib/query/unwrap';
import {
  revokeGoogleAccess,
  signInWithGoogle as googleSignInClient,
} from '@/lib/auth/google';
import { signInWithApple as appleSignInClient } from '@/lib/auth/apple';
import { isSocialAuthError } from '@/lib/auth/errors';
import { setSessionExpiredHandler } from '@/lib/auth/session-expiry';
import { removeItem } from '@/lib/storage/client';
import { storageKeys } from '@/lib/storage/keys';
import {
  logLogin,
  logLoginFailed,
  logSignUp,
  logSignUpFailed,
} from '@/lib/analytics/analytics';
import type { AuthMethod } from '@/lib/analytics/events';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: IUser | null;
  login: (
    email: string,
    password: string,
  ) => Promise<ApiResponse<LoginResponse>>;
  logout: () => Promise<void>;
  register: (
    email: string,
    password: string,
    passwordConfirm: string,
  ) => Promise<ApiResponse<RegisterResponse>>;
  signInWithGoogle: () => Promise<ApiResponse<LoginResponse>>;
  signInWithApple: () => Promise<ApiResponse<LoginResponse>>;
  deleteAccount: () => Promise<void>;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

function toAppError(
  code: AppError['code'],
  message: string,
): ApiResponse<LoginResponse> {
  return { error: { code, message } };
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<IUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Prevents duplicate simultaneous sign-in requests.
  const socialAuthInFlight = useRef(false);
  // Mirrors `isAuthenticated` so the session-expiry handler can read the latest
  // value without being re-registered on every auth state change.
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await usersAPI.getCurrentUser();
        if (response.data?.user) {
          setUser(response.data.user);
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('Error fetching user:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, []);

  /**
   * A 401 on any request means the session cookie is gone (it expires after 14
   * days, and there is no renewal). Without this the app kept rendering its
   * error states while still believing it was signed in, and never offered a
   * way back to the login screen.
   */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (!isAuthenticatedRef.current) return;
      setUser(null);
      setIsAuthenticated(false);
      queryClient.clear();
    });

    return () => setSessionExpiredHandler(null);
  }, []);

  async function login(
    email: string,
    password: string,
  ): Promise<ApiResponse<LoginResponse>> {
    const response = await authAPI.login({ email, password });
    if (response.error) {
      console.error('Error logging in', response.error);
      logLoginFailed('password', response.error.code);
    } else {
      setUser(response.data.user);
      setIsAuthenticated(true);
      logLogin('password');
    }
    return response;
  }

  async function logout() {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('Error logging out', err);
      throw err;
    }
    setUser(null);
    setIsAuthenticated(false);
    queryClient.clear();
  }

  /**
   * Deletes the authenticated user's account. The backend decides which
   * account to delete from the session alone; no identifier is ever sent.
   *
   * Google's documented disconnect flow applies only to accounts actually
   * linked to Google, so the linked providers are fetched from the server
   * first and `revokeAccess` is only attempted for Google-linked accounts.
   * The disconnect itself is best-effort — the app holds no Google API scopes
   * beyond OIDC identity, and failures must not block account deletion.
   *
   * On success all local auth state and the user's offline queue are cleared;
   * the navigation guard then redirects to the login screen. Throws `ApiError`
   * on failure so the UI can surface the reason; the account is left intact.
   */
  async function deleteAccount(): Promise<void> {
    console.log('is google linked:', await isGoogleLinked());
    if (await isGoogleLinked()) {
      try {
        await revokeGoogleAccess();
      } catch (err) {
        console.error(
          'Google revokeAccess failed during account deletion (best-effort)',
          err,
        );
      }
    }

    const response = await authAPI.deleteAccount();
    if (response.error) {
      // The account is already gone: treat as success (idempotent deletion).
      if (response.error.code === ErrorCode.ACCOUNT_NOT_FOUND) {
        clearLocalAccountState();
        return;
      }
      throw new ApiError(response.error);
    }

    clearLocalAccountState();
  }

  /**
   * Reports whether the authenticated account is linked to Google, from the
   * server's external-identity records. Fetching fresh here (rather than
   * reusing boot-time state) keeps the check authoritative even right after a
   * provider sign-in. When the lookup fails, the account is treated as not
   * Google-linked so no disconnect is attempted for it.
   */
  async function isGoogleLinked(): Promise<boolean> {
    try {
      const current = await usersAPI.getCurrentUser();
      console.log('authProviders', current.data?.authProviders);
      return current.data?.authProviders.includes('google') ?? false;
    } catch (err) {
      console.error('Error fetching account providers before deletion', err);
      return false;
    }
  }

  function clearLocalAccountState() {
    if (user) {
      void removeItem(storageKeys.activityQueue(user.id));
    }
    setUser(null);
    setIsAuthenticated(false);
    queryClient.clear();
  }

  async function register(
    email: string,
    password: string,
    passwordConfirm: string,
  ): Promise<ApiResponse<RegisterResponse>> {
    const response = await authAPI.register({
      email,
      password,
      passwordConfirm,
    });
    if (response.error) {
      console.error('Error registering:', response.error);
      logSignUpFailed('password', response.error.code);
    } else {
      setUser(response.data.user);
      setIsAuthenticated(true);
      logSignUp('password');
    }
    return response;
  }

  /**
   * Runs a provider sign-in, then exchanges the verified credential with the
   * backend. Only the backend decides which application account is
   * authenticated. Provider-specific errors are normalised so the UI can react
   * (e.g. cancellation is not shown as an error).
   */
  async function performSocialSignIn(
    provider: () => Promise<{
      idToken: string;
      nonce?: string;
      authorizationCode?: string;
    }>,
    exchange: (
      idToken: string,
      nonce?: string,
      authorizationCode?: string,
    ) => Promise<ApiResponse<LoginResponse>>,
    method: AuthMethod,
  ): Promise<ApiResponse<LoginResponse>> {
    if (socialAuthInFlight.current) {
      console.error('Error: Social Auth In Flight');
      return toAppError(
        ErrorCode.SOCIAL_AUTH_FAILED,
        'A sign-in is already in progress.',
      );
    }
    socialAuthInFlight.current = true;

    try {
      let credential: {
        idToken: string;
        nonce?: string;
        authorizationCode?: string;
      };
      try {
        credential = await provider();
      } catch (err) {
        console.log('Failed trying to call provider:', err);
        return mapSocialAuthError(err);
      }

      let response: ApiResponse<LoginResponse>;
      try {
        // FIXME: Why does this recursively call itself? It appears as though it
        // always calls itself and expects one to return `socialAuthInFlight` error
        response = await exchange(
          credential.idToken,
          credential.nonce,
          credential.authorizationCode,
        );
      } catch (err) {
        console.error('Error exchanging social credential', err);
        return toAppError(
          ErrorCode.SOCIAL_AUTH_FAILED,
          'Sign in failed. Please try again.',
        );
      }

      if (response.error) {
        console.error('Error signing in with provider', response.error);
        logLoginFailed(method, response.error.code);
        return response;
      }

      setUser(response.data.user);
      setIsAuthenticated(true);
      logLogin(method);
      return response;
    } finally {
      socialAuthInFlight.current = false;
    }
  }

  function mapSocialAuthError(err: unknown): ApiResponse<LoginResponse> {
    if (isSocialAuthError(err)) {
      switch (err.code) {
        case 'cancelled':
          return toAppError(
            ErrorCode.SOCIAL_AUTH_CANCELLED,
            'Sign in was cancelled.',
          );
        case 'unavailable':
          return toAppError(ErrorCode.SOCIAL_AUTH_UNAVAILABLE, err.message);
        case 'network':
          return toAppError(
            ErrorCode.NETWORK_ERROR,
            'Network error. Please check your connection.',
          );
        default:
          return toAppError(
            ErrorCode.SOCIAL_AUTH_FAILED,
            'Sign in failed. Please try again.',
          );
      }
    }
    return toAppError(
      ErrorCode.SOCIAL_AUTH_FAILED,
      'Sign in failed. Please try again.',
    );
  }

  function signInWithGoogle(): Promise<ApiResponse<LoginResponse>> {
    return performSocialSignIn(
      async () => googleSignInClient(),
      (idToken) => authAPI.googleLogin({ idToken }),
      'google',
    );
  }

  function signInWithApple(): Promise<ApiResponse<LoginResponse>> {
    return performSocialSignIn(
      async () => appleSignInClient(),
      (idToken, nonce, authorizationCode) =>
        authAPI.appleLogin({
          idToken,
          nonce: nonce ?? '',
          authorizationCode: authorizationCode ?? '',
        }),
      'apple',
    );
  }

  if (isLoading) {
    return <LoaderScreen text="Loading..." />;
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        login,
        logout,
        register,
        signInWithGoogle,
        signInWithApple,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
