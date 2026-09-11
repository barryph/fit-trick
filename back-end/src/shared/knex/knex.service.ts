import { Injectable, OnModuleDestroy } from '@nestjs/common';
import knex from 'knex';
import * as config from '../../../knexfile';

const environment = process.env.NODE_ENV || 'development';

const knexConfig =
  config[environment as keyof typeof config] ?? config.development;

@Injectable()
export class KnexService implements OnModuleDestroy {
  private db: knex.Knex;

  constructor() {
    this.db = knex(knexConfig);
  }

  get connection() {
    return this.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
