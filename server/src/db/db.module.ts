import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import type { Pool } from 'pg'
import { env } from '../config/env'
import { createDb, createPool } from './client'

export const DB = Symbol('DB')
export const PG_POOL = Symbol('PG_POOL')

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => createPool(env().DATABASE_URL) },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool) => createDb(pool) },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end()
  }
}
