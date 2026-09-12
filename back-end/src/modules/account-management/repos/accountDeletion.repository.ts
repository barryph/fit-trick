import { Injectable } from '@nestjs/common';
import { KnexService } from 'src/shared/knex/knex.service';
import SessionRevocationRepo from 'src/modules/authentication/repos/session-revocation.repository';
import DeletionTokenRepo from './deletionToken.repository';

/**
 * Deletes every record owned by or exclusively associated with an account in
 * a single transaction so a partial deletion can never leave the account in
 * an inconsistent state.
 *
 * Deletion is ordered by dependency (events/goals reference activities,
 * activities reference categories), with the database-level `ON DELETE
 * CASCADE` constraints added by migrations acting as a safety net. Shared
 * data that belongs to other users is never touched.
 */
@Injectable()
export default class AccountDeletionRepo {
  constructor(
    private readonly knexService: KnexService,
    private readonly sessionRevocations: SessionRevocationRepo,
    private readonly deletionTokens: DeletionTokenRepo,
  ) {}

  async deleteAccount(userId: string): Promise<void> {
    await this.knexService.connection.transaction(async (trx) => {
      await trx.raw(
        `DELETE FROM activity_events
         WHERE activity_id IN (SELECT id FROM activities WHERE user_id = :userId)`,
        { userId },
      );
      await trx.raw(
        `DELETE FROM activity_goals
         WHERE activity_id IN (SELECT id FROM activities WHERE user_id = :userId)`,
        { userId },
      );
      await trx.raw(`DELETE FROM activities WHERE user_id = :userId`, {
        userId,
      });
      await trx.raw(`DELETE FROM categories WHERE user_id = :userId`, {
        userId,
      });
      await trx.raw(`DELETE FROM external_identities WHERE user_id = :userId`, {
        userId,
      });
      // Explicit, alongside the FK cascade: any outstanding deletion link for
      // this account must stop working the moment the account is gone.
      await this.deletionTokens.deleteAllForUser(userId, trx);
      await this.sessionRevocations.revokeAllForUser(userId, trx);
      await trx.raw(`DELETE FROM users WHERE id = :userId`, { userId });
    });
  }
}
