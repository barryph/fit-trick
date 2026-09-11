import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from './session-cookie';
import {
  DEFAULT_SESSION_IDLE_TTL_MS,
  DEFAULT_SESSION_ABSOLUTE_TTL_MS,
  SESSION_POLICY,
  evaluateSession,
  type SessionPolicy,
  type SessionEndedReason,
} from './session-policy';
import SessionRevocationRepo from '../repos/session-revocation.repository';
import { SessionRevocationError } from '../authentication.errors';

/**
 * Enforces the session lifecycle on every authenticated request:
 *
 *  - **Rolling renewal.** Once the current idle window is more than halfway
 *    through, the window is re-granted: the session record is re-saved (which
 *    also re-issues the cookie, same session id, with a fresh `Max-Age`).
 *    Before halfway nothing is written and no `Set-Cookie` is sent, so an
 *    active mobile client is not charged a cookie/`UPDATE` for every request.
 *
 *  - **Absolute cap.** A session older than the absolute window is revoked
 *    even while it is active. This is what stops "renew forever" from meaning
 *    "a stolen session id never dies".
 *
 *  - **Idle cap.** A session whose granted window has passed is revoked, and a
 *    request that presents a session the server can no longer resolve is
 *    flagged, so protected routes can answer `SESSION_EXPIRED`.
 *
 * Revocation deliberately uses the store (the row is deleted) and does *not*
 * rely on the response being delivered: a client that never receives the reply
 * must still lose the credential. Because an in-flight request can write the
 * deleted row back, revocation also records a tombstone
 * (`SessionRevocationRepo`) and any session id found there is refused, so the
 * revocation cannot be undone. The in-memory session object is left in place,
 * both because Passport's session support requires `req.session` to exist and
 * because leaving it untouched means express-session will not write the
 * deleted row back on the way out.
 *
 * Runs as a global guard, so it also covers requests to public endpoints made
 * with an expired cookie (a sign-in attempt, for instance). It does not fail a
 * request for being unauthenticated — only the guards on protected routes turn
 * that state into a 401 — but it does fail closed when it cannot revoke a
 * session it has decided must end.
 */
@Injectable()
export class SessionLifecycleGuard implements CanActivate {
  private readonly logger = new Logger(SessionLifecycleGuard.name);
  private readonly policy: SessionPolicy;

  constructor(
    @Optional()
    @Inject(SESSION_POLICY)
    policy: SessionPolicy | undefined,
    @Inject(SessionRevocationRepo)
    private readonly revocations: SessionRevocationRepo,
  ) {
    this.policy = policy ?? {
      idleTtlMs: DEFAULT_SESSION_IDLE_TTL_MS,
      absoluteTtlMs: DEFAULT_SESSION_ABSOLUTE_TTL_MS,
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = request.session;

    // No session middleware on this route: nothing to renew or revoke.
    if (!session) {
      return true;
    }

    if (!isAuthenticatedSession(session)) {
      // The client presented a session cookie, but the server has no usable
      // session for it: it expired while idle, was signed out elsewhere, or
      // was revoked by a password reset or account deletion.
      if (presentsSessionCookie(request)) {
        request.sessionEnded = 'not-found';
      }
      return true;
    }

    // A revoked session must stay revoked. Deleting the stored row is not
    // enough on its own: a request that loaded the record before the
    // revocation writes it back when it finishes (the store's `set` is an
    // upsert), which would resurrect the session. The tombstone is what makes
    // the revocation survive that, so it is checked before anything else.
    let revoked: boolean;
    try {
      revoked = await this.revocations.isRevoked(request.sessionID);
    } catch (err) {
      // The tombstone cannot be read, so whether this session is revoked is
      // unknown: fail closed rather than risk serving a revoked session.
      this.logger.error(
        `Failed to check session revocation for ${request.sessionID}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new SessionRevocationError();
    }

    if (revoked) {
      await this.revoke(request, 'not-found');
      return true;
    }

    const decision = evaluateSession({
      anchor: session.auth,
      windowExpiresAt: windowExpiresAt(session),
      now: Date.now(),
      policy: this.policy,
    });

    if (decision.kind === 'renew') {
      session.auth = decision.anchor;
      // Refresh the window the cookie (and the stored row) is granted.
      session.cookie.maxAge = this.policy.idleTtlMs;
      this.logger.debug(
        `Renewed session ${request.sessionID} (${decision.reason})`,
      );
      return true;
    }

    if (decision.kind === 'revoke') {
      await this.revoke(request, decision.reason);
    }

    return true;
  }

  /**
   * Revokes a session durably: records a tombstone so the id stays rejected
   * even if the row is written back, then deletes the row and stops this
   * request from being treated as authenticated. The current request is not
   * failed: it continues unauthenticated, exactly as if no session had been
   * presented.
   *
   * A failure here is *not* swallowed: the session must not survive a decision
   * to revoke it, so the request fails closed with `SESSION_REVOCATION_FAILED`
   * instead of continuing while the credential stays alive.
   */
  private async revoke(
    request: Request,
    reason: SessionEndedReason,
  ): Promise<void> {
    const sid = request.sessionID;
    request.user = undefined;
    request.sessionEnded = reason;

    try {
      // Tombstone first. If the row delete then fails, the session is still
      // rejected on the next request rather than silently living on.
      await this.revocations.revoke(sid);
      await this.destroyStoredSession(request, sid);
    } catch (err) {
      this.logger.error(
        `Failed to revoke session ${sid} (${reason}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new SessionRevocationError();
    }

    this.logger.log(`Revoked session ${sid} (${reason})`);
  }

  /**
   * Deletes the stored session row, surfacing both failure styles the store
   * can use: `connect-session-knex` calls the callback with the error *and*
   * rejects the returned promise, so an unhandled rejection would otherwise
   * escape the request.
   */
  private destroyStoredSession(request: Request, sid: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      try {
        const result: unknown = request.sessionStore.destroy(
          sid,
          (err?: unknown) => (err ? fail(err) : succeed()),
        );
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(succeed, fail);
        }
      } catch (err) {
        fail(err);
      }
    });
  }
}

/** `req.session`, including the application's session data. */
type AppSession = Request['session'];

function isAuthenticatedSession(session: AppSession): boolean {
  const userId = session.passport?.user;
  return typeof userId === 'string' || typeof userId === 'number';
}

/**
 * The idle window recorded when the session was last written. express-session
 * refreshes this in memory at the end of a request, so at guard time it is
 * still the value persisted at sign-in or at the last renewal — which is what
 * makes it usable as "when does the granted window run out".
 */
function windowExpiresAt(session: AppSession): number | null {
  const expires: unknown = session.cookie?.expires;
  if (expires instanceof Date) {
    return expires.getTime();
  }
  if (typeof expires === 'string') {
    const parsed = Date.parse(expires);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Whether the request carried a session cookie at all. Mobile clients keep
 * cookies in a native jar and resend them automatically, so presence (not the
 * value) is all that is needed to tell "signed out" apart from "never signed
 * in".
 */
function presentsSessionCookie(request: Request): boolean {
  const header = request.headers.cookie;
  if (typeof header !== 'string' || header.length === 0) {
    return false;
  }
  return header
    .split(';')
    .some((part) => part.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}
