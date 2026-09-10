import { Logger } from '@nestjs/common';

const ONE_SECOND_IN_MS = 1000;
const ONE_HOUR_IN_MS = 60 * 60 * ONE_SECOND_IN_MS;
const ONE_DAY_IN_MS = 24 * ONE_HOUR_IN_MS;

/**
 * Idle window: how long a signed-in session may go unused before it is
 * revoked. Deliberately equal to the lifetime the API had before rolling
 * renewal existed, so an inactive client's experience is unchanged.
 */
export const DEFAULT_SESSION_IDLE_TTL_MS = 14 * ONE_DAY_IN_MS;

/**
 * Absolute window: the longest a session may live from sign-in, however
 * active the client is. This is the bound that makes rolling renewal safe —
 * without it, a stolen session id could be kept alive forever simply by using
 * it, and "renew on activity" would mean "never expire".
 */
export const DEFAULT_SESSION_ABSOLUTE_TTL_MS = 60 * ONE_DAY_IN_MS;

/**
 * Injection token for the resolved policy, so the session middleware (cookie
 * window) and the lifecycle guard (renewal/revocation) cannot drift apart.
 */
export const SESSION_POLICY = Symbol('SESSION_POLICY');

export interface SessionPolicy {
  /** Maximum time a session may go unused. */
  idleTtlMs: number;
  /** Maximum total lifetime measured from sign-in. */
  absoluteTtlMs: number;
}

/**
 * Server-side session bookkeeping, stored inside the session record. Only
 * server clocks are ever used: a mobile device's clock is not trustworthy and
 * must never influence when a session expires.
 */
export interface SessionAnchor {
  /** Epoch ms of sign-in. Anchors the absolute window. */
  createdAt: number;
  /** Epoch ms the idle window was last granted. Drives halfway renewal. */
  renewedAt: number;
}

export type SessionRenewalReason = 'missing-anchor' | 'halfway';
export type SessionRevocationReason = 'absolute-expired' | 'idle-expired';

/**
 * Why a request's session is no longer usable. `not-found` covers sessions the
 * server can no longer resolve at all: idle-expired rows, sign-out elsewhere,
 * or revocation by a password reset / account deletion.
 */
export type SessionEndedReason = SessionRevocationReason | 'not-found';

export type SessionDecision =
  | { kind: 'continue'; anchor: SessionAnchor }
  | { kind: 'renew'; anchor: SessionAnchor; reason: SessionRenewalReason }
  | { kind: 'revoke'; reason: SessionRevocationReason };

/** Anchor written when a session is created at sign-in. */
export function createSessionAnchor(now: number = Date.now()): SessionAnchor {
  return { createdAt: now, renewedAt: now };
}

/** True when a stored anchor is present and usable. */
export function isSessionAnchor(value: unknown): value is SessionAnchor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { createdAt, renewedAt } = value as Partial<SessionAnchor>;
  return isUsableTimestamp(createdAt) && isUsableTimestamp(renewedAt);
}

function isUsableTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Decides what should happen to an authenticated session on an incoming
 * request.
 *
 * `windowExpiresAt` is the session's stored cookie window (epoch ms), i.e. the
 * point the idle window granted at the last renewal runs out. It is read from
 * the session record rather than from the client, so a client that simply
 * keeps a cookie value around cannot extend anything.
 */
export function evaluateSession(input: {
  anchor: unknown;
  windowExpiresAt: number | null;
  now: number;
  policy: SessionPolicy;
}): SessionDecision {
  const { anchor, windowExpiresAt, now, policy } = input;

  // Sessions that predate rolling renewal carry no anchor. Give them a fresh
  // window rather than signing every existing user out on deploy; the absolute
  // cap then starts from the moment they were first seen.
  if (!isSessionAnchor(anchor)) {
    return {
      kind: 'renew',
      anchor: createSessionAnchor(now),
      reason: 'missing-anchor',
    };
  }

  // The absolute cap wins over everything else: an active session is still
  // revoked once it is older than the cap.
  if (now - anchor.createdAt >= policy.absoluteTtlMs) {
    return { kind: 'revoke', reason: 'absolute-expired' };
  }

  // The idle window granted at the last renewal has passed. The store also
  // expires rows, but enforcing it here keeps the bound independent of the
  // store's touch behaviour.
  if (windowExpiresAt !== null && windowExpiresAt <= now) {
    return { kind: 'revoke', reason: 'idle-expired' };
  }

  // Clock skew (a renewal recorded in the future) must not revoke a live
  // session or cause a renewal loop.
  if (anchor.renewedAt > now) {
    return { kind: 'continue', anchor };
  }

  // Renew only once the current window is more than halfway through, so a
  // mobile client is not sent a fresh cookie (and the row not rewritten) on
  // every request.
  if (now - anchor.renewedAt >= policy.idleTtlMs / 2) {
    return {
      kind: 'renew',
      anchor: { createdAt: anchor.createdAt, renewedAt: now },
      reason: 'halfway',
    };
  }

  return { kind: 'continue', anchor };
}

/**
 * Reads the policy from the environment, falling back to the defaults for
 * anything missing, non-numeric, or nonsensical. A misconfigured window must
 * not take authentication down: a bad value is logged and ignored.
 */
export function resolveSessionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): SessionPolicy {
  const logger = new Logger('SessionPolicy');

  const idleTtlMs = readTtlMs(
    env.SESSION_IDLE_TTL_MS,
    DEFAULT_SESSION_IDLE_TTL_MS,
    'SESSION_IDLE_TTL_MS',
    logger,
  );
  let absoluteTtlMs = readTtlMs(
    env.SESSION_ABSOLUTE_TTL_MS,
    DEFAULT_SESSION_ABSOLUTE_TTL_MS,
    'SESSION_ABSOLUTE_TTL_MS',
    logger,
  );

  if (absoluteTtlMs < idleTtlMs) {
    logger.warn(
      `SESSION_ABSOLUTE_TTL_MS (${absoluteTtlMs}ms) is shorter than ` +
        `SESSION_IDLE_TTL_MS (${idleTtlMs}ms); using ${idleTtlMs}ms so the ` +
        'absolute cap can never be tighter than the idle window',
    );
    absoluteTtlMs = idleTtlMs;
  }

  return { idleTtlMs, absoluteTtlMs };
}

function readTtlMs(
  raw: string | undefined,
  fallback: number,
  name: string,
  logger: Logger,
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < ONE_SECOND_IN_MS) {
    logger.warn(
      `${name} must be a number of milliseconds >= ${ONE_SECOND_IN_MS}; ` +
        `ignoring "${raw}" and using ${fallback}ms`,
    );
    return fallback;
  }

  return parsed;
}
