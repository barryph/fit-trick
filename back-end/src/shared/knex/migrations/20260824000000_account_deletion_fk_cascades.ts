import type { Knex } from 'knex';

const CASCADE_FKS: Array<{
  table: string;
  constraint: string;
  column: string;
  references: string;
}> = [
  {
    table: 'activities',
    constraint: 'activities_user_id_foreign',
    column: 'user_id',
    references: 'users(id)',
  },
  {
    table: 'categories',
    constraint: 'categories_user_id_foreign',
    column: 'user_id',
    references: 'users(id)',
  },
  {
    table: 'activity_events',
    constraint: 'activity_events_activity_id_foreign',
    column: 'activity_id',
    references: 'activities(id)',
  },
  {
    table: 'activities',
    constraint: 'activities_category_id_foreign',
    column: 'category_id',
    references: 'categories(id)',
  },
];

export async function up(knex: Knex): Promise<void> {
  // Every table below is exclusively owned by a single user. Cascading the
  // delete from the owner guarantees no orphaned rows remain if an account is
  // ever removed without the application-level deletion flow (e.g. manual
  // database cleanup). The account-deletion transaction also deletes these
  // rows explicitly; the cascades are a safety net, never a shortcut.
  for (const { table, constraint, column, references } of CASCADE_FKS) {
    await knex.raw(
      `ALTER TABLE ${table}
       DROP CONSTRAINT ${constraint},
       ADD CONSTRAINT ${constraint}
         FOREIGN KEY (${column}) REFERENCES ${references}
         ON DELETE CASCADE`,
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { table, constraint, column, references } of CASCADE_FKS) {
    await knex.raw(
      `ALTER TABLE ${table}
       DROP CONSTRAINT ${constraint},
       ADD CONSTRAINT ${constraint}
         FOREIGN KEY (${column}) REFERENCES ${references}`,
    );
  }
}
