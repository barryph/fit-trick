import ServerError from 'src/shared/ServerError';

export class InvalidCredentialsError extends ServerError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid Credentials', 401);
  }
}

/**
 * Raised on a protected route when the request carried a session the server no
 * longer accepts: idle or absolute expiry, sign-out, or revocation by a
 * password reset. Distinct from a plain 401 so clients can tell "you were
 * signed in and no longer are" (clear local state, tell the user why) apart
 * from "you never authenticated".
 */
export class SessionExpiredError extends ServerError {
  constructor() {
    super(
      'SESSION_EXPIRED',
      'Your session has ended. Please sign in again.',
      401,
    );
  }
}

/**
 * Raised when the server cannot durably revoke a session it has decided must
 * end (idle/absolute expiry, sign-out, or the session replaced at sign-in).
 *
 * Continuing would mean honouring a credential the server has already judged
 * to be over, so the request fails closed instead of silently serving the
 * request and leaving the session alive. `503` because the failure is
 * transient infrastructure, not the client's fault.
 */
export class SessionRevocationError extends ServerError {
  constructor() {
    super(
      'SESSION_REVOCATION_FAILED',
      'Your session could not be ended. Please try again.',
      503,
    );
  }
}

export class InvalidResetTokenError extends ServerError {
  constructor() {
    super('INVALID_RESET_TOKEN', 'Reset token is invalid or expired', 400);
  }
}

/**
 * Raised when a provider-issued credential fails verification or cannot be
 * resolved to an account. The message is intentionally generic so the endpoint
 * cannot be used to enumerate accounts or leak token-validation internals.
 */
export class OAuthCredentialError extends ServerError {
  constructor() {
    super('OAUTH_AUTH_FAILED', 'Authentication failed', 401);
  }
}

/**
 * Raised when the provider disconnection required before deletion fails. The
 * message is intentionally generic and never includes tokens or credentials.
 * The account is left untouched so the deletion can be retried.
 */
export class ProviderRevocationFailedError extends ServerError {
  constructor() {
    super(
      'PROVIDER_REVOCATION_FAILED',
      'Could not disconnect the account from its provider. No data was deleted. Please try again.',
      502,
    );
  }
}
