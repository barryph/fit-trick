import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Apple refresh tokens captured at sign-in via the authorization-code
  // exchange. Stored server-side so account deletion can revoke the user's
  // Sign in with Apple authorization. Never exposed to the client.
  await knex.schema.alterTable('external_identities', (table) => {
    table.text('refresh_token');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('external_identities', (table) => {
    table.dropColumn('refresh_token');
  });
}
