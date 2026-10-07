import { sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'

/**
 * Next gapless document number, e.g. nextNo(tx, 'PV') → "PV-0042".
 * Must run inside the transaction that creates the document: the counter row stays
 * locked until commit, and a rollback gives the number back.
 */
export async function nextNo(tx: DbOrTx, key: string, width = 4): Promise<string> {
  const r = await tx.execute<{ n: number }>(sql`
    insert into doc_counters (key, next) values (${key}, 2)
    on conflict (key) do update set next = doc_counters.next + 1
    returning next - 1 as n`)
  return `${key}-${String(r.rows[0].n).padStart(width, '0')}`
}
