import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { generateNonce } from './nonce';
import { SocialAuthError } from './errors';

export function isAppleSignInAvailable(): boolean {
  return Platform.OS === 'ios';
}

export interface AppleSignInResult {
  idToken: string;
  nonce: string;
  // Apple's authorization code, exchanged server-side for a refresh token
  // that is stored server-side to power account-deletion revocation. It is
  // never kept on the client.
  authorizationCode: string;
}

/**
 * Signs in with Apple (iOS only) and returns the identity token plus the raw
 * nonce and authorization code. Apple embeds the SHA-256 of the raw nonce in
 * the token's `nonce` claim; the backend verifies that hash, binding the token
 * to this attempt.
 *
 * The client never decides which user account is authenticated; the backend
 * derives identity exclusively from the verified identity token.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!isAppleSignInAvailable()) {
    throw new SocialAuthError(
      'unavailable',
      'Sign in with Apple is only available on iOS',
    );
  }

  const nonce = await generateNonce(32);

  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
  } catch (error) {
    throw mapAppleError(error);
  }

  if (!credential.identityToken) {
    throw new SocialAuthError(
      'failed',
      'No identity token returned from Apple',
    );
  }
  if (!credential.authorizationCode) {
    throw new SocialAuthError(
      'failed',
      'No authorization code returned from Apple',
    );
  }

  return {
    idToken: credential.identityToken,
    nonce,
    authorizationCode: credential.authorizationCode,
  };
}

function mapAppleError(error: unknown): SocialAuthError {
  if (error instanceof SocialAuthError) {
    return error;
  }

  const code = (error as { code?: string })?.code;
  if (code === 'ERR_REQUEST_CANCELED') {
    return new SocialAuthError('cancelled', 'Apple sign-in was cancelled');
  }
  return new SocialAuthError('failed', 'Apple sign-in failed');
}
