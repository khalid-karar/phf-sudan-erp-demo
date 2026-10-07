import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { sql } from 'drizzle-orm'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let store: Client, fo: Client, foFsh: Client, fm: Client, hr: Client, log: Client
let ksl: { id: string; code: string; lineId: string; projectId: string }

const pool = createPool(process.env.DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test')
const db = createDb(pool)
const one = async <T = Record<string, string>>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows[0] as T

/** Stock value on hand + value still on the road must equal the inventory account. */
const inventoryBalances = async () => {
  const stock = await one<{ v: string }>(sql`select coalesce(sum(sl.qty * i.unit_value), 0) as v from stock_levels sl join items i on i.id = sl.item_id`)
  const road = await one<{ v: string }>(sql`select coalesce(sum(sl2.qty * i.unit_value), 0) as v from shipment_lines sl2 join shipments s on s.id = sl2.shipment_id join items i on i.id = sl2.item_id where s.status = 'in_transit'`)
  const ledger = await one<{ v: string }>(sql`select coalesce(sum(debit - credit), 0) as v from journal_lines where account_code = '1105'`)
  return { stock: Number(stock.v), road: Number(road.v), ledger: Number(ledger.v) }
}
const qty = async (item: string, office: string) => Number((await one<{ q: string }>(sql`select coalesce(sum(qty),0) as q from stock_levels where item_id = ${item} and office_id = ${office}`)).q)

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[store, fo, foFsh, fm, hr, log] = await Promise.all([ 'stores@kphfs.org', USERS.fieldOfficer, USERS.fieldOfficerFsh, USERS.financeManager, USERS.hr, 'logistics@kphfs.org' ].map((e) => Client.as(app, e)))
  const a = (await fo.get('/activities')).body.find((x: { code: string }) => x.code === 'ACT-KSL-0128')
  ksl = { id: a.id, code: a.code, lineId: a.lineId, projectId: a.projectId }
})
afterAll(async () => {
  await app?.close()
  await pool.end()
})

describe('stock and the books agree', () => {
  it('starts consistent: stock on hand + goods on the road = inventory account', async () => {
    const b = await inventoryBalances()
    expect(b.stock + b.road).toBeCloseTo(b.ledger, 2)
    expect(b.road).toBeGreaterThan(0) // the demo has a shipment in transit
  })

  it('a receipt adds stock and posts inventory / in-kind revenue', async () => {
    const before = await qty('i1', 'khr')
    const r = await store.post('/supply/receipts', { source: 'PHF Kuwait', lines: [{ itemId: 'i1', qty: 100 }] })
    expect(r.status).toBe(201)
    expect(r.body.valueUsd).toBe('2800.00') // 100 × $28
    expect(await qty('i1', 'khr')).toBe(before + 100)
    const b = await inventoryBalances()
    expect(b.stock + b.road).toBeCloseTo(b.ledger, 2)
  })

  it('an issue reduces stock, expenses to the activity line as in-kind, and not as cash spending', async () => {
    const lineBefore = (await fm.get(`/projects/${ksl.projectId}`)).body
    const find = (p: { pillars: { lines: { id: string; usage: { spent: string; inKind: string; available: string } }[] }[] }) => p.pillars.flatMap((x) => x.lines).find((l) => l.id === ksl.lineId)!
    const b0 = find(lineBefore)
    const before = await qty('i3', 'ksl')
    const r = await fo.post('/supply/issues', { activityId: ksl.id, lines: [{ itemId: 'i3', qty: 10 }] })
    expect(r.status).toBe(201)
    expect(r.body.valueUsd).toBe('60.00') // 10 × $6
    expect(await qty('i3', 'ksl')).toBe(before - 10)
    const b1 = find((await fm.get(`/projects/${ksl.projectId}`)).body)
    expect(Number(b1.usage.inKind) - Number(b0.usage.inKind)).toBe(60)
    expect(b1.usage.spent).toBe(b0.usage.spent)
    expect(b1.usage.available).toBe(b0.usage.available)
  })

  it('refuses to issue more than is in stock and changes nothing', async () => {
    const before = await qty('i3', 'ksl')
    const r = await fo.post('/supply/issues', { activityId: ksl.id, lines: [{ itemId: 'i3', qty: before + 1 }] })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('INSUFFICIENT_STOCK')
    expect(await qty('i3', 'ksl')).toBe(before)
  })

  it('two people issuing the last units at once cannot both succeed', async () => {
    const left = await qty('i3', 'ksl')
    const res = await Promise.all([1, 2].map(() => fo.post('/supply/issues', { activityId: ksl.id, lines: [{ itemId: 'i3', qty: left }] })))
    expect(res.map((r) => r.status).sort()).toEqual([201, 422])
    expect(await qty('i3', 'ksl')).toBe(0)
    const b = await inventoryBalances()
    expect(b.stock + b.road).toBeCloseTo(b.ledger, 2)
  })

  it('a write-off expenses the stock and keeps the books in step', async () => {
    const before = await qty('i1', 'khr')
    const r = await store.post('/supply/write-offs', { itemId: 'i1', qty: 5, reason: 'Water damage' })
    expect(r.status).toBe(201)
    expect(await qty('i1', 'khr')).toBe(before - 5)
    const b = await inventoryBalances()
    expect(b.stock + b.road).toBeCloseTo(b.ledger, 2)
  })
})

