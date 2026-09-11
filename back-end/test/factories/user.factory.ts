import User from '../../src/modules/users/domain/user.entity';
import UserEmail from '../../src/modules/users/domain/value-objects/UserEmail';
import UserPassword from '../../src/modules/users/domain/value-objects/UserPassword';
import UsersRepo from '../../src/modules/users/repos/user.repository';
import SessionRevocationRepo from '../../src/modules/authentication/repos/session-revocation.repository';
import { KnexService } from '../../src/shared/knex/knex.service';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '../../src/shared/knex/database.module';

export interface UserFactoryOverrides {
  email?: string;
  password?: string;
}

export function buildUser(overrides: UserFactoryOverrides = {}): User {
  const email = UserEmail.create(
    overrides.email ?? `user-${Date.now()}@example.com`,
  );
  const password = UserPassword.create(overrides.password ?? 'password123');
  return User.createNew({ email, password });
}

export async function insertUser(
  overrides: UserFactoryOverrides = {},
): Promise<User> {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [UsersRepo, SessionRevocationRepo],
  }).compile();

  const repo = moduleRef.get(UsersRepo);
  const user = buildUser(overrides);
  const created = await repo.create(user);
  await moduleRef.close();
  return created;
}

export async function insertUserWithKnex(
  knexService: KnexService,
  overrides: UserFactoryOverrides = {},
): Promise<User> {
  const repo = new UsersRepo(
    knexService,
    new SessionRevocationRepo(knexService),
  );
  const user = buildUser(overrides);
  return repo.create(user);
}
