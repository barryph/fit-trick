import ServerError from 'src/shared/ServerError';

/**
 * Raised when the account to delete no longer exists. Deleting is idempotent
 * from the caller's perspective: a missing account means the goal state
 * (account gone) is already reached.
 */
export class AccountNotFoundError extends ServerError {
  constructor() {
    super('ACCOUNT_NOT_FOUND', 'Account not found', 404);
  }
}

/**
 * Raised when an emailed deletion token cannot be redeemed: it is missing,
 * expired, already used, or was never issued.
 *
 * The same error covers every one of those cases on purpose. Returning a
 * distinct "expired" or "already used" code would let the public endpoint be
 * probed for whether a given token was ever real.
 */
export class InvalidDeletionTokenError extends ServerError {
  constructor() {
    super(
      'INVALID_DELETION_TOKEN',
      'This deletion link is invalid or has expired.',
      400,
    );
  }
}
