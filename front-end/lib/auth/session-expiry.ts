type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();

/**
 * Signals that the API ended the current session mid-use: the session expired
 * (idle or absolute lifetime), or it was revoked — signed out on another
 * device, or invalidated by a password reset. A bare 401 that the server did
 * not label with an error code (no usable session presented at all) is treated
 * the same way, so a client that believes it is signed in is corrected.
 *
 * The credential is already dead server-side, so every further request from
 * this device will fail until the user signs in again. `AuthProvider`
 * subscribes and drops the local session state so the user lands back on the
 * sign-in screen instead of seeing repeated generic errors.
 *
 * Safe to call more than once: several in-flight requests failing together
 * simply notify again, and listeners are expected to be idempotent.
 */
export function notifySessionExpired(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/** Subscribes to session-end notifications. Returns an unsubscribe function. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
