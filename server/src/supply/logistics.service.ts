import { Inject, Injectable } from '@nestjs/common'
import { asc, desc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { fuelLogs, offices, vehicles } from '../db/schema'
import { today } from './stock'
import type { fuelBody, vehicleBody, vehiclePatch } from './supply.schemas'

@Injectable()
export class LogisticsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(user: AuthUser) {
    const limited = scopeOffice(user)
    const rows = await this.db.select().from(vehicles).where(limited ? eq(vehicles.officeId, limited) : undefined).orderBy(asc(vehicles.plate))
    return rows.map((v) => ({ ...v, serviceDue: v.nextServiceKm !== null && v.odometer >= v.nextServiceKm - 500, kmToService: v.nextServiceKm === null ? null : v.nextServiceKm - v.odometer }))
  }

  async get(user: AuthUser, id: string) {
    const [v] = await this.db.select().from(vehicles).where(eq(vehicles.id, id))
    const limited = scopeOffice(user)
    if (!v || (limited && v.officeId !== limited)) throw notFound({ ar: 'المركبة', en: 'Vehicle' })
    const fuel = await this.db.select().from(fuelLogs).where(eq(fuelLogs.vehicleId, id)).orderBy(desc(fuelLogs.date), desc(fuelLogs.odometer))
    return { ...v, fuel }
  }

  async create(user: AuthUser, b: z.infer<typeof vehicleBody>) {
    const officeId = b.officeId ?? user.officeId
    const limited = scopeOffice(user)
    if (limited && officeId !== limited) throw forbidden()
    return this.db.transaction(async (tx) => {
      const [o] = await tx.select({ id: offices.id }).from(offices).where(eq(offices.id, officeId))
      if (!o) throw notFound({ ar: 'المكتب', en: 'Office' })
      const [dup] = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.plate, b.plate))
      if (dup) throw conflict('PLATE_EXISTS', { ar: 'رقم اللوحة مسجّل', en: 'This plate is already registered' })
      const [v] = await tx.insert(vehicles).values({ ...b, officeId, driver: b.driver ?? null, nextServiceKm: b.nextServiceKm ?? null }).returning()
      await audit(tx, user, 'vehicle.create', 'vehicle', v.id, { plate: v.plate })
      return v
    })
  }

  async update(user: AuthUser, id: string, b: z.infer<typeof vehiclePatch>) {
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for('update')
      const limited = scopeOffice(user)
      if (!cur || (limited && cur.officeId !== limited)) throw notFound({ ar: 'المركبة', en: 'Vehicle' })
      // A vehicle on a shipment's trip is set free by the receipt, not by hand.
      if (b.status && b.status !== cur.status && (cur.status === 'on_trip' || b.status === 'on_trip'))
        throw unprocessable('VEHICLE_TRIP_STATE', { ar: 'حالة «في رحلة» تتغير من الشحنة نفسها', en: 'The on-trip status is set by the shipment itself' })
      const [v] = await tx.update(vehicles).set(b).where(eq(vehicles.id, id)).returning()
      await audit(tx, user, 'vehicle.update', 'vehicle', id, b)
      return v
    })
  }

  async addFuel(user: AuthUser, id: string, b: z.infer<typeof fuelBody>) {
    return this.db.transaction(async (tx) => {
      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for('update')
      const limited = scopeOffice(user)
      if (!v || (limited && v.officeId !== limited)) throw notFound({ ar: 'المركبة', en: 'Vehicle' })
      if (b.odometer < v.odometer) throw unprocessable('ODOMETER_BACKWARDS', { ar: `قراءة العداد أقل من الأخيرة (${v.odometer})`, en: `The odometer is lower than the last reading (${v.odometer})` })
      const date = b.date ?? today()
      if (date > today()) throw unprocessable('FUTURE_DATE', { ar: 'لا يمكن استخدام تاريخ مستقبلي', en: 'The date cannot be in the future' })
      const [f] = await tx.insert(fuelLogs).values({ vehicleId: id, date, liters: b.liters, costSdg: b.costSdg, odometer: b.odometer, officeId: v.officeId, createdById: user.id }).returning()
      await tx.update(vehicles).set({ odometer: b.odometer }).where(eq(vehicles.id, id))
      await audit(tx, user, 'vehicle.fuel', 'vehicle', id, { liters: b.liters, odometer: b.odometer })
      return f
    })
  }

  /** Litres per 100 km between consecutive fills, per vehicle. */
  async consumption(user: AuthUser) {
    const limited = scopeOffice(user)
    const r = await this.db.execute(sql`
      select v.id, v.plate, sum(f.liters) as liters, sum(f.cost_sdg) as cost_sdg,
             max(f.odometer) - min(f.odometer) as km
      from vehicles v join fuel_logs f on f.vehicle_id = v.id
      ${limited ? sql`where v.office_id = ${limited}` : sql``}
      group by v.id order by v.plate`)
    return r.rows
  }
}
