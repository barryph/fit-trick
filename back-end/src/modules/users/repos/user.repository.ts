import { KnexService } from 'src/shared/knex/knex.service';
import User from '../domain/user.entity';
import UserEmail from '../domain/value-objects/UserEmail';
import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { IUserPersistence } from '../mappers/userMap';
import * as UserMap from '../mappers/userMap';

type DbConnection = Knex | Knex.Transaction;

export interface IUsersRepo {
  exists(email: UserEmail): Promise<boolean>;
  getById(id: string): Promise<User | null>;
  getByEmail(id: UserEmail): Promise<User | null>;
  create(user: User): Promise<User>;
  setPasswordResetToken(
    userId: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void>;
  findPasswordResetByToken(hashedToken: string): Promise<{
    userId: string;
    passwordResetExpires: Date;
  } | null>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
  clearUserSessions(userId: string): Promise<void>;
}

@Injectable()
// export default class UsersRepo implements IUsersRepo {
export default class UsersRepo implements IUsersRepo {
  constructor(private readonly knexService: KnexService) {}

  async exists(email: UserEmail) {
    const userResult = await this.knexService.connection.raw<{ rows: User[] }>(
      `SELECT * FROM users WHERE email = :email`,
      {
        email: email.value,
      },
    );
    const found = userResult.rows.length >= 1;
    return found;
  }

  async getById(id: string): Promise<User | null> {
    const result = await this.knexService.connection.raw<{
      rows: IUserPersistence[];
    }>(`SELECT * FROM users WHERE id = :id`, {
      id,
    });
    const user = result.rows[0];
    if (!user) return null;
    return UserMap.persistenceToDomain(user);
  }

  async getByEmail(email: UserEmail): Promise<User | null> {
    const result = await this.knexService.connection.raw<{
      rows: IUserPersistence[];
    }>(`SELECT * FROM users WHERE email = :email`, {
      email: email.value,
    });
    const user = result.rows[0];
    if (!user) return null;
    return UserMap.persistenceToDomain(user);
  }

  async create(userDomain: User, trx?: DbConnection): Promise<User> {
    const user = await UserMap.toPersistence(userDomain);
    const db = trx ?? this.knexService.connection;
    const result = await db.raw<{
      rows: IUserPersistence[];
    }>(
      `
        INSERT INTO users (email, password)
        VALUES (:email, :password)
        RETURNING *
      `,
      {
        email: user.email,
        password: user.password,
      },
    );
    const newUser = result.rows[0];
    return UserMap.persistenceToDomain(newUser);
  }

  async setPasswordResetToken(
    userId: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.knexService.connection.raw(
      `
        UPDATE users
        SET password_reset_token = :hashedToken,
            password_reset_expires = :expiresAt,
            updated_at = NOW()
        WHERE id = :userId
      `,
      {
        userId,
        hashedToken,
        expiresAt,
      },
    );
  }

  async findPasswordResetByToken(hashedToken: string): Promise<{
    userId: string;
    passwordResetExpires: Date;
  } | null> {
    const result = await this.knexService.connection.raw<{
      rows: Array<{
        id: string;
        password_reset_expires: Date | string;
      }>;
    }>(
      `
        SELECT id, password_reset_expires
        FROM users
        WHERE password_reset_token = :hashedToken
      `,
      { hashedToken },
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: String(row.id),
      passwordResetExpires: new Date(row.password_reset_expires),
    };
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.knexService.connection.raw(
      `
        UPDATE users
        SET password = :hashedPassword,
            password_reset_token = NULL,
            password_reset_expires = NULL,
            updated_at = NOW()
        WHERE id = :userId
      `,
      {
        userId,
        hashedPassword,
      },
    );
  }

  async clearUserSessions(userId: string): Promise<void> {
    await this.knexService.connection.raw(
      `
        DELETE FROM user_sessions
        WHERE CAST(sess AS jsonb)->'passport'->>'user' = :userId
      `,
      { userId: String(userId) },
    );
  }
}