describe('who may do what', () => {
  it('keeps an office-scoped user inside their own store', async () => {
    expect((await fo.post('/supply/receipts', { officeId: 'khr', source: 'x', lines: [{ itemId: 'i1', qty: 1 }] })).status).toBe(403)
    const stock = (await fo.get('/supply/stock')).body
    expect(new Set(stock.map((s: { officeId: string }) => s.officeId))).toEqual(new Set(['ksl']))
  })

  it('rejects issuing from one office’s store to another office’s activity', async () => {
    const r = await foFsh.post('/supply/issues', { activityId: ksl.id, lines: [{ itemId: 'i1', qty: 1 }] })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('ACTIVITY_OTHER_OFFICE')
  })

  it('needs the module permission (HR has none for supply)', async () => {
    expect((await hr.get('/supply/stock')).status).toBe(403)
  })

  it('does not accept future dates or duplicate items', async () => {
    expect((await store.post('/supply/receipts', { source: 'x', date: '2999-01-01', lines: [{ itemId: 'i1', qty: 1 }] })).body.code).toBe('FUTURE_DATE')
    expect((await store.post('/supply/receipts', { source: 'x', lines: [{ itemId: 'i1', qty: 1 }, { itemId: 'i1', qty: 2 }] })).body.code).toBe('DUPLICATE_ITEM')
  })
})

describe('shipments', () => {
  let id = ''
  it('moves stock out at dispatch and books the transfer on receipt, expensing what was lost', async () => {
    const created = await store.post('/supply/shipments', { toOfficeId: 'ksl', vehicleId: 'v2', lines: [{ itemId: 'i2', qty: 20 }, { itemId: 'i1', qty: 10 }] })
    expect(created.status).toBe(201)
    id = created.body.id
    const khr0 = await qty('i2', 'khr')
    // nothing moves until it leaves
    expect(await qty('i2', 'khr')).toBe(khr0)
    const d = await store.post(`/supply/shipments/${id}/dispatch`, {})
    expect(d.status).toBe(201)
    expect(d.body.status).toBe('in_transit')
    expect(await qty('i2', 'khr')).toBe(khr0 - 20)
    expect((await log.get('/logistics/vehicles')).body.find((v: { id: string }) => v.id === 'v2').status).toBe('on_trip')
    let b = await inventoryBalances()
    expect(b.stock + b.road).toBeCloseTo(b.ledger, 2)

    const kslBefore = await qty('i2', 'ksl')
    // Only the receiving office can confirm, and only for what exists
    expect((await foFsh.post(`/supply/shipments/${id}/receive`, {})).status).toBe(404)
    expect((await fo.post(`/supply/shipments/${id}/receive`, { lines: [{ itemId: 'i2', received: 21 }] })).body.code).toBe('OVER_RECEIPT')
    const rec = await fo.post(`/supply/shipments/${id}/receive`, { lines: [{ itemId: 'i2', received: 18 }] })
    expect(rec.status).toBe(201)
    expect(rec.body.status).toBe('delivered')
    expect(rec.body.shortValueUsd).toBe('110.00') // 2 × $55
    expect(await qty('i2', 'ksl')).toBe(kslBefore + 18)
    b = await inventoryBalances()
    expect(b.stock + b.road).toBeCloseTo(b.ledger, 2) // the shortage left the books as an expense
    expect((await log.get('/logistics/vehicles')).body.find((v: { id: string }) => v.id === 'v2').status).toBe('available')
  })

  it('cannot be received twice or dispatched twice', async () => {
    expect((await fo.post(`/supply/shipments/${id}/receive`, {})).status).toBe(409)
    expect((await store.post(`/supply/shipments/${id}/dispatch`, {})).status).toBe(409)
  })

  it('will not dispatch more than the store holds', async () => {
    const s = await store.post('/supply/shipments', { toOfficeId: 'gdf', lines: [{ itemId: 'i10', qty: 1_000_000 }] })
    const d = await store.post(`/supply/shipments/${s.body.id}/dispatch`, {})
    expect(d.status).toBe(422)
    expect(d.body.code).toBe('INSUFFICIENT_STOCK')
    expect((await store.get(`/supply/shipments/${s.body.id}`)).body.status).toBe('preparing')
  })
})

describe('alerts and fleet', () => {
  it('lists items below their minimum', async () => {
    const a = await store.get('/supply/alerts')
    expect(a.status).toBe(200)
    expect(Array.isArray(a.body.lowStock)).toBe(true)
    expect(a.body.lowStock.every((x: { qty: number; min_qty: number }) => x.qty < x.min_qty)).toBe(true)
  })

  it('rejects a fuel fill with an odometer reading lower than the last', async () => {
    const v = (await log.get('/logistics/vehicles')).body[0]
    const bad = await log.post(`/logistics/vehicles/${v.id}/fuel`, { liters: '50', costSdg: '145000', odometer: v.odometer - 1 })
    expect(bad.status).toBe(422)
    const ok = await log.post(`/logistics/vehicles/${v.id}/fuel`, { liters: '50', costSdg: '145000', odometer: v.odometer + 120 })
    expect(ok.status).toBe(201)
    expect((await log.get(`/logistics/vehicles/${v.id}`)).body.odometer).toBe(v.odometer + 120)
  })

  it('does not let anyone set a vehicle on-trip by hand', async () => {
    const v = (await log.get('/logistics/vehicles')).body[0]
    expect((await log.patch(`/logistics/vehicles/${v.id}`, { status: 'on_trip' })).body.code).toBe('VEHICLE_TRIP_STATE')
  })
})
