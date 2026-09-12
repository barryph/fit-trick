import { Inject, Injectable, Logger } from '@nestjs/common';
import { AccountNotFoundError } from '../domain/account-management.errors';
import { AppleProvider } from 'src/modules/authentication/infrastructure/providers/apple.provider';
import ExternalIdentitiesRepo from 'src/modules/authentication/repos/external-identities.repository';
import UsersRepo from 'src/modules/users/repos/user.repository';
import { loadOAuthConfig } from 'src/modules/authentication/config/oauth.config';
import AccountDeletionRepo from '../repos/accountDeletion.repository';
import {
  EMAIL_SENDER,
  type IEmailSender,
} from 'src/shared/email/email-sender.port';

export interface DeleteAccountOptions {
  /**
   * Set by the external (emailed-link) flow only. The in-app flow leaves it
   * off: the user is looking at the app and gets its own confirmation.
   */
  notifyByEmail?: boolean;
}

/**
 * Deletes an account and everything it owns.
 *
 * This is the *only* place an account is destroyed. Both entry points — the
 * authenticated in-app request and the unauthenticated emailed link — funnel
 * through here so the ordering and the safety rules cannot drift apart.
 *
 * Security invariants:
 *  - The only input is a user ID that the caller has already established (from
 *    the session in the in-app flow, from a single-use token in the external
 *    flow). No client-supplied identifier is ever accepted directly.
 *  - Provider disconnection happens BEFORE any database deletion. If the
 *    provider refuses to revoke the user's authorization, the account is left
 *    untouched and the caller can retry.
 *  - Deletion runs in one transaction; a failure mid-way rolls back so no
 *    partially-deleted account or orphaned records remain.
 *  - Audit logging records the account ID and outcome only. Passwords,
 *    tokens, authorization codes and other credentials are never logged.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly usersRepo: UsersRepo,
    private readonly externalIdentitiesRepo: ExternalIdentitiesRepo,
    private readonly accountDeletionRepo: AccountDeletionRepo,
    private readonly appleProvider: AppleProvider,
    @Inject(EMAIL_SENDER) private readonly emailSender: IEmailSender,
  ) {}

  async deleteAccount(
    userId: string,
    options: DeleteAccountOptions = {},
  ): Promise<void> {
    const user = await this.usersRepo.getById(userId);
    if (!user) {
      throw new AccountNotFoundError();
    }

    const identities = await this.externalIdentitiesRepo.findByUserId(userId);
    await this.disconnectExternalProviders(identities);

    await this.accountDeletionRepo.deleteAccount(userId);

    this.logger.log(
      `Account deleted: userId=${userId} providers=${
        identities.map((identity) => identity.provider).join(',') ||
        'email-password'
      }`,
    );

    if (options.notifyByEmail) {
      await this.sendDeletionConfirmation(user.email.value);
    }
  }

  /**
   * Tells the account's address that the deletion completed. Best-effort by
   * design: the account is already gone, so a mail failure cannot be undone or
   * retried and must never turn a successful deletion into a 5xx for the
   * caller. It is logged and swallowed.
   */
  private async sendDeletionConfirmation(
    recipientEmail: string,
  ): Promise<void> {
    try {
      await this.emailSender.sendAccountDeletedEmail({ recipientEmail });
    } catch (err) {
      this.logger.error(
        `Account was deleted but the confirmation email failed to send: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Revokes the account's provider authorizations. Google needs no server-side
   * call (the client disconnects via `GoogleSignin.revokeAccess()` and only
   * OIDC scopes are granted); Apple authorizations are revoked via Apple's
   * revoke endpoint using the refresh token captured at sign-in. An identity
   * with no stored token has nothing to revoke and is skipped.
   *
   * The web deletion flow has no app to perform the Google disconnect; that
   * limitation is documented in `docs/external-account-deletion.md`.
   */
  private async disconnectExternalProviders(
    identities: Array<{ provider: string; refreshToken: string | null }>,
  ): Promise<void> {
    for (const identity of identities) {
      if (identity.provider !== 'apple') {
        continue;
      }
      if (!identity.refreshToken) {
        this.logger.log(
          'Apple identity has no stored refresh token; skipping provider revocation',
        );
        continue;
      }
      await this.revokeAppleAuthorization(identity.refreshToken);
    }
  }

  /**
   * The refresh token was issued for one of the configured client IDs (the app
   * supports multiple bundle identifiers); the stored identity does not record
   * which one. Try each configured client ID until the revocation succeeds.
   */
  private async revokeAppleAuthorization(refreshToken: string): Promise<void> {
    const { appleClientIds } = loadOAuthConfig();
    for (const clientId of appleClientIds) {
      try {
        await this.appleProvider.revokeRefreshToken(refreshToken, clientId);
        return;
      } catch (err) {
        const isLast = appleClientIds[appleClientIds.length - 1] === clientId;
        if (isLast) {
          throw err;
        }
      }
    }
  }
}
