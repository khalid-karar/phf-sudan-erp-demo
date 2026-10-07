import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte, lte, or, sql, between, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import { nextNo } from '../common/numbering'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { activities, beneficiaries, beneficiaryServices, offices } from '../db/schema'
import { digits, looksSame, nameKey, normName } from './names'
import type { beneficiaryBody, beneficiaryPatch, beneficiaryQuery, duplicateQuery, mergeBody, serviceBody, statsQuery } from './patients.schemas'

const today = () => new Date().toISOString().slice(0, 10)
type Ben = typeof beneficiaries.$inferSelect

@Injectable()
export class PatientsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async load(db: DbOrTx, user: AuthUser, id: string, lock = false) {
    const q = db.select().from(beneficiaries).where(eq(beneficiaries.id, id))
    const [b] = lock ? await q.for('update') : await q
    const limited = scopeOffice(user)
    if (!b || (limited && b.officeId !== limited)) throw notFound({ ar: 'المستفيد', en: 'Beneficiary' })
    return b
  }

  /** Possible duplicates across every office. Only what is needed to recognise the person is returned. */
  async findDuplicates(db: DbOrTx, p: { nameAr: string; nameEn?: string | null; birthYear: number; phone?: string | null }, exceptId?: string) {
    const phone = digits(p.phone)
    const cand = await db
      .select()
      .from(beneficiaries)
      .where(or(between(beneficiaries.birthYear, p.birthYear - 2, p.birthYear + 2), phone.length >= 7 ? eq(beneficiaries.phoneDigits, phone) : undefined))
    const me = { names: [normName(p.nameAr), normName(p.nameEn ?? '')].filter(Boolean), birthYear: p.birthYear, phone }
    return cand
      .filter((c) => c.id !== exceptId && looksSame(me, { names: [normName(c.nameAr), normName(c.nameEn ?? '')].filter(Boolean), birthYear: c.birthYear, phone: c.phoneDigits ?? '' }))
      .slice(0, 10)
      .map((c) => ({ id: c.id, no: c.no, nameAr: c.nameAr, nameEn: c.nameEn, birthYear: c.birthYear, gender: c.gender, officeId: c.officeId }))
  }

  duplicates(q: z.infer<typeof duplicateQuery>) {
    return this.findDuplicates(this.db, q)
  }

  async list(user: AuthUser, q: z.infer<typeof beneficiaryQuery>) {
    const where: SQL[] = []
    const limited = scopeOffice(user)
    if (limited) where.push(eq(beneficiaries.officeId, limited))
    else if (q.officeId) where.push(eq(beneficiaries.officeId, q.officeId))
    if (q.gender) where.push(eq(beneficiaries.gender, q.gender))
    if (q.service) where.push(sql`exists (select 1 from beneficiary_services s where s.beneficiary_id = ${beneficiaries.id} and s.type = ${q.service})`)
    if (q.q) {
      const k = '%' + normName(q.q) + '%'
      const d = digits(q.q)
      where.push(or(sql`${beneficiaries.nameKey} like ${k}`, sql`lower(${beneficiaries.no}) like ${'%' + q.q.toLowerCase() + '%'}`, d.length >= 4 ? sql`${beneficiaries.phoneDigits} like ${'%' + d + '%'}` : undefined)!)
    }
    const w = where.length ? and(...where) : undefined
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(beneficiaries).where(w)
    const rows = await this.db.select().from(beneficiaries).where(w).orderBy(desc(beneficiaries.registeredAt), desc(beneficiaries.no)).limit(q.limit).offset(q.offset)
    const counts = rows.length
      ? await this.db.execute<{ beneficiary_id: string; n: number; last: string; last_type: string }>(sql`
          select beneficiary_id, count(*)::int n, max(date)::text last,
            (array_agg(type order by date desc, created_at desc))[1] as last_type
          from beneficiary_services where beneficiary_id in (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)}) group by 1`)
      : { rows: [] }
    const by = new Map(counts.rows.map((c) => [c.beneficiary_id, c]))
    return { total: n, items: rows.map((r) => ({ ...r, nameKey: undefined, phoneDigits: undefined, services: by.get(r.id)?.n ?? 0, lastService: by.get(r.id)?.last ?? null, lastServiceType: by.get(r.id)?.last_type ?? null })) }
  }

  async get(user: AuthUser, id: string) {
    const b = await this.load(this.db, user, id)
    const services = await this.db.select().from(beneficiaryServices).where(eq(beneficiaryServices.beneficiaryId, id)).orderBy(desc(beneficiaryServices.date), desc(beneficiaryServices.createdAt))
    return { ...b, nameKey: undefined, phoneDigits: undefined, services }
  }

  private async checkService(tx: DbOrTx, officeId: string, s: { activityId?: string; date?: string }) {
    if (s.date && s.date > today()) throw unprocessable('FUTURE_DATE', { ar: 'لا يمكن استخدام تاريخ مستقبلي', en: 'The date cannot be in the future' })
    if (s.activityId) {
      const [a] = await tx.select({ officeId: activities.officeId }).from(activities).where(eq(activities.id, s.activityId))
      if (!a) throw notFound({ ar: 'النشاط', en: 'Activity' })
      if (a.officeId !== officeId) throw unprocessable('ACTIVITY_OTHER_OFFICE', { ar: 'النشاط يتبع مكتباً آخر', en: 'That activity belongs to another office' })
    }
  }

  async register(user: AuthUser, b: z.infer<typeof beneficiaryBody>) {
    const officeId = b.officeId ?? user.officeId
    const limited = scopeOffice(user)
    if (limited && officeId !== limited) throw forbidden({ ar: 'يمكنك التسجيل في مكتبك فقط', en: 'You can only register people at your own office' })
    return this.db.transaction(async (tx) => {
      const [o] = await tx.select({ id: offices.id }).from(offices).where(eq(offices.id, officeId))
      if (!o) throw notFound({ ar: 'المكتب', en: 'Office' })
      if (b.service) await this.checkService(tx, officeId, b.service)
      if (!b.confirmNotDuplicate) {
        // Serialise registrations of the same name so two clerks cannot both slip past the check.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'ben:' + nameKey(b.nameAr)}))`)
        const dup = await this.findDuplicates(tx, b)
        if (dup.length) throw conflict('DUPLICATE_SUSPECTED', { ar: 'قد يكون هذا الشخص مسجلاً مسبقاً', en: 'This person may already be registered' }, { matches: dup })
      }
      const no = await nextNo(tx, `BEN-${officeId.toUpperCase()}`, 5)
      const date = b.service?.date ?? today()
      const [row] = await tx
        .insert(beneficiaries)
        .values({
          no, nameAr: b.nameAr, nameEn: b.nameEn ?? null, nameKey: nameKey(b.nameAr, b.nameEn), gender: b.gender, birthYear: b.birthYear, officeId,
          locality: b.locality ?? null, displaced: b.displaced, phone: b.phone ?? null, phoneDigits: digits(b.phone) || null, registeredAt: date, registeredById: user.id,
        })
        .returning()
      if (b.service) await tx.insert(beneficiaryServices).values({ beneficiaryId: row.id, date, type: b.service.type, officeId, activityId: b.service.activityId ?? null, note: b.service.note ?? null, createdById: user.id })
      await audit(tx, user, 'beneficiary.register', 'beneficiary', row.id, { no, override: b.confirmNotDuplicate })
      return { ...row, nameKey: undefined, phoneDigits: undefined }
    })
  }

  async update(user: AuthUser, id: string, b: z.infer<typeof beneficiaryPatch>) {
    return this.db.transaction(async (tx) => {
      const cur = await this.load(tx, user, id, true)
      const next = { ...cur, ...b }
      const patch: Partial<Ben> = { ...b }
      if (b.nameAr !== undefined || b.nameEn !== undefined) patch.nameKey = nameKey(next.nameAr, next.nameEn)
      if (b.phone !== undefined) patch.phoneDigits = digits(b.phone) || null
      const [row] = await tx.update(beneficiaries).set(patch).where(eq(beneficiaries.id, id)).returning()
      await audit(tx, user, 'beneficiary.update', 'beneficiary', id, { fields: Object.keys(b) })
      return { ...row, nameKey: undefined, phoneDigits: undefined }
    })
  }

  async addService(user: AuthUser, id: string, b: z.infer<typeof serviceBody>) {
    return this.db.transaction(async (tx) => {
      // Staff at any office can record a service for a person who is already registered (they may be visiting).
      const [ben] = await tx.select().from(beneficiaries).where(eq(beneficiaries.id, id))
      if (!ben) throw notFound({ ar: 'المستفيد', en: 'Beneficiary' })
      const limited = scopeOffice(user)
      if (limited && ben.officeId !== limited) throw notFound({ ar: 'المستفيد', en: 'Beneficiary' })
      const officeId = user.officeId
      await this.checkService(tx, officeId, b)
      const date = b.date ?? today()
      if (date < ben.registeredAt) throw unprocessable('BEFORE_REGISTRATION', { ar: 'تاريخ الخدمة قبل التسجيل', en: 'The service date is before the registration date' })
      const [s] = await tx.insert(beneficiaryServices).values({ beneficiaryId: id, date, type: b.type, officeId, activityId: b.activityId ?? null, note: b.note ?? null, createdById: user.id }).returning()
      await audit(tx, user, 'beneficiary.service', 'beneficiary', id, { type: b.type })
      return s
    })
  }

  /** Folds a duplicate record into the one to keep. The duplicate's number is kept in the audit log. */
  async merge(user: AuthUser, id: string, b: z.infer<typeof mergeBody>) {
    if (id === b.intoId) throw unprocessable('MERGE_SELF', { ar: 'لا يمكن دمج السجل في نفسه', en: 'A record cannot be merged into itself' })
    return this.db.transaction(async (tx) => {
      // Lock in a fixed order so two merges in opposite directions cannot deadlock.
      const [first, second] = [id, b.intoId].sort()
      await this.load(tx, user, first, true)
      await this.load(tx, user, second, true)
      const dup = await this.load(tx, user, id)
      const keep = await this.load(tx, user, b.intoId)
      const moved = await tx.update(beneficiaryServices).set({ beneficiaryId: keep.id }).where(eq(beneficiaryServices.beneficiaryId, dup.id)).returning({ id: beneficiaryServices.id })
      // The kept record starts from the earliest registration, and fills any blanks from the duplicate.
      await tx
        .update(beneficiaries)
        .set({
          registeredAt: dup.registeredAt < keep.registeredAt ? dup.registeredAt : keep.registeredAt,
          phone: keep.phone ?? dup.phone,
          phoneDigits: keep.phoneDigits ?? dup.phoneDigits,
          nameEn: keep.nameEn ?? dup.nameEn,
          locality: keep.locality ?? dup.locality,
        })
        .where(eq(beneficiaries.id, keep.id))
      await tx.delete(beneficiaries).where(eq(beneficiaries.id, dup.id))
      await audit(tx, user, 'beneficiary.merge', 'beneficiary', keep.id, { mergedNo: dup.no, mergedId: dup.id, servicesMoved: moved.length })
      return { keptId: keep.id, keptNo: keep.no, servicesMoved: moved.length }
    })
  }

  /** Counts for the patients dashboard: who was reached, with what, where, and when. */
  async stats(user: AuthUser, q: z.infer<typeof statsQuery>) {
    const limited = scopeOffice(user)
    const office = limited ?? q.officeId
    const sWhere: SQL[] = []
    if (office) sWhere.push(eq(beneficiaryServices.officeId, office))
    if (q.from) sWhere.push(gte(beneficiaryServices.date, q.from))
    if (q.to) sWhere.push(lte(beneficiaryServices.date, q.to))
    const sw = sWhere.length ? and(...sWhere) : undefined
    const year = new Date().getUTCFullYear()
    const [reg] = await this.db
      .select({
        registered: sql<number>`count(*)::int`,
        women: sql<number>`count(*) filter (where gender = 'f')::int`,
        men: sql<number>`count(*) filter (where gender = 'm')::int`,
        children: sql<number>`count(*) filter (where ${sql.raw(String(year))} - birth_year < 18)::int`,
        elderly: sql<number>`count(*) filter (where ${sql.raw(String(year))} - birth_year >= 60)::int`,
        displaced: sql<number>`count(*) filter (where displaced)::int`,
      })
      .from(beneficiaries)
      .where(office ? eq(beneficiaries.officeId, office) : undefined)
    const byType = await this.db.select({ type: beneficiaryServices.type, n: sql<number>`count(*)::int` }).from(beneficiaryServices).where(sw).groupBy(beneficiaryServices.type)
    const byOffice = await this.db.select({ officeId: beneficiaryServices.officeId, n: sql<number>`count(*)::int`, people: sql<number>`count(distinct beneficiary_id)::int` }).from(beneficiaryServices).where(sw).groupBy(beneficiaryServices.officeId).orderBy(desc(sql`count(*)`))
    const byMonth = await this.db
      .select({ month: sql<string>`to_char(${beneficiaryServices.date}, 'YYYY-MM')`, n: sql<number>`count(*)::int` })
      .from(beneficiaryServices)
      .where(sw)
      .groupBy(sql`1`)
      .orderBy(sql`1`)
    const [tot] = await this.db.select({ services: sql<number>`count(*)::int`, people: sql<number>`count(distinct beneficiary_id)::int` }).from(beneficiaryServices).where(sw)
    const ben = office ? sql`where office_id = ${office}` : sql``
    const ages = (await this.db.execute<{ under5: number; a5_14: number; a15_49: number; over50: number }>(sql`
      select count(*) filter (where ${sql.raw(String(year))} - birth_year < 5)::int under5,
             count(*) filter (where ${sql.raw(String(year))} - birth_year between 5 and 14)::int a5_14,
             count(*) filter (where ${sql.raw(String(year))} - birth_year between 15 and 49)::int a15_49,
             count(*) filter (where ${sql.raw(String(year))} - birth_year >= 50)::int over50 from beneficiaries ${ben}`)).rows[0]
    const registeredByMonth = (await this.db.execute<{ month: string; n: number }>(sql`select to_char(registered_at, 'YYYY-MM') as month, count(*)::int n from beneficiaries ${ben} group by 1 order by 1`)).rows
    const registeredByOffice = (await this.db.execute<{ office_id: string; n: number }>(sql`select office_id, count(*)::int n from beneficiaries ${ben} group by 1 order by 2 desc`)).rows.map((r) => ({ officeId: r.office_id, n: r.n }))
    return { ...reg, services: tot.services, peopleServed: tot.people, byType, byOffice, byMonth, ages: { under5: ages.under5, a5_14: ages.a5_14, a15_49: ages.a15_49, over50: ages.over50 }, registeredByMonth, registeredByOffice }
  }
}
