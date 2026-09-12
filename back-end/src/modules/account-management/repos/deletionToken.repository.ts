import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from 'src/shared/knex/knex.service';

type DbConnection = Knex | Knex.Transaction;

interface IDeletionTokenRow {
  user_id: string;
  email: string;
  expires_at: Date | string;
}

export interface PendingDeletionToken {
  userId: string;
  email: string;
  /** SHA-256 hash of the emailed token; the plaintext is never stored. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Storage for emailed account-deletion tokens.
 *
 * Kept in its own table rather than a column on `users` (the shape the
 * password-reset token uses) for three reasons:
 *
 *  - Deletion tokens are a different credential class from session and
 *    password-reset tokens and must never be shareable with them.
 *  - A row-per-request model gives the token its own expiry index and keeps the
 *    `users` row untouched by an unauthenticated request.
 *  - `ON DELETE CASCADE` purges outstanding tokens for free when the account is
 *    deleted, so a completed deletion leaves nothing behind.
 *
 * Only the SHA-256 hash of a token is ever written. The plaintext exists solely
 * in the email and in the request that redeems it.
 */
@Injectable()
export default class DeletionTokenRepo {
  constructor(private readonly knexService: KnexService) {}

  /**
   * Issues a token for a user, replacing any request already pending for them.
   * Invalidating the previous link is deliberate: only the newest email works.
   *
   * The replace is one transaction so a failure cannot leave the user with the
   * old link removed and no new one — a state in which every link they hold is
   * dead. Runs on its own connection when none is supplied.
   */
  async replacePendingForUser(token: PendingDeletionToken): Promise<void> {
    await this.knexService.connection.transaction(async (trx) => {
      await trx.raw(
        `DELETE FROM account_deletion_tokens WHERE user_id = :userId`,
        { userId: token.userId },
      );
      await trx.raw(
        `
          INSERT INTO account_deletion_tokens (user_id, token_hash, email, expires_at)
          VALUES (:userId, :tokenHash, :email, :expiresAt)
        `,
        {
          userId: token.userId,
          tokenHash: token.tokenHash,
          email: token.email,
          expiresAt: token.expiresAt,
        },
      );
    });
  }

  /**
   * Atomically redeems an unexpired token: the row is returned *and deleted* in
   * a single statement, so two concurrent confirmations cannot both succeed.
   * Returns `null` when the token is unknown, expired, or already used — the
   * caller must not distinguish between those cases.
   */
  async consumeIfValid(
    hashedToken: string,
    now: Date = new Date(),
    db: DbConnection = this.knexService.connection,
  ): Promise<{ userId: string; email: string } | null> {
    const result = await db.raw<{ rows: IDeletionTokenRow[] }>(
      `
        DELETE FROM account_deletion_tokens
        WHERE token_hash = :hashedToken
          AND expires_at > :now
        RETURNING user_id, email, expires_at
      `,
      { hashedToken, now },
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return { userId: String(row.user_id), email: row.email };
  }

  /**
   * Compensation for the failure path: if the account could not be deleted
   * after the token was burned, the link is made usable again so the user does
   * not have to request a fresh email for a transient failure.
   */
  async restore(
    token: PendingDeletionToken & { tokenHash: string },
    db: DbConnection = this.knexService.connection,
  ): Promise<void> {
    await db.raw(
      `
        INSERT INTO account_deletion_tokens (user_id, token_hash, email, expires_at)
        VALUES (:userId, :tokenHash, :email, :expiresAt)
        ON CONFLICT (token_hash) DO NOTHING
      `,
      {
        userId: token.userId,
        tokenHash: token.tokenHash,
        email: token.email,
        expiresAt: token.expiresAt,
      },
    );
  }

  /** Removes every outstanding request for a user (used inside deletion). */
  async deleteAllForUser(
    userId: string,
    db: DbConnection = this.knexService.connection,
  ): Promise<void> {
    await db('account_deletion_tokens').where({ user_id: userId }).del();
  }
}
