import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { SocialAuthError } from './errors';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    // The web/server client ID is required so Google mints an ID token
    // intended for backend authentication.
    webClientId: WEB_CLIENT_ID,
    ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
  });
  configured = true;
}

export interface GoogleSignInResult {
  idToken: string;
}

/**
 * Signs in with Google and returns the ID token to send to the backend. Only
 * the OIDC `email`/`profile` scopes (Google's default) are requested — no
 * additional Google API access.
 *
 * The client never decides which user account is authenticated; the backend
 * derives identity exclusively from the verified ID token.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  ensureConfigured();

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (error) {
    console.log('Log:: Error signing in with GoogleSignin', error);
    console.error('Error:: Error signing in with GoogleSignin', error);
    throw mapGoogleError(error);
  }

  if (response.type === 'cancelled' || !response.data) {
    console.log('log:: Error: signInWithGoogle cancelled');
    console.error('Error:: Error: signInWithGoogle cancelled');
    throw new SocialAuthError('cancelled', 'Google sign-in was cancelled');
  }

  if (!response.data.idToken) {
    console.log('Error: no ID token');
    throw new SocialAuthError('failed', 'No ID token returned from Google');
  }

  return { idToken: response.data.idToken };
}

function mapGoogleError(error: unknown): SocialAuthError {
  if (error instanceof SocialAuthError) {
    return error;
  }

  const code = (error as { code?: string | number })?.code;
  if (code === statusCodes.SIGN_IN_CANCELLED) {
    return new SocialAuthError('cancelled', 'Google sign-in was cancelled');
  }
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return new SocialAuthError(
      'unavailable',
      'Google Play services are not available on this device',
    );
  }
  if (
    code === statusCodes.SIGN_IN_REQUIRED ||
    code === statusCodes.IN_PROGRESS
  ) {
    return new SocialAuthError('failed', 'Google sign-in could not complete');
  }
  console.log('LOG:: Inside mapping', error);
  console.error('ERR:: Inside mapping', error);
  return new SocialAuthError('failed', 'Google sign-in failed');
}

/**
 * Revokes this app's access on the user's Google account, as recommended by
 * Google's account-deletion/disconnect docs. Best-effort: it only has meaning
 * when the current device holds a Google session for the app, and the app is
 * only granted OIDC scopes. Callers should treat failure as non-fatal (the
 * account deletion itself is decided by the backend).
 */
export async function revokeGoogleAccess(): Promise<void> {
  ensureConfigured();
  try {
    await GoogleSignin.revokeAccess();
  } catch (error) {
    throw mapGoogleError(error);
  }
}
