import { PostgreSqlContainer } from '@testcontainers/postgresql';
import knex from 'knex';
import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';

const ENV_FILE = path.join(__dirname, '.test-env.json');

interface TestDatabaseEnv {
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  DATABASE_NAME: string;
  DATABASE_HOST: string;
  DATABASE_PORT: string;
  NODE_ENV: string;
  SESSION_SECRET: string;
}

/**
 * Placeholder OAuth config so providers can be constructed by every test app.
 * The OAuth e2e suite overrides these with live local cert/JWKS servers before
 * creating its own app; other suites never verify tokens so the unreachable
 * URLs are never fetched.
 */
const TEST_OAUTH_ENV: Record<string, string> = {
  GOOGLE_SERVER_CLIENT_IDS: 'test-server-client-id.apps.googleusercontent.com',
  GOOGLE_JWKS_URL: 'http://127.0.0.1:1/v1/certs',
  GOOGLE_JWKS_COOLDOWN_MS: '0',
  APPLE_CLIENT_IDS: 'com.example.app',
  APPLE_JWKS_URL: 'http://127.0.0.1:1/auth/keys',
  APPLE_JWKS_COOLDOWN_MS: '0',
};

async function setupContainerDatabase(): Promise<{
  env: TestDatabaseEnv;
  containerId: string;
}> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('kadence_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  return {
    containerId: container.getId(),
    env: {
      ...TEST_OAUTH_ENV,
      POSTGRES_USER: container.getUsername(),
      POSTGRES_PASSWORD: container.getPassword(),
      DATABASE_NAME: container.getDatabase(),
      DATABASE_HOST: container.getHost(),
      DATABASE_PORT: String(container.getPort()),
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret',
    },
  };
}

/**
 * Fallback when no Docker runtime is available: use a local Postgres instance
 * (credentials from `.env`), creating a dedicated test database so the
 * development database is never touched.
 */
async function setupLocalDatabase(): Promise<{
  env: TestDatabaseEnv;
  containerId: null;
}> {
  const connection = {
    host: process.env.DATABASE_HOST ?? '127.0.0.1',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? '',
    database: 'postgres',
  };

  const admin = knex({ client: 'pg', connection });
  const dbName = 'kadence_test';

  const result = await admin.raw(
    'SELECT 1 FROM pg_database WHERE datname = ?',
    [dbName],
  );
  if (result.rows.length === 0) {
    await admin.raw(`CREATE DATABASE "${dbName}"`);
  }
  await admin.destroy();

  const baseEnv: TestDatabaseEnv & Record<string, string> = {
    ...TEST_OAUTH_ENV,
    POSTGRES_USER: connection.user,
    POSTGRES_PASSWORD: connection.password,
    DATABASE_NAME: dbName,
    DATABASE_HOST: connection.host,
    DATABASE_PORT: String(connection.port),
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret',
  };

  return {
    containerId: null,
    env: baseEnv,
  };
}

export default async function globalSetup() {
  let setup: { env: TestDatabaseEnv; containerId: string | null };

  try {
    setup = await setupContainerDatabase();
  } catch {
    setup = await setupLocalDatabase();
  }

  // The workers deliberately keep the host's timezone. A `process.env.TZ = 'UTC'`
  // pin used to live here to make node-postgres' decoding of `date` columns
  // deterministic; `src/shared/knex/date-parsers.ts` now returns those as plain
  // calendar strings, so the pin only hid timezone bugs. Keeping the host
  // timezone means these suites exercise an API host genuinely offset from the
  // client dates they send (the local Postgres server also defaults to
  // Pacific/Auckland here); on a UTC CI runner the two simply coincide.

  fs.writeFileSync(
    ENV_FILE,
    JSON.stringify({ env: setup.env, containerId: setup.containerId }),
  );

  process.env.NODE_ENV = 'test';
  Object.assign(process.env, setup.env);

  const db = knex({
    client: 'pg',
    connection: {
      host: setup.env.DATABASE_HOST,
      port: Number(setup.env.DATABASE_PORT),
      user: setup.env.POSTGRES_USER,
      password: setup.env.POSTGRES_PASSWORD,
      database: setup.env.DATABASE_NAME,
    },
    migrations: {
      directory: path.join(__dirname, '../src/shared/knex/migrations'),
    },
  });

  await db.migrate.latest();

  await db.raw(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid varchar NOT NULL,
      sess json NOT NULL,
      expired timestamptz NOT NULL,
      PRIMARY KEY (sid)
    )
  `);
  await db.raw(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expired ON user_sessions (expired)
  `);

  await db.destroy();
}

export { ENV_FILE };
