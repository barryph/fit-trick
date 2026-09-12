import knex from 'knex';
import * as config from '../../knexfile';

let knexInstance: knex.Knex | null = null;

export function getTestKnex(): knex.Knex {
  if (!knexInstance) {
    knexInstance = knex(config.test);
  }
  return knexInstance;
}

export async function truncateAllTables(): Promise<void> {
  const db = getTestKnex();
  await db.raw(`
    TRUNCATE TABLE
      activity_events,
      activities,
      categories,
      external_identities,
      revoked_sessions,
      user_sessions,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function destroyTestKnex(): Promise<void> {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
  }
}
