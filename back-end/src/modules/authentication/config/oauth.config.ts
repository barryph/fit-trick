export interface OAuthConfig {
  googleServerClientIds: string[];
  googleCertsUrl: string;
  googleCertsCooldownMs: number;
  appleClientIds: string[];
  appleJwksUrl: string;
  appleJwksCooldownMs: number;
  appleTokenUrl: string;
  appleRevokeUrl: string;
  appleTeamId: string | null;
  appleServicesKeyId: string | null;
  appleServicesPrivateKey: string | null;
  appleClientSecret: string | null;
}

function splitCsv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function loadOAuthConfig(): OAuthConfig {
  return {
    googleServerClientIds: splitCsv(process.env.GOOGLE_SERVER_CLIENT_IDS),
    googleCertsUrl:
      process.env.GOOGLE_JWKS_URL ??
      'https://www.googleapis.com/oauth2/v1/certs',
    googleCertsCooldownMs: Number(
      process.env.GOOGLE_JWKS_COOLDOWN_MS ?? 30_000,
    ),
    appleClientIds: splitCsv(process.env.APPLE_CLIENT_IDS),
    appleJwksUrl:
      process.env.APPLE_JWKS_URL ?? 'https://appleid.apple.com/auth/keys',
    // How long signing keys are cached before refresh. Kept configurable so
    // tests can disable the cooldown and exercise key rotation deterministically.
    appleJwksCooldownMs: Number(process.env.APPLE_JWKS_COOLDOWN_MS ?? 30_000),
    // Overridable so tests can point at a local mock server.
    appleTokenUrl:
      process.env.APPLE_TOKEN_URL ?? 'https://appleid.apple.com/auth/token',
    appleRevokeUrl:
      process.env.APPLE_REVOKE_URL ?? 'https://appleid.apple.com/auth/revoke',
    // Sign in with Apple client-secret material. Either provide a precomputed
    // APPLE_CLIENT_SECRET or the key material to generate one (an ES256 JWT):
    // team ID, Services ID key ID, and the Services ID private key (PEM).
    appleTeamId: process.env.APPLE_TEAM_ID ?? null,
    appleServicesKeyId: process.env.APPLE_SERVICES_KEY_ID ?? null,
    appleServicesPrivateKey: process.env.APPLE_SERVICES_PRIVATE_KEY ?? null,
    appleClientSecret: process.env.APPLE_CLIENT_SECRET ?? null,
  };
}
