import { desc, lte } from 'drizzle-orm'
import { unprocessable } from '../common/errors'
import type { DbOrTx } from '../db/client'
import { exchangeRates } from '../db/schema'

export const today = () => new Date().toISOString().slice(0, 10)

/** The SDG/USD rate in force on a date (latest entry on or before it). */
export async function rateOn(db: DbOrTx, date: string = today()): Promise<string> {
  const [r] = await db.select({ rate: exchangeRates.rate }).from(exchangeRates).where(lte(exchangeRates.date, date)).orderBy(desc(exchangeRates.date)).limit(1)
  if (!r) throw unprocessable('NO_RATE', { ar: 'لا يوجد سعر صرف مسجّل لهذا التاريخ', en: 'No exchange rate recorded for this date' }, { date })
  return r.rate
}
