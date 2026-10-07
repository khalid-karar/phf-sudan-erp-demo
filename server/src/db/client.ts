import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, types } from 'pg'
import * as schema from './schema'

// Keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting).
types.setTypeParser(1082, (v) => v)

export type Db = NodePgDatabase<typeof schema>
/** A transaction handle; services accept either a Db or a Tx. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

export function createPool(url: string) {
  const pool = new Pool({ connectionString: url, max: 10, statement_timeout: 60_000 })
  // A database restart drops idle connections; without this handler that error would end the process.
  pool.on('error', (e) => console.error('Idle database connection error:', e.message))
  return pool
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema })
}
