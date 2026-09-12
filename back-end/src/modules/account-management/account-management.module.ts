import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { EmailModule } from 'src/shared/email/email.module';
import AccountDeletionRepo from './repos/accountDeletion.repository';
import DeletionTokenRepo from './repos/deletionToken.repository';
import { AccountDeletionService } from './services/accountDeletion.service';
import { DeletionRequestService } from './services/deletionRequest.service';
import {
  AccountController,
  AccountDeletionController,
} from './presentation/account.controller';

/**
 * Account lifecycle: deleting an account, from both entry points.
 *
 *  - `DELETE /account` — authenticated, from inside the app (kept for Google
 *    Play's in-app deletion requirement).
 *  - `POST /account/deletion-requests[/confirm]` — unauthenticated, for people
 *    who no longer have the app and prove ownership through an emailed,
 *    single-use token.
 *
 * Both funnel into `AccountDeletionService`. `external_identities` and session
 * revocation stay owned by `authentication`; this module consumes them rather
 * than duplicating them, so the dependency is one-way
 * (`account-management` → `authentication` → `users`).
 */
@Module({
  imports: [UsersModule, AuthenticationModule, EmailModule],
  controllers: [AccountController, AccountDeletionController],
  providers: [
    AccountDeletionService,
    DeletionRequestService,
    AccountDeletionRepo,
    DeletionTokenRepo,
  ],
})
export class AccountManagementModule {}
