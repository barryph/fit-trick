import { Injectable } from '@nestjs/common';
import {
  createHash,
  createPublicKey,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import jwt from 'jsonwebtoken';
import { loadOAuthConfig } from '../../config/oauth.config';
import {
  OAuthCredentialError,
  ProviderRevocationFailedError,
} from '../../authentication.errors';
import type { VerifiedExternalIdentity } from '../../domain/external-identity.types';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_TOKEN_ALGORITHM = 'RS256';
const APPLE_CLIENT_SECRET_ALGORITHM = 'ES256';
// Apple requires client secrets to expire within six months.
const APPLE_CLIENT_SECRET_TTL_SECS = 60 * 60 * 24 * 30;

/**
 * An Apple identity plus the verified client ID (bundle identifier) the
 * identity token was issued to, needed for the authorization-code exchange.
 */
export interface AppleVerifiedIdentity extends VerifiedExternalIdentity {
  clientId: string;
}

interface AppleJwk {
  kty: string;
  kid: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Verifies Apple Sign in with Apple identity tokens for backend authentication.
 *
 * The token is verified against Apple's published signing keys:
 *  - JWT signature (RS256) using a public key derived from Apple's JWKS,
 *  - issuer (`https://appleid.apple.com`),
 *  - audience (one of the configured client IDs / bundle identifiers),
 *  - expiry (jsonwebtoken validates `exp`/`iat`),
 *  - nonce (Apple stores the SHA-256 hash of the raw nonce in the token's
 *    `nonce` claim, so we compare against that hash).
 *
 * Apple's signing keys are fetched from Apple's JWKS endpoint and cached for a
 * short cooldown; a token whose `kid` is unknown forces a refresh, so Apple's
 * key rotation is handled.
 *
 * The verified `sub` claim is the only identity used downstream. The `user`
 * object returned by the client's native SDK is never trusted.
 */
@Injectable()
export class AppleProvider {
  private readonly allowedAudiences: string[];
  private readonly jwksUrl: string;
  private readonly cooldownMs: number;
  private readonly tokenUrl: string;
  private readonly revokeUrl: string;
  private readonly teamId: string | null;
  private readonly servicesKeyId: string | null;
  private readonly servicesPrivateKey: string | null;
  private readonly precomputedClientSecret: string | null;

  private cachedKeys: Map<string, KeyObject> | null = null;
  private lastFetch = 0;
  private fetchInFlight: Promise<Map<string, KeyObject>> | null = null;

  constructor() {
    const {
      appleClientIds,
      appleJwksUrl,
      appleJwksCooldownMs,
      appleTokenUrl,
      appleRevokeUrl,
      appleTeamId,
      appleServicesKeyId,
      appleServicesPrivateKey,
      appleClientSecret,
    } = loadOAuthConfig();
    if (appleClientIds.length === 0) {
      throw new Error('env.APPLE_CLIENT_IDS must be set');
    }
    this.allowedAudiences = appleClientIds;
    this.jwksUrl = appleJwksUrl;
    this.cooldownMs = appleJwksCooldownMs;
    this.tokenUrl = appleTokenUrl;
    this.revokeUrl = appleRevokeUrl;
    this.teamId = appleTeamId;
    this.servicesKeyId = appleServicesKeyId;
    this.servicesPrivateKey = appleServicesPrivateKey;
    this.precomputedClientSecret = appleClientSecret;
  }

  async verifyIdentityToken(
    idToken: string,
    rawNonce?: string,
  ): Promise<AppleVerifiedIdentity> {
    // Sign in with Apple always uses a nonce in this application. Fail closed
    // rather than skip nonce validation if one was not supplied.
    if (!rawNonce) {
      console.error('Error: No raw nonce');
      throw new OAuthCredentialError();
    }

    let payload: jwt.JwtPayload;
    try {
      const key = await this.getKeyForToken(idToken);
      payload = jwt.verify(idToken, key, {
        algorithms: [APPLE_TOKEN_ALGORITHM],
        issuer: APPLE_ISSUER,
        audience: this.allowedAudiences as [string, ...string[]],
        nonce: sha256(rawNonce),
      }) as jwt.JwtPayload;
    } catch {
      // Never log or surface the raw error: it can include token contents.
      console.error('Error: While verifying apple identify token');
      throw new OAuthCredentialError();
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      console.error('Error: Apple token is missing sub');
      throw new OAuthCredentialError();
    }

    const email = typeof payload.email === 'string' ? payload.email : null;

    return {
      provider: 'apple',
      subject: payload.sub,
      email,
      // The verified audience is the client ID (bundle identifier) the token
      // was issued to; needed for the authorization-code exchange.
      clientId: payload.aud as string,
    };
  }

  /**
   * Exchanges an authorization code for a Sign in with Apple refresh token.
   *
   * The refresh token is stored server-side and used to revoke the user's
   * authorization on account deletion. It is never returned to the client.
   * The raw code and token are never logged; failures surface as a generic
   * error that leaks nothing about the request payload.
   */
  async exchangeAuthorizationCode(
    code: string,
    clientId: string,
  ): Promise<string> {
    const clientSecret = this.generateClientSecret(clientId);
    if (!clientSecret) {
      console.error(
        'Error: Apple client secret not configured, skipping code exchange',
      );
      throw new OAuthCredentialError();
    }

    let response: Response;
    try {
      response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
        }),
      });
    } catch {
      console.error('Error: Apple token exchange network failure');
      throw new OAuthCredentialError();
    }

    if (!response.ok) {
      // The response body can echo the code or tokens; never log or surface it.
      console.error(
        `Error: Apple token exchange failed with HTTP ${response.status}`,
      );
      throw new OAuthCredentialError();
    }

    let data: { refresh_token?: string } | null = null;
    try {
      data = (await response.json()) as { refresh_token?: string };
    } catch {
      console.error('Error: Apple token exchange returned invalid JSON');
      throw new OAuthCredentialError();
    }

    if (!data?.refresh_token) {
      console.error('Error: Apple token exchange returned no refresh token');
      throw new OAuthCredentialError();
    }

    return data.refresh_token;
  }

  /**
   * Revokes a user's Sign in with Apple authorization via Apple's revoke
   * endpoint. Apple returns 200 both when the token is invalidated and when it
   * was already invalidated, so either is treated as success.
   */
  async revokeRefreshToken(
    refreshToken: string,
    clientId: string,
  ): Promise<void> {
    const clientSecret = this.generateClientSecret(clientId);
    if (!clientSecret) {
      console.error(
        'Error: Apple client secret not configured, cannot revoke authorization',
      );
      throw new ProviderRevocationFailedError();
    }

    let response: Response;
    try {
      response = await fetch(this.revokeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: refreshToken,
          token_type_hint: 'refresh_token',
        }),
      });
    } catch {
      console.error('Error: Apple revoke network failure');
      throw new ProviderRevocationFailedError();
    }

    if (!response.ok) {
      // The response body may echo the token; never log or surface it.
      console.error(`Error: Apple revoke failed with HTTP ${response.status}`);
      throw new ProviderRevocationFailedError();
    }
  }

  /**
   * Builds the client secret (an ES256 JWT) required by Apple's token and
   * revoke endpoints. A precomputed APPLE_CLIENT_SECRET is used when provided;
   * otherwise one is signed with the Services ID key material. Returns null
   * when neither is configured.
   */
  generateClientSecret(clientId: string): string | null {
    if (this.precomputedClientSecret) {
      return this.precomputedClientSecret;
    }
    if (!this.teamId || !this.servicesKeyId || !this.servicesPrivateKey) {
      console.error(
        'Error: Apple client secret not configured (APPLE_TEAM_ID / APPLE_SERVICES_KEY_ID / APPLE_SERVICES_PRIVATE_KEY)',
      );
      return null;
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: this.teamId,
        iat: nowSecs,
        exp: nowSecs + APPLE_CLIENT_SECRET_TTL_SECS,
        aud: APPLE_ISSUER,
        sub: clientId,
      },
      this.servicesPrivateKey,
      { algorithm: APPLE_CLIENT_SECRET_ALGORITHM, keyid: this.servicesKeyId },
    );
  }

  private async getKeyForToken(idToken: string): Promise<KeyObject> {
    const decoded = jwt.decode(idToken, { complete: true }) as {
      header: { kid?: string };
    } | null;
    const kid = decoded?.header?.kid;
    if (!kid) {
      throw new Error('No kid in token header');
    }

    const keys = await this.getKeys();
    const key = keys.get(kid);
    if (key) {
      return key;
    }

    // Unknown kid: Apple may have rotated keys. Refresh and retry once.
    this.cachedKeys = null;
    const refreshed = await this.getKeys();
    const refetched = refreshed.get(kid);
    if (!refetched) {
      throw new Error('No matching Apple signing key');
    }
    return refetched;
  }

  private async getKeys(): Promise<Map<string, KeyObject>> {
    if (this.cachedKeys && Date.now() - this.lastFetch < this.cooldownMs) {
      return this.cachedKeys;
    }
    if (this.fetchInFlight) {
      return this.fetchInFlight;
    }
    this.fetchInFlight = this.fetchAndBuildKeys().finally(() => {
      this.fetchInFlight = null;
    });
    return this.fetchInFlight;
  }

  private async fetchAndBuildKeys(): Promise<Map<string, KeyObject>> {
    const response = await fetch(this.jwksUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Apple JWKS: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { keys: AppleJwk[] };

    const keys = new Map<string, KeyObject>();
    for (const jwk of data.keys) {
      if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
        continue;
      }
      keys.set(
        jwk.kid,
        createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' }),
      );
    }

    this.cachedKeys = keys;
    this.lastFetch = Date.now();
    return keys;
  }
}
