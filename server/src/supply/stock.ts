import { and, eq, sql } from 'drizzle-orm'
import { unprocessable } from '../common/errors'
import type { DbOrTx } from '../db/client'
import { items, stockLevels } from '../db/schema'

/**
 * Changes a store's quantity of an item. Taking stock out is one guarded UPDATE, so two
 * people issuing the last cartons at the same moment cannot both succeed (the CHECK
 * constraint on stock_levels is the backstop).
 */
export async function changeStock(tx: DbOrTx, itemId: string, officeId: string, delta: number) {
  if (delta === 0) return
  if (delta > 0) {
    await tx
      .insert(stockLevels)
      .values({ itemId, officeId, qty: delta })
      .onConflictDoUpdate({ target: [stockLevels.itemId, stockLevels.officeId], set: { qty: sql`${stockLevels.qty} + ${delta}` } })
    return
  }
  const r = await tx
    .update(stockLevels)
    .set({ qty: sql`${stockLevels.qty} + ${delta}` })
    .where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.officeId, officeId), sql`${stockLevels.qty} >= ${-delta}`))
    .returning({ qty: stockLevels.qty })
  if (r.length === 0) {
    const [have] = await tx.select({ qty: stockLevels.qty }).from(stockLevels).where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.officeId, officeId)))
    const [it] = await tx.select({ code: items.code, nameAr: items.nameAr, nameEn: items.nameEn }).from(items).where(eq(items.id, itemId))
    throw unprocessable(
      'INSUFFICIENT_STOCK',
      { ar: `المخزون غير كافٍ للصنف ${it?.nameAr ?? itemId}: المتاح ${have?.qty ?? 0}`, en: `Not enough stock of ${it?.nameEn ?? itemId}: ${have?.qty ?? 0} available` },
      { itemId, available: have?.qty ?? 0, requested: -delta },
    )
  }
}

/** Value of a quantity at the item's book value, in USD cents. */
export const valueCents = (qty: number, unitCents: number) => qty * unitCents

export const today = () => new Date().toISOString().slice(0, 10)
