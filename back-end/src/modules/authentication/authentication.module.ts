import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmailModule } from 'src/shared/email/email.module';
import { AuthenticationService } from './services/authentication.service';
import { SocialAuthService } from './services/social-auth.service';
import { ExternalIdentityService } from './services/external-identity.service';
import { PassportModule } from '@nestjs/passport';
import { AuthenticationController } from './authentication.controller';
import { GoogleProvider } from './infrastructure/providers/google.provider';
import { AppleProvider } from './infrastructure/providers/apple.provider';
import ExternalIdentitiesRepo from './repos/external-identities.repository';
import SessionRevocationRepo from './repos/session-revocation.repository';
import {
  SESSION_POLICY,
  resolveSessionPolicy,
  type SessionPolicy,
} from './session/session-policy';
import { SessionLifecycleGuard } from './session/session-lifecycle.guard';

/**
 * Authentication: proving who a caller is, and holding the resulting session.
 *
 * Account *lifecycle* (deletion) deliberately lives in its own `account-management` module,
 * which consumes the repos and providers exported here. The dependency points
 * one way — `account-management` → `authentication` — so this module never
 * needs to know anything about deletion.
 */
@Module({
  imports: [UsersModule, PassportModule, EmailModule],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    SocialAuthService,
    ExternalIdentityService,
    GoogleProvider,
    AppleProvider,
    ExternalIdentitiesRepo,
    SessionRevocationRepo,
    // One resolved policy for the whole app: the session middleware (cookie
    // window) and the lifecycle guard (renewal/revocation) must agree.
    {
      provide: SESSION_POLICY,
      useFactory: (): SessionPolicy => resolveSessionPolicy(process.env),
    },
    SessionLifecycleGuard,
  ],
  exports: [
    SESSION_POLICY,
    SessionLifecycleGuard,
    ExternalIdentitiesRepo,
    SessionRevocationRepo,
    AppleProvider,
  ],
})
export class AuthenticationModule { }
