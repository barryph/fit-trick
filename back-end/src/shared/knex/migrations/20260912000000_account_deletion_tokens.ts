import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Single-use tokens backing the unauthenticated ("account-deletion site")
  // deletion flow. Separate from `user_sessions` and from the password-reset
  // columns so a link emailed for deletion can never be confused with any other
  // credential.
  //
  // Only the SHA-256 hash of a token is stored; the plaintext lives in the
  // email and in the request that redeems it. `expires_at` is an instant
  // (timestamptz), not a calendar date, so it is compared against the app's
  // clock exactly like session expiry.
  await knex.schema.createTable('account_deletion_tokens', (table) => {
    table.increments('id').primary();
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      // Outstanding tokens are purged for free when the account is deleted.
      .onDelete('CASCADE');
    table.text('token_hash').notNullable().unique();
    // Snapshot of the address the link was sent to: sending and the post-
    // deletion confirmation must not depend on the `users` row still existing.
    table.text('email').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamps(true, true);

    table.index(['user_id']);
    table.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('account_deletion_tokens');
}
