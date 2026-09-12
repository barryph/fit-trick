import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthenticationService } from './services/authentication.service';
import { SocialAuthService } from './services/social-auth.service';
import { ExternalIdentityService } from './services/external-identity.service';
import { AccountDeletionService } from './services/account-deletion.service';
import { PassportModule } from '@nestjs/passport';
import { AuthenticationController } from './authentication.controller';
import { EMAIL_SENDER } from './ports/email-sender.port';
import { NoopEmailSender } from './infrastructure/noop-email-sender';
import { GoogleProvider } from './infrastructure/providers/google.provider';
import { AppleProvider } from './infrastructure/providers/apple.provider';
import AccountDeletionRepo from './repos/account-deletion.repository';
import SessionRevocationRepo from './repos/session-revocation.repository';
import {
  SESSION_POLICY,
  resolveSessionPolicy,
  type SessionPolicy,
} from './session/session-policy';
import { SessionLifecycleGuard } from './session/session-lifecycle.guard';

@Module({
  imports: [UsersModule, PassportModule],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    SocialAuthService,
    ExternalIdentityService,
    AccountDeletionService,
    GoogleProvider,
    AppleProvider,
    AccountDeletionRepo,
    SessionRevocationRepo,
    // One resolved policy for the whole app: the session middleware (cookie
    // window) and the lifecycle guard (renewal/revocation) must agree.
    {
      provide: SESSION_POLICY,
      useFactory: (): SessionPolicy => resolveSessionPolicy(process.env),
    },
    SessionLifecycleGuard,
    {
      provide: EMAIL_SENDER,
      useClass: NoopEmailSender,
    },
  ],
  exports: [SESSION_POLICY, SessionLifecycleGuard],
})
export class AuthenticaitonModule {}
