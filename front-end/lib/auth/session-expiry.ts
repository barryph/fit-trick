/**
 * One-slot registry connecting the API layer to the auth layer.
 *
 * The API client is the only place that sees an HTTP 401, but only the auth
 * provider can clear a session. Registering a callback here avoids a circular
 * import between them and keeps the client unaware of React.
 *
 * The handler is only invoked for a 401 that the server did not label with a
 * known error code, i.e. an expired/absent session rather than a rejected
 * credential (a failed sign-in carries `INVALID_CREDENTIALS`).
 */
type SessionExpiredListener = () => void;

let listener: SessionExpiredListener | null = null;

/** Registers (or, with `null`, clears) the session-expiry handler. */
export function setSessionExpiredHandler(
  next: SessionExpiredListener | null,
): void {
  listener = next;
}

/** Called by the API client whenever a session-ending 401 is received. */
export function notifySessionExpired(): void {
  listener?.();
}
