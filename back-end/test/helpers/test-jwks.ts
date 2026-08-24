import { createServer, type Server } from 'node:http';
import { createHash, generateKeyPairSync, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface TestSigningKey {
  kid: string;
  privateKey: KeyObject;
  publicPem: string;
  publicJwk: Record<string, unknown>;
}

export function createTestSigningKey(kid: string): TestSigningKey {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  return {
    kid,
    privateKey,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    publicJwk: publicKey.export({ format: 'jwk' }),
  };
}

export interface SignTokenOptions {
  key: TestSigningKey;
  algorithm?: string;
  iss: string;
  aud: string | string[];
  sub?: string;
  email?: string;
  /** Value placed verbatim in the token's `nonce` claim (Apple expects the SHA-256 of the raw nonce). */
  nonce?: string;
  iat?: number;
  exp?: number;
  nowSeconds?: number;
  extraClaims?: Record<string, unknown>;
}

export function signToken(options: SignTokenOptions): string {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  const payload: Record<string, unknown> = {
    iss: options.iss,
    aud: options.aud,
    iat: options.iat ?? now,
    exp: options.exp ?? now + 3600,
    ...(options.email !== undefined ? { email: options.email } : {}),
    ...(options.nonce !== undefined ? { nonce: options.nonce } : {}),
    ...(options.extraClaims ?? {}),
  };
  if (options.sub !== undefined) {
    payload.sub = options.sub;
  }

  return jwt.sign(payload, options.key.privateKey, {
    algorithm: (options.algorithm ?? 'RS256') as jwt.Algorithm,
    header: { alg: options.algorithm ?? 'RS256', kid: options.key.kid },
  });
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Builds an unsigned JWT (alg: none) from the given claims. */
export function buildUnsignedToken(claims: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'none', kid: 'any' })}.${encode(claims)}.`;
}

export interface JwksServer {
  url: string;
  close: () => Promise<void>;
  setKeys: (keys: TestSigningKey[]) => void;
}

export interface GoogleCertsServer {
  url: string;
  close: () => Promise<void>;
  setKeys: (keys: TestSigningKey[]) => void;
}

/**
 * Serves a JWKS JSON document over HTTP so providers that fetch remote keys
 * can be exercised with locally generated keys.
 */
export async function startJwksServer(
  keys: TestSigningKey[],
): Promise<JwksServer> {
  let currentKeys = keys;

  const server: Server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        keys: currentKeys.map((key) => ({
          ...key.publicJwk,
          kid: key.kid,
          alg: 'RS256',
          use: 'sig',
        })),
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine JWKS server address');
  }

  return {
    url: `http://127.0.0.1:${address.port}/auth/keys`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    setKeys: (nextKeys) => {
      currentKeys = nextKeys;
    },
  };
}

/**
 * Serves Google's signing-certificates document (`{ [kid]: "<PEM cert>" }`).
 */
export async function startGoogleCertsServer(
  keys: TestSigningKey[],
): Promise<GoogleCertsServer> {
  let currentKeys = keys;

  const server: Server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const certs = Object.fromEntries(
      currentKeys.map((key) => [key.kid, key.publicPem]),
    );
    res.end(JSON.stringify(certs));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine certs server address');
  }

  return {
    url: `http://127.0.0.1:${address.port}/v1/certs`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    setKeys: (nextKeys) => {
      currentKeys = nextKeys;
    },
  };
}

export interface AppleApiServer {
  url: string;
  close: () => Promise<void>;
  requests: Array<{ path: string; body: URLSearchParams }>;
  respondWith: (status: number, body?: unknown) => void;
}

/**
 * A configurable local stand-in for Apple's token/revoke endpoints so the
 * authorization-code exchange and revocation flows can be exercised against
 * real HTTP without touching Apple.
 */
export async function startAppleApiServer(): Promise<AppleApiServer> {
  let nextStatus = 200;
  let nextBody: unknown = {};
  const requests: Array<{ path: string; body: URLSearchParams }> = [];

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      requests.push({ path: req.url ?? '', body: new URLSearchParams(raw) });
      res.statusCode = nextStatus;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(nextBody));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine Apple API server address');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    requests,
    respondWith: (status, body = {}) => {
      nextStatus = status;
      nextBody = body;
    },
  };
}
