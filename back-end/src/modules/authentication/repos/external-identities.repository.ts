import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from 'src/shared/knex/knex.service';
import ExternalIdentity from '../domain/external-identity.entity';
import type { ExternalProvider } from '../domain/external-identity.types';
import * as ExternalIdentityMap from '../mappers/external-identity.map';
import type { IExternalIdentityPersistence } from '../mappers/external-identity.map';

type DbConnection = Knex | Knex.Transaction;

export interface IExternalIdentitiesRepo {
  findByProviderSubject(
    provider: ExternalProvider,
    providerSubject: string,
  ): Promise<ExternalIdentity | null>;
  findByUserId(userId: string): Promise<ExternalIdentity[]>;
  create(
    identity: ExternalIdentity,
    trx?: DbConnection,
  ): Promise<ExternalIdentity>;
}

@Injectable()
export default class ExternalIdentitiesRepo implements IExternalIdentitiesRepo {
  constructor(private readonly knexService: KnexService) {}

  async findByProviderSubject(
    provider: ExternalProvider,
    providerSubject: string,
  ): Promise<ExternalIdentity | null> {
    const result = await this.knexService.connection.raw<{
      rows: IExternalIdentityPersistence[];
    }>(
      `SELECT * FROM external_identities WHERE provider = :provider AND provider_subject = :providerSubject`,
      { provider, providerSubject },
    );
    const row = result.rows[0];
    if (!row) return null;
    return ExternalIdentityMap.persistenceToDomain(row);
  }

  async findByUserId(userId: string): Promise<ExternalIdentity[]> {
    const result = await this.knexService.connection.raw<{
      rows: IExternalIdentityPersistence[];
    }>(
      `SELECT * FROM external_identities WHERE user_id = :userId ORDER BY id`,
      { userId },
    );
    return result.rows.map(ExternalIdentityMap.persistenceToDomain);
  }

  async create(
    identity: ExternalIdentity,
    trx?: DbConnection,
  ): Promise<ExternalIdentity> {
    const row = ExternalIdentityMap.toPersistence(identity);
    const db = trx ?? this.knexService.connection;
    const result = await db.raw<{
      rows: IExternalIdentityPersistence[];
    }>(
      `
        INSERT INTO external_identities (provider, provider_subject, user_id, provider_email, refresh_token)
        VALUES (:provider, :providerSubject, :userId, :providerEmail, :refreshToken)
        RETURNING *
      `,
      {
        provider: row.provider,
        providerSubject: row.provider_subject,
        userId: row.user_id,
        providerEmail: row.provider_email,
        refreshToken: row.refresh_token,
      },
    );
    const created = result.rows[0];
    return ExternalIdentityMap.persistenceToDomain(created);
  }
}
