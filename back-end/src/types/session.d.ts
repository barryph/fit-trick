import type { SessionAnchor } from '../modules/authentication/session/session-policy';

declare module 'express-session' {
  interface SessionData {
    /**
     * Rolling-renewal bookkeeping (absolute anchor + idle window), written at
     * sign-in and refreshed on renewal.
     */
    auth?: SessionAnchor;

    /**
     * Written by Passport when a session is established: the serialized user
     * id resolved by `deserializeUser`.
     */
    passport?: { user?: string | number };
  }
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by `SessionLifecycleGuard` when the request presented a session
       * that no longer exists or has just been revoked, so guards on protected
       * routes can answer `SESSION_EXPIRED` instead of a bare 401.
       */
      sessionEnded?: import('../modules/authentication/session/session-policy').SessionEndedReason;
    }
  }
}
