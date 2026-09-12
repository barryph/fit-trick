import { createHash, randomBytes } from 'node:crypto';
import { DELETION_TOKEN_BYTES } from './deletion.constants';

/**
 * Tokens are stored hashed, never in plaintext: a leaked database snapshot must
 * not hand an attacker a working account-deletion link. The plaintext token
 * exists only in the email and in the redeeming request.
 *
 * SHA-256 (not bcrypt) is appropriate because the input is 256 bits of uniform
 * randomness — there is nothing to brute-force, so a slow hash buys nothing.
 */
export function hashDeletionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateDeletionToken(): {
  token: string;
  hashedToken: string;
} {
  const token = randomBytes(DELETION_TOKEN_BYTES).toString('hex');
  return {
    token,
    hashedToken: hashDeletionToken(token),
  };
}
