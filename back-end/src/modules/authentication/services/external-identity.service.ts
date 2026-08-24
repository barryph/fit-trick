import { Injectable } from '@nestjs/common';
import { KnexService } from 'src/shared/knex/knex.service';
import User from 'src/modules/users/domain/user.entity';
import UserEmail from 'src/modules/users/domain/value-objects/UserEmail';
import UsersRepo from 'src/modules/users/repos/user.repository';
import { OAuthCredentialError } from '../authentication.errors';
import ExternalIdentitiesRepo from '../repos/external-identities.repository';
import ExternalIdentity from '../domain/external-identity.entity';
import type { VerifiedExternalIdentity } from '../domain/external-identity.types';

const SYNTHETIC_EMAIL_DOMAIN = 'local.kadence';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}

/**
 * Resolves a verified external identity to an application user.
 *
 * Security invariants:
 *  - Account resolution is driven exclusively by `(provider, providerSubject)`
 *    from the *verified* credential. Client-supplied identity is never used.
 *  - Matching emails never merge accounts. A new identity always creates a
 *    distinct user (with a deterministic synthetic email if the provider email
 *    is already taken).
 *  - An identity already attached to a user is never reassigned: the unique
 *    (provider, provider_subject) constraint makes transfer impossible and
 *    concurrent first sign-ins are reconciled via that constraint.
 */
@Injectable()
export class ExternalIdentityService {
  constructor(
    private readonly usersRepo: UsersRepo,
    private readonly externalIdentitiesRepo: ExternalIdentitiesRepo,
    private readonly knexService: KnexService,
  ) {}

  async resolveOrCreate(
    verified: VerifiedExternalIdentity,
    refreshToken: string | null = null,
  ): Promise<User> {
    const existing = await this.findExisting(verified);
    if (existing) {
      return this.loadUser(existing);
    }

    const syntheticEmail = this.syntheticEmail(verified);

    try {
      const email = await this.pickEmail(verified, syntheticEmail);
      return await this.createUserAndIdentity(verified, email, refreshToken);
    } catch (err) {
      // A concurrent first sign-in for the same identity won the race.
      if (isUniqueViolation(err)) {
        const concurrent = await this.findExisting(verified);
        if (concurrent) {
          return this.loadUser(concurrent);
        }
      }
      throw err;
    }
  }

  private async findExisting(
    verified: VerifiedExternalIdentity,
  ): Promise<ExternalIdentity | null> {
    return this.externalIdentitiesRepo.findByProviderSubject(
      verified.provider,
      verified.subject,
    );
  }

  private async loadUser(identity: ExternalIdentity): Promise<User> {
    const user = await this.usersRepo.getById(identity.userId);
    if (!user) {
      // Identity row exists but the user is gone (e.g. deleted). Fail closed
      // rather than silently creating a fresh account.
      console.error('Error: User not found in external identity service');
      throw new OAuthCredentialError();
    }
    return user;
  }

  private syntheticEmail(verified: VerifiedExternalIdentity): UserEmail {
    return UserEmail.create(
      `${verified.provider}-${verified.subject}@${SYNTHETIC_EMAIL_DOMAIN}`,
    );
  }

  private async pickEmail(
    verified: VerifiedExternalIdentity,
    syntheticEmail: UserEmail,
  ): Promise<UserEmail> {
    if (verified.email) {
      try {
        const email = UserEmail.create(verified.email);
        const taken = await this.usersRepo.exists(email);
        if (!taken) {
          return email;
        }
      } catch {
        // Provider email malformed or unusable: fall through to synthetic.
      }
    }
    // Provider email missing, invalid, or already used by a different account:
    // use a deterministic unique address so we never merge or reject on email.
    return syntheticEmail;
  }

  private async createUserAndIdentity(
    verified: VerifiedExternalIdentity,
    email: UserEmail,
    refreshToken: string | null,
  ): Promise<User> {
    const newUser = User.createNew({
      email,
      password: null,
    });

    return this.knexService.connection.transaction(async (trx) => {
      const user = await this.usersRepo.create(newUser, trx);
      const identity = ExternalIdentity.createNew({
        provider: verified.provider,
        providerSubject: verified.subject,
        userId: user.id!,
        providerEmail: verified.email,
        refreshToken,
      });
      await this.externalIdentitiesRepo.create(identity, trx);
      return user;
    });
  }
}
