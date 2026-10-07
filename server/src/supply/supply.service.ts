import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import { nextNo } from '../common/numbering'
import type { DbOrTx, Db } from '../db/client'
import { DB } from '../db/db.module'
import { accounts, activities, items, offices, shipmentLines, shipments, stockLevels, stockMoves, vehicles } from '../db/schema'
import { hqOfficeId, ledgerAccount, post, type PostLine } from '../ledger/posting'
import { fromCents, toCents } from '../lib/money'
import { changeStock, today, valueCents } from './stock'
import type { alertQuery, issueBody, itemBody, itemPatch, moveQuery, receiptBody, receiveBody, shipmentBody, shipmentQuery, stockQuery, dispatchBody, writeOffBody } from './supply.schemas'

/** Expense account an issued item posts to, unless the item names its own. */
const CATEGORY_ACCOUNT = { nutrition: '5104', medicine: '5102', medical_supply: '5102', equipment: '5299' } as const

type Item = typeof items.$inferSelect

@Injectable()
export class SupplyService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ─── helpers ───────────────────────────────────────────────────────────────

  /** The store a request acts on: the user's own office unless they see all offices. */
  private storeFor(user: AuthUser, requested?: string) {
    const limited = scopeOffice(user)
    const officeId = requested ?? user.officeId
    if (limited && officeId !== limited) throw forbidden({ ar: 'يمكنك التعامل مع مخزن مكتبك فقط', en: 'You can only work with your own office’s store' })
    return officeId
  }

  private async assertOffice(tx: DbOrTx, officeId: string) {
    const [o] = await tx.select({ id: offices.id, active: offices.active }).from(offices).where(eq(offices.id, officeId))
    if (!o || !o.active) throw notFound({ ar: 'المكتب', en: 'Office' })
  }

  private checkDate(date?: string) {
    const d = date ?? today()
    if (d > today()) throw unprocessable('FUTURE_DATE', { ar: 'لا يمكن استخدام تاريخ مستقبلي', en: 'The date cannot be in the future' })
    return d
  }

  private async loadItems(tx: DbOrTx, ids: string[]) {
    const unique = [...new Set(ids)]
    const rows = await tx.select().from(items).where(inArray(items.id, unique))
    const map = new Map(rows.map((r) => [r.id, r]))
    for (const id of unique) {
      const it = map.get(id)
      if (!it) throw notFound({ ar: 'الصنف', en: 'Item' })
      if (!it.active) throw unprocessable('ITEM_INACTIVE', { ar: `الصنف ${it.nameAr} موقوف`, en: `Item ${it.nameEn} is inactive` })
    }
    return map
  }

  private noDuplicateItems(lines: { itemId: string }[]) {
    if (new Set(lines.map((l) => l.itemId)).size !== lines.length)
      throw unprocessable('DUPLICATE_ITEM', { ar: 'الصنف مكرر في السطور', en: 'The same item appears twice' })
  }

  // ─── items ─────────────────────────────────────────────────────────────────

  listItems(includeInactive = false) {
    return this.db.select().from(items).where(includeInactive ? undefined : eq(items.active, true)).orderBy(asc(items.code))
  }

  async createItem(user: AuthUser, b: z.infer<typeof itemBody>) {
    return this.db.transaction(async (tx) => {
      const accountCode = b.expenseAccountCode ?? CATEGORY_ACCOUNT[b.category]
      await this.assertExpenseAccount(tx, accountCode)
      const [dup] = await tx.select({ id: items.id }).from(items).where(eq(items.code, b.code))
      if (dup) throw conflict('ITEM_CODE_EXISTS', { ar: 'رمز الصنف مستخدم', en: 'This item code is already used' })
      const [it] = await tx.insert(items).values({ ...b, expenseAccountCode: accountCode }).returning()
      await audit(tx, user, 'item.create', 'item', it.id, { code: it.code })
      return it
    })
  }

  async updateItem(user: AuthUser, id: string, b: z.infer<typeof itemPatch>) {
    return this.db.transaction(async (tx) => {
      if (b.expenseAccountCode) await this.assertExpenseAccount(tx, b.expenseAccountCode)
      const [it] = await tx.update(items).set(b).where(eq(items.id, id)).returning()
      if (!it) throw notFound({ ar: 'الصنف', en: 'Item' })
      await audit(tx, user, 'item.update', 'item', id, b)
      return it
    })
  }

  private async assertExpenseAccount(tx: DbOrTx, code: string) {
    const [a] = await tx.select().from(accounts).where(eq(accounts.code, code))
    if (!a || a.type !== 'expense' || !a.postable || !a.active)
      throw unprocessable('BAD_EXPENSE_ACCOUNT', { ar: `الحساب ${code} ليس حساب مصروف صالحاً`, en: `Account ${code} is not a usable expense account` })
  }

  // ─── stock views ───────────────────────────────────────────────────────────

  async stock(user: AuthUser, q: z.infer<typeof stockQuery>) {
    const limited = scopeOffice(user)
    const where: SQL[] = []
    if (limited) where.push(eq(stockLevels.officeId, limited))
    else if (q.officeId) where.push(eq(stockLevels.officeId, q.officeId))
    if (q.itemId) where.push(eq(stockLevels.itemId, q.itemId))
    if (q.below === 'min') where.push(sql`${stockLevels.qty} < ${items.minQty}`)
    const rows = await this.db
      .select({ itemId: stockLevels.itemId, officeId: stockLevels.officeId, qty: stockLevels.qty, minQty: items.minQty, unitValue: items.unitValue })
      .from(stockLevels)
      .innerJoin(items, eq(items.id, stockLevels.itemId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(stockLevels.officeId), asc(items.code))
    return rows.map((r) => ({ ...r, valueUsd: fromCents(valueCents(r.qty, toCents(r.unitValue))), belowMin: r.qty < r.minQty }))
  }

  async moves(user: AuthUser, q: z.infer<typeof moveQuery>) {
    const limited = scopeOffice(user)
    const where: SQL[] = []
    if (limited) where.push(eq(stockMoves.officeId, limited))
    else if (q.officeId) where.push(eq(stockMoves.officeId, q.officeId))
    if (q.itemId) where.push(eq(stockMoves.itemId, q.itemId))
    if (q.kind) where.push(eq(stockMoves.kind, q.kind))
    if (q.activityId) where.push(eq(stockMoves.activityId, q.activityId))
    return this.db
      .select()
      .from(stockMoves)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(stockMoves.date), desc(stockMoves.createdAt))
      .limit(q.limit)
      .offset(q.offset)
  }

  /** Low stock, stock that is about to expire, and vehicles due for service. */
  async alerts(user: AuthUser, q: z.infer<typeof alertQuery>) {
    const limited = scopeOffice(user)
    const office = limited ? sql`and sl.office_id = ${limited}` : sql``
    const low = await this.db.execute(sql`
      select sl.item_id, sl.office_id, sl.qty, i.min_qty, i.code, i.name_ar, i.name_en
      from stock_levels sl join items i on i.id = sl.item_id
      where i.active and sl.qty < i.min_qty ${office} order by sl.office_id, i.code`)
    // Batches are not tracked separately: a received batch is flagged while its store still holds the item.
    const expiring = await this.db.execute(sql`
      select m.id as move_id, m.item_id, m.office_id, m.qty as received_qty, m.expiry, m.ref, sl.qty as on_hand, i.code, i.name_ar, i.name_en,
             (m.expiry - current_date) as days_left
      from stock_moves m
        join items i on i.id = m.item_id
        join stock_levels sl on sl.item_id = m.item_id and sl.office_id = m.office_id
      where m.kind = 'receipt' and m.expiry is not null and sl.qty > 0
        and m.expiry <= current_date + ${q.expiryDays}::int ${limited ? sql`and m.office_id = ${limited}` : sql``}
      order by m.expiry`)
    return { lowStock: low.rows, expiring: expiring.rows }
  }

  // ─── receipts (in-kind replenishment) ──────────────────────────────────────

  async receive(user: AuthUser, b: z.infer<typeof receiptBody>) {
    const officeId = this.storeFor(user, b.officeId)
    const date = this.checkDate(b.date)
    this.noDuplicateItems(b.lines)
    return this.db.transaction(async (tx) => {
      await this.assertOffice(tx, officeId)
      const map = await this.loadItems(tx, b.lines.map((l) => l.itemId))
      const no = await nextNo(tx, 'GRN')
      const invAcc = await ledgerAccount(tx, 'inventory')
      const revAcc = await ledgerAccount(tx, 'inkind_revenue')
      const hq = await hqOfficeId(tx)
      let total = 0
      const ordered = [...b.lines].sort((x, y) => x.itemId.localeCompare(y.itemId))
      const pending: { l: (typeof b.lines)[number]; value: number }[] = []
      for (const l of ordered) {
        const value = valueCents(l.qty, toCents(map.get(l.itemId)!.unitValue))
        total += value
        pending.push({ l, value })
        await changeStock(tx, l.itemId, officeId, l.qty)
      }
      const entry = await post(tx, user, {
        date,
        memo: `In-kind receipt ${no} — ${b.source}`,
        source: 'stock',
        ref: no,
        lines: [
          { account: invAcc, debit: total, officeId },
          { account: revAcc, credit: total, officeId: hq },
        ],
      })
      for (const { l, value } of pending)
        await tx.insert(stockMoves).values({ no, kind: 'receipt', date, itemId: l.itemId, officeId, qty: l.qty, valueUsd: fromCents(value), ref: b.ref ?? no, source: b.source, expiry: l.expiry ?? null, entryId: entry.id, createdById: user.id })
      await audit(tx, user, 'stock.receive', 'stock_move', no, { officeId, lines: b.lines.length, valueUsd: fromCents(total) })
      return { no, entryNo: entry.no, valueUsd: fromCents(total) }
    })
  }

  // ─── issues to activities ──────────────────────────────────────────────────

  async issue(user: AuthUser, b: z.infer<typeof issueBody>) {
    const officeId = this.storeFor(user, b.officeId)
    const date = this.checkDate(b.date)
    this.noDuplicateItems(b.lines)
    return this.db.transaction(async (tx) => {
      const [act] = await tx.select().from(activities).where(eq(activities.id, b.activityId))
      if (!act) throw notFound({ ar: 'النشاط', en: 'Activity' })
      if (act.officeId !== officeId)
        throw unprocessable('ACTIVITY_OTHER_OFFICE', { ar: 'لا يمكن الصرف من مخزن مكتب لنشاط مكتب آخر', en: 'You cannot issue from one office’s store to another office’s activity' })
      const map = await this.loadItems(tx, b.lines.map((l) => l.itemId))
      const no = await nextNo(tx, 'ISS')
      const invAcc = await ledgerAccount(tx, 'inventory')
      const ordered = [...b.lines].sort((x, y) => x.itemId.localeCompare(y.itemId))
      const postLines: PostLine[] = []
      const moves: { l: (typeof b.lines)[number]; value: number }[] = []
      let total = 0
      for (const l of ordered) {
        const it = map.get(l.itemId)!
        const value = valueCents(l.qty, toCents(it.unitValue))
        total += value
        await changeStock(tx, l.itemId, officeId, -l.qty)
        postLines.push({ account: it.expenseAccountCode, debit: value, officeId, projectId: act.projectId, budgetLineId: act.lineId, activityId: act.id, memo: `${it.code} × ${l.qty}` })
        moves.push({ l, value })
      }
      postLines.push({ account: invAcc, credit: total, officeId })
      const entry = await post(tx, user, { date, memo: `In-kind issue ${no} — ${act.code}`, source: 'stock', ref: no, lines: postLines })
      for (const { l, value } of moves)
        await tx.insert(stockMoves).values({ no, kind: 'issue', date, itemId: l.itemId, officeId, qty: l.qty, valueUsd: fromCents(value), ref: act.code, activityId: act.id, entryId: entry.id, createdById: user.id })
      await audit(tx, user, 'stock.issue', 'stock_move', no, { officeId, activity: act.code, valueUsd: fromCents(total) })
      return { no, entryNo: entry.no, valueUsd: fromCents(total) }
    })
  }

  // ─── write-offs (damage, expiry, loss) ─────────────────────────────────────

  async writeOff(user: AuthUser, b: z.infer<typeof writeOffBody>) {
    const officeId = this.storeFor(user, b.officeId)
    const date = this.checkDate(b.date)
    return this.db.transaction(async (tx) => {
      const map = await this.loadItems(tx, [b.itemId])
      const it = map.get(b.itemId)!
      const no = await nextNo(tx, 'WO')
      const invAcc = await ledgerAccount(tx, 'inventory')
      await changeStock(tx, b.itemId, officeId, -b.qty)
      const value = valueCents(b.qty, toCents(it.unitValue))
      const entry = await post(tx, user, {
        date,
        memo: `Stock write-off ${no} — ${b.reason}`,
        source: 'stock',
        ref: no,
        lines: [
          { account: it.expenseAccountCode, debit: value, officeId },
          { account: invAcc, credit: value, officeId },
        ],
      })
      await tx.insert(stockMoves).values({ no, kind: 'loss', date, itemId: b.itemId, officeId, qty: b.qty, valueUsd: fromCents(value), ref: no, source: b.reason, entryId: entry.id, createdById: user.id })
      await audit(tx, user, 'stock.write_off', 'stock_move', no, { officeId, item: it.code, qty: b.qty, reason: b.reason })
      return { no, entryNo: entry.no, valueUsd: fromCents(value) }
    })
  }

  // ─── shipments ─────────────────────────────────────────────────────────────

  private canTouchShipment(user: AuthUser, s: { fromOfficeId: string; toOfficeId: string }) {
    const limited = scopeOffice(user)
    return !limited || limited === s.fromOfficeId || limited === s.toOfficeId
  }

  async listShipments(user: AuthUser, q: z.infer<typeof shipmentQuery>) {
    const where: SQL[] = []
    const limited = scopeOffice(user)
    if (limited) where.push(sql`(${shipments.fromOfficeId} = ${limited} or ${shipments.toOfficeId} = ${limited})`)
    else if (q.officeId) where.push(sql`(${shipments.fromOfficeId} = ${q.officeId} or ${shipments.toOfficeId} = ${q.officeId})`)
    if (q.status) where.push(eq(shipments.status, q.status))
    const rows = await this.db.select().from(shipments).where(where.length ? and(...where) : undefined).orderBy(desc(shipments.createdAt))
    if (!rows.length) return []
    const lines = await this.db.select().from(shipmentLines).where(inArray(shipmentLines.shipmentId, rows.map((r) => r.id)))
    return rows.map((s) => ({ ...s, lines: lines.filter((l) => l.shipmentId === s.id) }))
  }

  async getShipment(user: AuthUser, id: string) {
    const [s] = await this.db.select().from(shipments).where(eq(shipments.id, id))
    if (!s || !this.canTouchShipment(user, s)) throw notFound({ ar: 'الشحنة', en: 'Shipment' })
    const lines = await this.db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id))
    return { ...s, lines }
  }

  async createShipment(user: AuthUser, b: z.infer<typeof shipmentBody>) {
    const fromOfficeId = this.storeFor(user, b.fromOfficeId)
    if (fromOfficeId === b.toOfficeId) throw unprocessable('SAME_OFFICE', { ar: 'المصدر والوجهة مكتب واحد', en: 'Origin and destination are the same office' })
    this.noDuplicateItems(b.lines)
    return this.db.transaction(async (tx) => {
      await this.assertOffice(tx, fromOfficeId)
      await this.assertOffice(tx, b.toOfficeId)
      await this.loadItems(tx, b.lines.map((l) => l.itemId))
      if (b.vehicleId) await this.assertVehicleUsable(tx, b.vehicleId, false)
      const no = await nextNo(tx, 'SHP')
      const [s] = await tx
        .insert(shipments)
        .values({ no, fromOfficeId, toOfficeId: b.toOfficeId, vehicleId: b.vehicleId ?? null, driver: b.driver ?? null, note: b.note ?? null, createdById: user.id })
        .returning()
      await tx.insert(shipmentLines).values(b.lines.map((l) => ({ shipmentId: s.id, itemId: l.itemId, qty: l.qty })))
      await audit(tx, user, 'shipment.create', 'shipment', s.id, { no, from: fromOfficeId, to: b.toOfficeId })
      return s
    })
  }

  private async assertVehicleUsable(tx: DbOrTx, vehicleId: string, mustBeAvailable: boolean) {
    const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update')
    if (!v || !v.active) throw notFound({ ar: 'المركبة', en: 'Vehicle' })
    if (v.status === 'maintenance') throw unprocessable('VEHICLE_IN_MAINTENANCE', { ar: 'المركبة في الصيانة', en: 'The vehicle is in maintenance' })
    if (mustBeAvailable && v.status !== 'available') throw conflict('VEHICLE_BUSY', { ar: 'المركبة في رحلة أخرى', en: 'The vehicle is already on another trip' })
    return v
  }

  /** Goods leave the sending store: stock drops now, the books move when the other side confirms receipt. */
  async dispatch(user: AuthUser, id: string, b: z.infer<typeof dispatchBody>) {
    return this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(shipments).where(eq(shipments.id, id)).for('update')
      if (!s || !this.canTouchShipment(user, s)) throw notFound({ ar: 'الشحنة', en: 'Shipment' })
      const limited = scopeOffice(user)
      if (limited && limited !== s.fromOfficeId) throw forbidden({ ar: 'يرسل الشحنة مكتب المصدر فقط', en: 'Only the sending office can dispatch a shipment' })
      if (s.status !== 'preparing') throw conflict('SHIPMENT_STATE', { ar: 'الشحنة غادرت مسبقاً', en: 'This shipment has already left' })
      const vehicleId = b.vehicleId ?? s.vehicleId
      if (vehicleId) await this.assertVehicleUsable(tx, vehicleId, true)
      const lines = await tx.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)).orderBy(asc(shipmentLines.itemId))
      const map = await this.loadItems(tx, lines.map((l) => l.itemId))
      const no = await nextNo(tx, 'TRF')
      const date = today()
      for (const l of lines) {
        await changeStock(tx, l.itemId, s.fromOfficeId, -l.qty)
        const value = valueCents(l.qty, toCents(map.get(l.itemId)!.unitValue))
        await tx.insert(stockMoves).values({ no, kind: 'transfer_out', date, itemId: l.itemId, officeId: s.fromOfficeId, qty: l.qty, valueUsd: fromCents(value), ref: s.no, shipmentId: s.id, createdById: user.id })
      }
      if (vehicleId) await tx.update(vehicles).set({ status: 'on_trip' }).where(eq(vehicles.id, vehicleId))
      const [u] = await tx.update(shipments).set({ status: 'in_transit', departedAt: new Date(), vehicleId: vehicleId ?? null, driver: b.driver ?? s.driver }).where(eq(shipments.id, id)).returning()
      await audit(tx, user, 'shipment.dispatch', 'shipment', id, { no: s.no })
      return u
    })
  }

  /** The receiving store confirms what actually arrived; any shortfall is expensed as a loss. */
  async receiveShipment(user: AuthUser, id: string, b: z.infer<typeof receiveBody>) {
    return this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(shipments).where(eq(shipments.id, id)).for('update')
      if (!s || !this.canTouchShipment(user, s)) throw notFound({ ar: 'الشحنة', en: 'Shipment' })
      const limited = scopeOffice(user)
      if (limited && limited !== s.toOfficeId) throw forbidden({ ar: 'يستلم الشحنة مكتب الوجهة فقط', en: 'Only the receiving office can confirm a shipment' })
      if (s.status !== 'in_transit') throw conflict('SHIPMENT_STATE', { ar: 'الشحنة ليست في الطريق', en: 'This shipment is not in transit' })
      const lines = await tx.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)).orderBy(asc(shipmentLines.itemId))
      const given = new Map(b.lines.map((l) => [l.itemId, l.received]))
      for (const itemId of given.keys())
        if (!lines.some((l) => l.itemId === itemId)) throw unprocessable('NOT_IN_SHIPMENT', { ar: 'صنف غير موجود في الشحنة', en: 'That item is not part of this shipment' })
      // An item deactivated while in transit must still be receivable, so no active check here.
      const map = new Map((await tx.select().from(items).where(inArray(items.id, lines.map((l) => l.itemId)))).map((r) => [r.id, r]))
      const no = await nextNo(tx, 'TRF')
      const date = today()
      const invAcc = await ledgerAccount(tx, 'inventory')
      const postLines: PostLine[] = []
      let sentValue = 0
      let recvValue = 0
      for (const l of lines) {
        const it = map.get(l.itemId) as Item
        const received = given.get(l.itemId) ?? l.qty
        if (received > l.qty) throw unprocessable('OVER_RECEIPT', { ar: `الكمية المستلمة أكبر من المرسلة (${it.nameAr})`, en: `More received than was sent (${it.nameEn})` })
        const unit = toCents(it.unitValue)
        sentValue += valueCents(l.qty, unit)
        const rv = valueCents(received, unit)
        recvValue += rv
        const lost = l.qty - received
        if (received > 0) {
          await changeStock(tx, l.itemId, s.toOfficeId, received)
          await tx.insert(stockMoves).values({ no, kind: 'transfer_in', date, itemId: l.itemId, officeId: s.toOfficeId, qty: received, valueUsd: fromCents(rv), ref: s.no, shipmentId: s.id, createdById: user.id })
        }
        if (lost > 0) {
          const lv = valueCents(lost, unit)
          postLines.push({ account: it.expenseAccountCode, debit: lv, officeId: s.toOfficeId, memo: `Lost in transit: ${it.code} × ${lost}` })
          await tx.insert(stockMoves).values({ no, kind: 'loss', date, itemId: l.itemId, officeId: s.toOfficeId, qty: lost, valueUsd: fromCents(lv), ref: s.no, shipmentId: s.id, source: 'In transit', createdById: user.id })
        }
        await tx.update(shipmentLines).set({ received }).where(eq(shipmentLines.id, l.id))
      }
      postLines.push({ account: invAcc, debit: recvValue, officeId: s.toOfficeId }, { account: invAcc, credit: sentValue, officeId: s.fromOfficeId })
      const entry = await post(tx, user, { date, memo: `Shipment ${s.no} received`, source: 'transfer', ref: s.no, lines: postLines })
      if (s.vehicleId) {
        const [other] = await tx.select({ id: shipments.id }).from(shipments).where(and(eq(shipments.vehicleId, s.vehicleId), eq(shipments.status, 'in_transit'), sql`${shipments.id} <> ${s.id}`)).limit(1)
        if (!other) await tx.update(vehicles).set({ status: 'available' }).where(and(eq(vehicles.id, s.vehicleId), eq(vehicles.status, 'on_trip')))
      }
      const [u] = await tx.update(shipments).set({ status: 'delivered', deliveredAt: new Date(), receivedById: user.id, sentEntryId: entry.id, note: b.note ?? s.note }).where(eq(shipments.id, id)).returning()
      await audit(tx, user, 'shipment.receive', 'shipment', id, { no: s.no, shortValueUsd: fromCents(sentValue - recvValue) })
      return { ...u, shortValueUsd: fromCents(sentValue - recvValue) }
    })
  }
}
