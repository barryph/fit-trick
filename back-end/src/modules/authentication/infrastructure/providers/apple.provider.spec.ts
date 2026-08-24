import jwt from 'jsonwebtoken';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { AppleProvider } from './apple.provider';
import {
  OAuthCredentialError,
  ProviderRevocationFailedError,
} from '../../authentication.errors';
import {
  buildUnsignedToken,
  createTestSigningKey,
  sha256Hex,
  signToken,
  startAppleApiServer,
  startJwksServer,
  type AppleApiServer,
  type JwksServer,
  type TestSigningKey,
} from '../../../../../test/helpers/test-jwks';

const BUNDLE_ID = 'com.example.app';
const ISSUER = 'https://appleid.apple.com';

function createTestEcKey(): { privatePem: string; publicKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey,
  };
}

describe('AppleProvider', () => {
  let provider: AppleProvider;
  let jwksServer: JwksServer;
  let keyA: TestSigningKey;
  let keyB: TestSigningKey;

  const validToken = (
    overrides: Partial<{
      key?: TestSigningKey;
      iss?: string;
      aud?: string | string[];
      sub?: string;
      email?: string;
      nonce?: string;
      exp?: number;
      algorithm?: string;
    }> = {},
  ) =>
    signToken({
      key: keyA,
      iss: ISSUER,
      aud: BUNDLE_ID,
      sub: 'apple-subject-1',
      email: 'user@example.com',
      ...overrides,
    });

  beforeAll(async () => {
    keyA = createTestSigningKey('apple-key-a');
    keyB = createTestSigningKey('apple-key-b');
    jwksServer = await startJwksServer([keyA]);
  });

  afterAll(async () => {
    await jwksServer.close();
  });

  beforeEach(() => {
    process.env.APPLE_CLIENT_IDS = BUNDLE_ID;
    process.env.APPLE_JWKS_URL = jwksServer.url;
    process.env.APPLE_JWKS_COOLDOWN_MS = '0';
    jwksServer.setKeys([keyA]);
    provider = new AppleProvider();
  });

  it('returns the verified identity for a valid identity token with nonce', async () => {
    const rawNonce = 'crypto-secure-random-nonce';
    const identity = await provider.verifyIdentityToken(
      validToken({ nonce: sha256Hex(rawNonce) }),
      rawNonce,
    );

    expect(identity).toEqual({
      provider: 'apple',
      subject: 'apple-subject-1',
      email: 'user@example.com',
      clientId: BUNDLE_ID,
    });
  });

  it('accepts any configured client ID as audience', async () => {
    process.env.APPLE_CLIENT_IDS = `${BUNDLE_ID},com.example.secondary`;
    provider = new AppleProvider();
    const rawNonce = 'nonce-for-audience-test';

    const identity = await provider.verifyIdentityToken(
      validToken({ aud: 'com.example.secondary', nonce: sha256Hex(rawNonce) }),
      rawNonce,
    );

    expect(identity.subject).toBe('apple-subject-1');
  });

  it('rejects a token signed with an unknown/rotated-out key', async () => {
    await expect(
      provider.verifyIdentityToken(validToken({ key: keyB })),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('rejects a token with a tampered signature', async () => {
    const token = validToken({});
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    await expect(provider.verifyIdentityToken(tampered)).rejects.toThrow(
      OAuthCredentialError,
    );
  });

  it('rejects an expired token', async () => {
    const expired = validToken({ exp: Math.floor(Date.now() / 1000) - 60 });

    await expect(provider.verifyIdentityToken(expired)).rejects.toThrow(
      OAuthCredentialError,
    );
  });

  it('rejects a token with an incorrect issuer', async () => {
    await expect(
      provider.verifyIdentityToken(
        validToken({ iss: 'https://evil.example.com' }),
      ),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('rejects a token with an incorrect audience', async () => {
    await expect(
      provider.verifyIdentityToken(validToken({ aud: 'com.evil.app' })),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('rejects a token missing the sub claim', async () => {
    await expect(
      provider.verifyIdentityToken(validToken({ sub: undefined })),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('rejects a token whose nonce does not match the raw nonce', async () => {
    const token = validToken({ nonce: sha256Hex('different-nonce') });

    await expect(
      provider.verifyIdentityToken(token, 'expected-raw-nonce'),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('rejects when no nonce is provided', async () => {
    const token = validToken({ nonce: sha256Hex('some-nonce') });

    await expect(provider.verifyIdentityToken(token)).rejects.toThrow(
      OAuthCredentialError,
    );
  });

  it('rejects a token without a nonce claim when a nonce is provided', async () => {
    await expect(
      provider.verifyIdentityToken(validToken({}), 'some-raw-nonce'),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('rejects an alg=none token', async () => {
    const unsigned = buildUnsignedToken({
      iss: ISSUER,
      aud: BUNDLE_ID,
      sub: 'apple-subject-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await expect(provider.verifyIdentityToken(unsigned)).rejects.toThrow(
      OAuthCredentialError,
    );
  });

  it('rejects an alg=HS256 algorithm-confusion token', async () => {
    const token = jwt.sign(
      { email: 'user@example.com', sub: 'apple-subject-1' },
      'some-hmac-secret',
      {
        algorithm: 'HS256',
        issuer: ISSUER,
        audience: BUNDLE_ID,
        expiresIn: '1h',
        header: { alg: 'HS256', kid: keyA.kid },
      },
    );

    await expect(provider.verifyIdentityToken(token)).rejects.toThrow(
      OAuthCredentialError,
    );
  });

  it('handles Apple signing-key rotation', async () => {
    const rawNonce = 'rotation-nonce';
    const tokenA = validToken({ nonce: sha256Hex(rawNonce) });
    await expect(
      provider.verifyIdentityToken(tokenA, rawNonce),
    ).resolves.toMatchObject({
      subject: 'apple-subject-1',
    });

    // Apple now serves only keyB.
    jwksServer.setKeys([keyB]);
    const tokenB = validToken({
      key: keyB,
      sub: 'apple-subject-2',
      nonce: sha256Hex(rawNonce),
    });

    await expect(
      provider.verifyIdentityToken(tokenB, rawNonce),
    ).resolves.toMatchObject({
      subject: 'apple-subject-2',
    });

    // A token signed with the rotated-out keyA is rejected.
    await expect(
      provider.verifyIdentityToken(tokenA, rawNonce),
    ).rejects.toThrow(OAuthCredentialError);
  });
});

describe('AppleProvider token exchange and revocation', () => {
  let provider: AppleProvider;
  let apiServer: AppleApiServer;
  let ecKey: ReturnType<typeof createTestEcKey>;

  beforeAll(async () => {
    apiServer = await startAppleApiServer();
    ecKey = createTestEcKey();
  });

  afterAll(async () => {
    await apiServer.close();
  });

  beforeEach(() => {
    apiServer.respondWith(200, {});
    apiServer.requests.length = 0;
    process.env.APPLE_CLIENT_IDS = BUNDLE_ID;
    process.env.APPLE_TOKEN_URL = `${apiServer.url}/auth/token`;
    process.env.APPLE_REVOKE_URL = `${apiServer.url}/auth/revoke`;
    process.env.APPLE_TEAM_ID = 'TEAM12345';
    process.env.APPLE_SERVICES_KEY_ID = 'services-key-id';
    process.env.APPLE_SERVICES_PRIVATE_KEY = ecKey.privatePem;
    delete process.env.APPLE_CLIENT_SECRET;
    provider = new AppleProvider();
  });

  it('exchanges an authorization code for a refresh token with a valid client secret', async () => {
    apiServer.respondWith(200, { refresh_token: 'stored-refresh-token' });

    const refreshToken = await provider.exchangeAuthorizationCode(
      'auth-code-123',
      BUNDLE_ID,
    );

    expect(refreshToken).toBe('stored-refresh-token');
    expect(apiServer.requests).toHaveLength(1);
    const request = apiServer.requests[0];
    expect(request.path).toBe('/auth/token');
    expect(request.body.get('grant_type')).toBe('authorization_code');
    expect(request.body.get('code')).toBe('auth-code-123');
    expect(request.body.get('client_id')).toBe(BUNDLE_ID);

    // The client secret is an ES256 JWT carrying Apple's required claims,
    // signed with the Services ID key.
    const secret = request.body.get('client_secret') ?? '';
    const decoded = jwt.verify(secret, ecKey.publicKey, {
      algorithms: ['ES256'],
    }) as jwt.JwtPayload;
    expect(decoded.iss).toBe('TEAM12345');
    expect(decoded.sub).toBe(BUNDLE_ID);
    expect(decoded.aud).toBe('https://appleid.apple.com');
    expect(decoded.exp! - decoded.iat!).toBeGreaterThan(0);
    expect(jwt.decode(secret, { complete: true })?.header.kid).toBe(
      'services-key-id',
    );
  });

  it('fails the exchange when Apple responds with an error', async () => {
    apiServer.respondWith(400, { error: 'invalid_grant' });

    await expect(
      provider.exchangeAuthorizationCode('bad-code', BUNDLE_ID),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('fails the exchange when no client-secret material is configured', async () => {
    process.env.APPLE_TEAM_ID = '';
    process.env.APPLE_SERVICES_KEY_ID = '';
    process.env.APPLE_SERVICES_PRIVATE_KEY = '';
    provider = new AppleProvider();

    await expect(
      provider.exchangeAuthorizationCode('auth-code-123', BUNDLE_ID),
    ).rejects.toThrow(OAuthCredentialError);
  });

  it('uses a precomputed client secret when configured', async () => {
    process.env.APPLE_CLIENT_SECRET = 'precomputed-secret-jwt';
    provider = new AppleProvider();

    const secret = provider.generateClientSecret(BUNDLE_ID);

    expect(secret).toBe('precomputed-secret-jwt');
  });

  it('revokes a refresh token', async () => {
    apiServer.respondWith(200);

    await expect(
      provider.revokeRefreshToken('refresh-token-abc', BUNDLE_ID),
    ).resolves.toBeUndefined();

    expect(apiServer.requests).toHaveLength(1);
    const request = apiServer.requests[0];
    expect(request.path).toBe('/auth/revoke');
    expect(request.body.get('token')).toBe('refresh-token-abc');
    expect(request.body.get('token_type_hint')).toBe('refresh_token');
    expect(request.body.get('client_id')).toBe(BUNDLE_ID);
    expect(request.body.get('client_secret')).toBeTruthy();
  });

  it('treats an already-revoked token (200) as success', async () => {
    apiServer.respondWith(200);

    await expect(
      provider.revokeRefreshToken('refresh-token-abc', BUNDLE_ID),
    ).resolves.toBeUndefined();
  });

  it('throws a revocation failure when Apple returns an error', async () => {
    apiServer.respondWith(500, { error: 'server_error' });

    await expect(
      provider.revokeRefreshToken('refresh-token-abc', BUNDLE_ID),
    ).rejects.toThrow(ProviderRevocationFailedError);
  });

  it('throws a revocation failure when no client-secret material is configured', async () => {
    process.env.APPLE_TEAM_ID = '';
    process.env.APPLE_SERVICES_KEY_ID = '';
    process.env.APPLE_SERVICES_PRIVATE_KEY = '';
    provider = new AppleProvider();

    await expect(
      provider.revokeRefreshToken('refresh-token-abc', BUNDLE_ID),
    ).rejects.toThrow(ProviderRevocationFailedError);
  });
});
