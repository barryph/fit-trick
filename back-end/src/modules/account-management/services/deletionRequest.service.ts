import { Inject, Injectable, Logger } from '@nestjs/common';
import { UsersService } from 'src/modules/users/services/users.service';
import {
  EMAIL_SENDER,
  type IEmailSender,
} from 'src/shared/email/email-sender.port';
import { InvalidDeletionTokenError } from '../domain/account-management.errors';
import { buildDeleteAccountLink } from '../config/deletion-site.config';
import {
  DELETION_TOKEN_EXPIRY_MINUTES,
  DELETION_TOKEN_EXPIRY_MS,
} from '../infrastructure/deletion.constants';
import {
  generateDeletionToken,
  hashDeletionToken,
} from '../infrastructure/deletion-token';
import DeletionTokenRepo from '../repos/deletionToken.repository';
import { AccountDeletionService } from './accountDeletion.service';

/**
 * The unauthenticated ("account-deletion site") half of account deletion: a
 * user who no longer has the app proves control of their email address instead
 * of signing in.
 *
 * Two rules shape everything here:
 *
 *  - **No account enumeration.** Requesting a link behaves identically whether
 *    or not the address is registered, including on send failures.
 *  - **A link works exactly once.** The token row is deleted atomically at the
 *    moment it is redeemed, before any account is touched, so a replayed or
 *    concurrent confirmation can never delete twice.
 */
@Injectable()
export class DeletionRequestService {
  private readonly logger = new Logger(DeletionRequestService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly deletionTokens: DeletionTokenRepo,
    private readonly accountDeletionService: AccountDeletionService,
    @Inject(EMAIL_SENDER) private readonly emailSender: IEmailSender,
  ) {}

  /**
   * Starts the flow. Resolves identically for a registered and an unregistered
   * address; the caller must not vary its response on the outcome.
   */
  async requestDeletion(rawEmail: string): Promise<void> {
    const user = await this.usersService.getByEmail(rawEmail);
    if (!user?.isPersisted()) {
      return;
    }

    const { token, hashedToken } = generateDeletionToken();
    await this.deletionTokens.replacePendingForUser({
      userId: user.id,
      email: user.email.value,
      tokenHash: hashedToken,
      expiresAt: new Date(Date.now() + DELETION_TOKEN_EXPIRY_MS),
    });

    const link = buildDeleteAccountLink(user.email.value, token);
    try {
      await this.emailSender.sendAccountDeletionEmail({
        recipientEmail: user.email.value,
        deletionUrl: link.url,
        expiresInMinutes: DELETION_TOKEN_EXPIRY_MINUTES,
      });
    } catch (err) {
      // Swallowed on purpose. Surfacing a send failure would make the endpoint
      // an oracle for "this address exists" whenever mail delivery is flaky.
      // The token is left in place rather than rolled back: a timeout may have
      // delivered the message anyway, and an unused token expires on its own.
      this.logger.error(
        `Failed to send the account deletion email for userId=${user.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Finishes the flow. The token is burned first; only then is the account
   * deleted. If the deletion fails the token is put back, so a transient
   * provider or database failure is retryable without a fresh email.
   */
  async confirmDeletion(rawToken: string): Promise<void> {
    const hashedToken = hashDeletionToken(rawToken);
    const redeemed = await this.deletionTokens.consumeIfValid(hashedToken);
    if (!redeemed) {
      throw new InvalidDeletionTokenError();
    }

    try {
      await this.accountDeletionService.deleteAccount(redeemed.userId, {
        notifyByEmail: true,
      });
    } catch (err) {
      await this.restoreToken(rawToken, redeemed);
      throw err;
    }
  }

  private async restoreToken(
    rawToken: string,
    redeemed: { userId: string; email: string },
  ): Promise<void> {
    try {
      await this.deletionTokens.restore({
        userId: redeemed.userId,
        email: redeemed.email,
        tokenHash: hashDeletionToken(rawToken),
        // The restored link keeps a fresh window rather than the remainder of
        // the original one: the failure was the server's, not the user's.
        expiresAt: new Date(Date.now() + DELETION_TOKEN_EXPIRY_MS),
      });
    } catch (err) {
      // Restoring is a courtesy; failing to restore only means the user has to
      // request a new link, which is why the original error is what propagates.
      this.logger.error(
        `Could not restore the deletion token after a failed deletion for userId=${redeemed.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
