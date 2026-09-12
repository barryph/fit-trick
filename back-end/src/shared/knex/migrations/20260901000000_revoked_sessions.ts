import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Revocation tombstones.
  //
  // Revoking a session deletes its `user_sessions` row, but an authenticated
  // request that is already in flight has the record in memory and writes it
  // back when it finishes (the session store's `set` is an upsert). That lets a
  // request that overlapped a sign-out, a password reset or an absolute-cap
  // revocation resurrect the row. A tombstone makes the revocation durable:
  // once a session id is listed here it stays rejected no matter what the
  // session table contains.
  await knex.schema.createTable('revoked_sessions', (table) => {
    table.text('sid').primary();
    // When the tombstone may be purged. A resurrected record can only be
    // written back within the lifetime of an in-flight request, so this is
    // generous; see SessionRevocationRepo for the value used.
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('revoked_sessions');
}
