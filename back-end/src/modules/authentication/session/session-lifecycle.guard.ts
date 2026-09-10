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
  type SessionRevocationReason,
} from './session-policy';

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
 * must still lose the credential. The in-memory session object is left in
 * place, both because Passport's session support requires `req.session` to
 * exist and because leaving it untouched means express-session will not write
 * the deleted row back on the way out.
 *
 * Runs as a global guard, so it also covers requests to public endpoints made
 * with an expired cookie (a sign-in attempt, for instance). It never rejects a
 * request itself: only the guards on protected routes turn this state into a
 * 401.
 */
@Injectable()
export class SessionLifecycleGuard implements CanActivate {
  private readonly logger = new Logger(SessionLifecycleGuard.name);
  private readonly policy: SessionPolicy;

  constructor(
    @Optional()
    @Inject(SESSION_POLICY)
    policy?: SessionPolicy,
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
   * Deletes the session record and stops this request from being treated as
   * authenticated. The current request is not failed: it continues
   * unauthenticated, exactly as if no session had been presented.
   */
  private async revoke(
    request: Request,
    reason: SessionRevocationReason,
  ): Promise<void> {
    const sid = request.sessionID;
    request.user = undefined;
    request.sessionEnded = reason;

    await new Promise<void>((resolve) => {
      request.sessionStore.destroy(sid, () => resolve());
    });

    this.logger.log(`Revoked session ${sid} (${reason})`);
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
