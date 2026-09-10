import { INestApplication, ValidationPipe } from '@nestjs/common';
import cors from 'cors';
import session from 'express-session';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Express } from 'express';
import passport from 'passport';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import helmet from 'helmet';
import { AllExceptionsFilter } from './ExceptionFilter';
import { configurePassport } from './modules/authentication/passport';
import { AuthenticationService } from './modules/authentication/services/authentication.service';
import UsersRepo from './modules/users/repos/user.repository';
import { KnexService } from './shared/knex/knex.service';
import {
  SESSION_POLICY,
  type SessionPolicy,
} from './modules/authentication/session/session-policy';
import {
  SESSION_COOKIE_NAME,
  sessionCookieAttributes,
} from './modules/authentication/session/session-cookie';

const isRunningBehindReverseProxy = process.env.NODE_ENV === 'production';

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function configureApp(app: INestApplication): void {
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Mobile clients do not send an Origin header, so CORS exists only for web
  // development. Allow an explicit list from env rather than reflecting any
  // origin. Default to localhost dev servers when not in production.
  const defaultCorsOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:8081', 'http://localhost:3000'];
  const corsOrigins = parseCsv(process.env.CORS_ORIGINS).length
    ? parseCsv(process.env.CORS_ORIGINS)
    : defaultCorsOrigins;
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  // Auth payloads (e.g. provider ID tokens) are small; reject oversized bodies
  // before they reach validation.
  (app as NestExpressApplication).useBodyParser('json', { limit: '32kb' });

  if (isRunningBehindReverseProxy) {
    // Requried for 'secure' cookies to work when running behind a reverse proxy (Caddy)
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    expressApp.set('trust proxy', 1);
  }

  app.use(
    helmet({
      // Since we're serving a mobile application CSP is not necessary
      contentSecurityPolicy: false,
    }),
  );

  const authenticationService = app.get(AuthenticationService);
  const usersRepo = app.get(UsersRepo);
  configurePassport(authenticationService, usersRepo);

  if (!process.env.SESSION_SECRET) {
    throw new Error('env.SESSION_SECRET must be set');
  }
  const knexService = app.get(KnexService);
  const sessionPolicy = app.get<SessionPolicy>(SESSION_POLICY);
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      store: new ConnectSessionKnexStore({
        knex: knexService.connection,
        tableName: 'user_sessions',
        createTable: true,
        // Disable periodic cleanup in tests to avoid open handles after Jest exits
        ...(process.env.NODE_ENV === 'test' && { cleanupInterval: 0 }),
      }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      proxy: isRunningBehindReverseProxy,
      cookie: {
        ...sessionCookieAttributes(),
        // The idle window is the session's lifetime until the lifecycle guard
        // re-grants it (rolling renewal). It must always be set: the store
        // falls back to a one-day expiry for cookies without a Max-Age.
        maxAge: sessionPolicy.idleTtlMs,
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());
}
