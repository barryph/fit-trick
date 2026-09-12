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
