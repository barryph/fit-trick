import 'dotenv/config';
import path from 'path';
import type { Knex } from 'knex';
import * as fs from 'node:fs';
import { registerDateTypeParser } from './src/shared/knex/date-parsers';

// Importing this config is what every database consumer does first (the API,
// migrations, seeds, and tests), so it is the one reliable place to make DATE
// columns parse as calendar strings before any connection is opened.
registerDateTypeParser();

const isProduction = process.env.NODE_ENV === 'production';
const root = path.resolve(process.cwd());

/**
 * Pin every session to UTC.
 *
 * Nothing in the product is scheduled in the database's timezone: the user's
 * local date arrives per request and all stored instants are `timestamptz`.
 * Leaving the session timezone to the host's default would still make
 * `CURRENT_DATE` / `CURRENT_TIMESTAMP` rendering - and any future query that
 * reaches for them - depend on where Postgres happens to be deployed, so the
 * whole stack is pinned instead.
 */
const CONNECTION_TIMEZONE = '-c TimeZone=UTC';

export const development: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DATABASE_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.DATABASE_NAME,
    options: CONNECTION_TIMEZONE,
  },
  migrations: {
    directory: path.join(root, '/src/shared/knex/migrations'),
  },
  seeds: {
    directory: path.join(root, '/src/shared/knex/seeds'),
  },
};

export const test: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT
      ? Number(process.env.DATABASE_PORT)
      : undefined,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.DATABASE_NAME,
    options: CONNECTION_TIMEZONE,
  },
  migrations: {
    directory: path.join(root, '/src/shared/knex/migrations'),
  },
  seeds: {
    directory: path.join(root, '/src/shared/knex/seeds'),
  },
};

export const production: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DATABASE_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.DATABASE_NAME,
    options: CONNECTION_TIMEZONE,
    // global-bundle.pem does not exist outside of prod,
    // we check isProduction to avoid erroring attempting to read a file that doesn't exist
    ...(isProduction && {
      ssl: {
        ca: fs.readFileSync('global-bundle.pem'),
        rejectUnauthorized: true,
      },
    }),
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: path.join(root, '/src/shared/knex/migrations'),
  },
  seeds: {
    directory: path.join(root, '/src/shared/knex/seeds'),
  },
};

// staging: {
//   client: "postgresql",
//   connection: {
//     database: "my_db",
//     user: "username",
//     password: "password"
//   },
//   pool: {
//     min: 2,
//     max: 10
//   },
//   migrations: {
//     tableName: "knex_migrations"
//   }
// },
