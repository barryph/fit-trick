import { Injectable, Logger } from '@nestjs/common';
import { AccountNotFoundError } from '../authentication.errors';
import { AppleProvider } from '../infrastructure/providers/apple.provider';
import ExternalIdentitiesRepo from '../repos/external-identities.repository';
import AccountDeletionRepo from '../repos/account-deletion.repository';
import UsersRepo from 'src/modules/users/repos/user.repository';
import { loadOAuthConfig } from '../config/oauth.config';

/**
 * Deletes an account and everything it owns.
 *
 * Security invariants:
 *  - The only input is the authenticated user's ID, taken from the session.
 *    No client-supplied identifier is ever accepted, so an account can never
 *    be targeted by another user.
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
  ) {}

  async deleteAccount(userId: string): Promise<void> {
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
  }

  /**
   * Revokes the account's provider authorizations. Google needs no server-side
   * call (the client disconnects via `GoogleSignin.revokeAccess()` and only
   * OIDC scopes are granted); Apple authorizations are revoked via Apple's
   * revoke endpoint using the refresh token captured at sign-in. An identity
   * with no stored token has nothing to revoke and is skipped.
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
