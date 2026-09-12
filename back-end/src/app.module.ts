import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './shared/knex/database.module';
import { AuthenticaitonModule } from './modules/authentication/authentication.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ActivityGoalsModule } from './modules/activity-goals/activityGoals.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SessionLifecycleGuard } from './modules/authentication/session/session-lifecycle.guard';

const isTestMode = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthenticaitonModule,
    ActivitiesModule,
    CategoriesModule,
    ActivityGoalsModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 100,
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
