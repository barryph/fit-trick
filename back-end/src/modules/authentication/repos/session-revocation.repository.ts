import { Injectable, Logger } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from 'src/shared/knex/knex.service';
import { DEFAULT_SESSION_ABSOLUTE_TTL_MS } from '../session/session-policy';

type DbConnection = Knex | Knex.Transaction;

/**
 * How long a revocation tombstone is kept.
 *
 * A tombstone only has to outlive requests that read the session *before* it
 * was revoked and write it back afterwards — a window bounded by how long a
 * request can be in flight, not by the session's lifetime. The absolute cap is
 * used anyway because it is already the longest a resurrected record could be
 * worth anything, and a tombstone is a few dozen bytes.
 */
export const SESSION_REVOCATION_RETENTION_MS = DEFAULT_SESSION_ABSOLUTE_TTL_MS;

/**
 * Durable record of revoked session ids.
 *
 * Deleting the `user_sessions` row is not enough on its own: `connect-session-knex`
 * writes sessions with an upsert, so a request that loaded the session before
 * the deletion can re-insert it when it finishes (see
 * `docs/session-management.md`). Anything that revokes a session must record a
 * tombstone here, and `SessionLifecycleGuard` refuses any session id found in
 * this table — so a resurrected row is inert.
 */
@Injectable()
export default class SessionRevocationRepo {
  private readonly logger = new Logger(SessionRevocationRepo.name);

  constructor(private readonly knexService: KnexService) {}

  /** Marks a single session id as revoked. */
  async revoke(
    sid: string,
    db: DbConnection = this.knexService.connection,
  ): Promise<void> {
    await db.raw(
      `
        INSERT INTO revoked_sessions (sid, expires_at)
        VALUES (:sid, :expiresAt)
        ON CONFLICT (sid) DO UPDATE
          SET expires_at = GREATEST(revoked_sessions.expires_at, EXCLUDED.expires_at)
      `,
      { sid, expiresAt: this.retentionDeadline() },
    );
    await this.purgeExpired(db);
  }

  /**
   * Marks every session belonging to a user as revoked and deletes the rows,
   * atomically when no connection is supplied.
   *
   * This is the revocation used by password reset and account deletion. It
   * replaces a plain `DELETE`: a plain delete can be undone by an in-flight
   * request writing the row back, which would leave a stolen session usable
   * after the very event meant to evict it.
   */
  async revokeAllForUser(userId: string, db?: DbConnection): Promise<void> {
    const run = async (connection: DbConnection): Promise<void> => {
      await connection.raw(
        `
          INSERT INTO revoked_sessions (sid, expires_at)
          SELECT sid, :expiresAt FROM user_sessions
          WHERE CAST(sess AS jsonb)->'passport'->>'user' = :userId
          ON CONFLICT (sid) DO UPDATE
            SET expires_at = GREATEST(revoked_sessions.expires_at, EXCLUDED.expires_at)
        `,
        { userId: String(userId), expiresAt: this.retentionDeadline() },
      );
      await connection.raw(
        `
          DELETE FROM user_sessions
          WHERE CAST(sess AS jsonb)->'passport'->>'user' = :userId
        `,
        { userId: String(userId) },
      );
      await this.purgeExpired(connection);
    };

    if (db) {
      await run(db);
      return;
    }
    await this.knexService.connection.transaction(run);
  }

  /** Whether the given session id has been revoked. */
  async isRevoked(sid: string): Promise<boolean> {
    const row: unknown = await this.knexService
      .connection('revoked_sessions')
      .select('sid')
      .where({ sid })
      .first();
    return Boolean(row);
  }

  /**
   * Drops tombstones nothing can resurrect any more. Called from the
   * revocation paths, which are the only places tombstones are created, so the
   * table stays bounded without a scheduler.
   */
  async purgeExpired(
    db: DbConnection = this.knexService.connection,
    now: Date = new Date(),
  ): Promise<number> {
    try {
      const deleted: unknown = await db('revoked_sessions')
        .where('expires_at', '<', now)
        .del();
      return typeof deleted === 'number' ? deleted : 0;
    } catch (err) {
      // A failed purge must never fail the revocation it accompanies: leaving
      // an expired tombstone behind is harmless, failing to revoke is not.
      this.logger.warn(
        `Failed to purge expired session revocations: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }

  private retentionDeadline(): Date {
    return new Date(Date.now() + SESSION_REVOCATION_RETENTION_MS);
  }
}
