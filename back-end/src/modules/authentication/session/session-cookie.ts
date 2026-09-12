/**
 * Single source of truth for the session cookie. The name and attributes must
 * match everywhere the cookie is issued or cleared (session middleware,
 * logout, account deletion), otherwise a stale credential can survive a
 * sign-out.
 */

/** express-session's default cookie name, kept explicit. */
export const SESSION_COOKIE_NAME = 'connect.sid';

export function isSecureCookieEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Attributes shared by the session cookie and by `res.clearCookie`.
 *
 * `SameSite=Strict` and `Secure` are set for the benefit of browser clients;
 * the mobile app talks to the API outside any browser security context, so
 * neither is load-bearing for it. For a browser client `SameSite=Strict` is the
 * only CSRF control in place — there is no token and no `Origin` check, and the
 * CORS allow-list is not a CSRF defence (it only prevents reading a response).
 * See `docs/session-management.md`.
 */
export function sessionCookieAttributes(
  secure: boolean = isSecureCookieEnvironment(),
): {
  path: string;
  httpOnly: boolean;
  sameSite: 'strict';
  secure: boolean;
} {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure,
  };
}
