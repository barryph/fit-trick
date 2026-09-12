import type { Request } from 'express';

/**
 * Whether a request's session is bound to a signed-in user.
 *
 * Passport writes the serialized user id to `session.passport.user` when a
 * session is established, so that one field is the marker of an authenticated
 * session. `session.passport` alone is not enough (Passport deletes the `user`
 * key when the account can no longer be deserialized), and neither is the mere
 * existence of a session: `express-session` also hands every request a
 * throw-away session id it never stores or issues.
 *
 * Shared so the lifecycle guard (`is this session authenticated?`) and the
 * sign-in flow (`is there a real session to revoke before regenerating?`) apply
 * the same rule.
 */
export function isAuthenticatedSession(
  session: Request['session'] | undefined,
): boolean {
  const userId = session?.passport?.user;
  return typeof userId === 'string' || typeof userId === 'number';
}
