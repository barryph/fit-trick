import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple, isAppleSignInAvailable } from '../apple';

const mockSignInAsync = jest.mocked(AppleAuthentication.signInAsync);

describe('Apple sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is only available on iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(isAppleSignInAvailable()).toBe(true);

    jest.replaceProperty(Platform, 'OS', 'android');
    expect(isAppleSignInAvailable()).toBe(false);
  });

  it('throws unavailable when not on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await expect(signInWithApple()).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('returns the identity token, raw nonce, and authorization code on success', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockSignInAsync.mockResolvedValue({
      identityToken: 'apple-id-token',
      fullName: null,
      email: null,
      authorizationCode: 'apple-auth-code',
      user: 'apple-user',
    } as AppleAuthentication.AppleAuthenticationCredential);

    const result = await signInWithApple();

    expect(result.idToken).toBe('apple-id-token');
    expect(result.authorizationCode).toBe('apple-auth-code');
    expect(result.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(mockSignInAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        nonce: result.nonce,
        requestedScopes: expect.any(Array),
      }),
    );
  });

  it('throws a cancelled error when the user cancels', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const error = new Error('cancelled') as Error & { code?: string };
    error.code = 'ERR_REQUEST_CANCELED';
    mockSignInAsync.mockRejectedValue(error);

    await expect(signInWithApple()).rejects.toMatchObject({
      code: 'cancelled',
    });
  });

  it('fails when no identity token is returned', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockSignInAsync.mockResolvedValue({
      identityToken: null,
    } as unknown as AppleAuthentication.AppleAuthenticationCredential);

    await expect(signInWithApple()).rejects.toMatchObject({ code: 'failed' });
  });

  it('fails when no authorization code is returned', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockSignInAsync.mockResolvedValue({
      identityToken: 'apple-id-token',
      authorizationCode: null,
    } as unknown as AppleAuthentication.AppleAuthenticationCredential);

    await expect(signInWithApple()).rejects.toMatchObject({ code: 'failed' });
  });
});
