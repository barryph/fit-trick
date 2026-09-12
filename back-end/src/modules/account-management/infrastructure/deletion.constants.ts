// How long an emailed deletion link stays usable. Short enough that a link
// forwarded or recovered from an old mailbox is close to worthless, long enough
// that someone can open their email on another device and finish the flow.
export const DELETION_TOKEN_EXPIRY_MINUTES = 30;
export const DELETION_TOKEN_EXPIRY_MS =
  DELETION_TOKEN_EXPIRY_MINUTES * 60 * 1000;

// 32 bytes produces a 64-character hex token (256 bits of entropy). Deletion is
// irreversible, so this is deliberately stronger than the password-reset token.
export const DELETION_TOKEN_BYTES = 32;

// Rate limits for the public request endpoint. The per-address limit stops one
// client spamming a single mailbox; the per-client limit stops one client
// sweeping many addresses. See `deletion-throttler.guard.ts`.
export const DELETION_REQUEST_ADDRESS_LIMIT = 3;
export const DELETION_REQUEST_ADDRESS_TTL_MS = 15 * 60 * 1000;
export const DELETION_REQUEST_CLIENT_LIMIT = 5;
export const DELETION_REQUEST_CLIENT_TTL_MS = 60 * 1000;

// A modest per-client cap on token redemption. Tokens are 256-bit random
// values, so guessing is already infeasible; this is hygiene, not the control.
export const DELETION_CONFIRM_LIMIT = 10;
export const DELETION_CONFIRM_TTL_MS = 60 * 1000;

/**
 * Name of the address-scoped throttler registered in `ThrottlerModule`. It is
 * deliberately a named throttler alongside the default per-client one, so the
 * request endpoint is limited both per address and per client.
 */
export const DELETION_ADDRESS_THROTTLER = 'accountDeletionAddress';
