import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './shared/knex/database.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { AccountManagementModule } from './modules/account-management/account-management.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ActivityGoalsModule } from './modules/activity-goals/activityGoals.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SessionLifecycleGuard } from './modules/authentication/session/session-lifecycle.guard';
import {
  DELETION_ADDRESS_THROTTLER,
  DELETION_REQUEST_ADDRESS_LIMIT,
  DELETION_REQUEST_ADDRESS_TTL_MS,
} from './modules/account-management/infrastructure/deletion.constants';

const isTestMode = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthenticationModule,
    AccountManagementModule,
    ActivitiesModule,
    CategoriesModule,
    ActivityGoalsModule,
    ThrottlerModule.forRoot({
      // Disables every throttler in test mode, including route-level guards
      // such as DeletionRequestThrottlerGuard that are not skipped by the
      // conditional APP_GUARD registration below. Without this, e2e specs share
      // one rate-limit budget and fail on request count rather than behaviour.
      // The limits themselves are covered by unit tests of the tracker.
      skipIf: () => isTestMode,
      throttlers: [
        {
          // Default, per-client (IP) limit applied globally by ThrottlerGuard.
          ttl: 60000,
          limit: 100,
        },
        {
          // Address-scoped limit for the public deletion-request endpoint,
          // which a per-client limit cannot provide: one client can aim many
          // requests at a single victim's address. The key is derived from the
          // submitted email by DeletionRequestThrottlerGuard.
          name: DELETION_ADDRESS_THROTTLER,
          ttl: DELETION_REQUEST_ADDRESS_TTL_MS,
          limit: DELETION_REQUEST_ADDRESS_LIMIT,
        },
      ],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Applies rolling session renewal / expiry to every route, including
    // public ones (a sign-in attempt carrying an expired cookie must still be
    // able to succeed). Registered in every environment: unlike rate limits,
    // this is part of the authentication model. `useExisting` keeps the single
    // instance the authentication module provides.
    {
      provide: APP_GUARD,
      useExisting: SessionLifecycleGuard,
    },
    // Disable rate limits in test mode
    ...(isTestMode
      ? []
      : [
          // Applies the throttle globally by binding the ThrottlerGuard Guard to every endpoint
          {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
          },
        ]),
  ],
})
export class AppModule {}
