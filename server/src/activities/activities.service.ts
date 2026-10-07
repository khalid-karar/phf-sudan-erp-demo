import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import { nextNo } from '../common/numbering'
import { isoDate, money } from '../common/zod'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { activities, budgetLines, fieldReports } from '../db/schema'

export const activityBody = z.object({
  code: z.string().trim().min(3).max(40).optional(), // generated when omitted
  officeId: z.string().optional(),
  lineId: z.string().min(1),
  titleAr: z.string().trim().min(1).max(300),
  titleEn: z.string().trim().min(1).max(300),
  type: z.enum(['medical_day', 'clinic', 'distribution', 'training', 'transport', 'awareness', 'other']).default('other'),
  plannedDate: isoDate,
  location: z.string().max(200).optional(),
  plannedUsd: money.optional(),
  inKind: z.boolean().default(false),
})

export const activityPatch = activityBody.omit({ code: true, officeId: true, lineId: true }).partial()

export const reportBody = z.object({
  clientId: z.string().min(8).max(80).optional(), // device-generated id; re-sending the same report is safe
  doneOn: isoDate.optional(),
  beneficiaries: z.number().int().min(0).max(1_000_000),
  men: z.number().int().min(0).optional(),
  women: z.number().int().min(0).optional(),
  children: z.number().int().min(0).optional(),
  summary: z.string().trim().min(3).max(5000),
  issues: z.string().max(5000).optional(),
  actualUsd: money.optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  via: z.enum(['online', 'offline', 'excel']).default('online'),
})

export const activityQuery = z.object({
  officeId: z.string().optional(),
  projectId: z.string().optional(),
  reported: z.enum(['yes', 'no']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

@Injectable()
export class ActivitiesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(user: AuthUser, q: z.infer<typeof activityQuery>) {
    const where: SQL[] = []
    const limited = scopeOffice(user)
    if (limited) where.push(eq(activities.officeId, limited))
    else if (q.officeId) where.push(eq(activities.officeId, q.officeId))
    if (q.projectId) where.push(eq(activities.projectId, q.projectId))
    if (q.reported === 'yes') where.push(sql`${fieldReports.id} is not null`)
    if (q.reported === 'no') where.push(sql`${fieldReports.id} is null`)
    const rows = await this.db
      .select({ a: activities, r: fieldReports, spentUsd: sql<string>`coalesce((select sum(jl.debit - jl.credit) from journal_lines jl join accounts ac on ac.code = jl.account_code where jl.activity_id = ${activities.id} and ac.type = 'expense'), 0)` })
      .from(activities)
      .leftJoin(fieldReports, eq(fieldReports.activityId, activities.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(activities.plannedDate))
      .limit(q.limit)
    return rows.map((x) => ({ ...x.a, report: x.r, spentUsd: x.spentUsd }))
  }

  async get(user: AuthUser, id: string) {
    const [x] = await this.db.select({ a: activities, r: fieldReports }).from(activities).leftJoin(fieldReports, eq(fieldReports.activityId, activities.id)).where(eq(activities.id, id))
    if (!x) throw notFound({ ar: 'النشاط', en: 'Activity' })
    const limited = scopeOffice(user)
    if (limited && x.a.officeId !== limited) throw notFound({ ar: 'النشاط', en: 'Activity' })
    return { ...x.a, report: x.r }
  }

  async create(user: AuthUser, b: z.infer<typeof activityBody>) {
    const officeId = b.officeId ?? user.officeId
    const limited = scopeOffice(user)
    if (limited && officeId !== limited) throw forbidden({ ar: 'يمكنك إضافة أنشطة لمكتبك فقط', en: 'You can only add activities for your own office' })
    return this.db.transaction(async (tx) => {
      const [line] = await tx.select().from(budgetLines).where(eq(budgetLines.id, b.lineId))
      if (!line) throw notFound({ ar: 'البند', en: 'Budget line' })
      const code = b.code ?? (await nextNo(tx, `ACT-${officeId.toUpperCase()}`, 3))
      const [a] = await tx
        .insert(activities)
        .values({ code, officeId, projectId: line.projectId, lineId: line.id, titleAr: b.titleAr, titleEn: b.titleEn, type: b.type, plannedDate: b.plannedDate, location: b.location ?? null, plannedUsd: b.plannedUsd ?? null, inKind: b.inKind, createdById: user.id })
        .returning()
      await audit(tx, user, 'activity.create', 'activity', a.id, { code })
      return a
    })
  }

  /** Edits what was planned. The office and code never change; the budget line can't move once a report or spending exists. */
  async update(user: AuthUser, id: string, b: z.infer<typeof activityPatch>) {
    return this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(activities).where(eq(activities.id, id)).for('update')
      if (!a) throw notFound({ ar: 'النشاط', en: 'Activity' })
      const limited = scopeOffice(user)
      if (limited && a.officeId !== limited) throw forbidden({ ar: 'النشاط لا يتبع مكتبك', en: 'This activity belongs to another office' })
      const [row] = await tx.update(activities).set(b).where(eq(activities.id, id)).returning()
      await audit(tx, user, 'activity.update', 'activity', id, { fields: Object.keys(b) })
      return row
    })
  }

  /** Submits the field report. Idempotent by clientId, so an offline device can safely re-send. */
  async submitReport(user: AuthUser, activityId: string, b: z.infer<typeof reportBody>) {
    return this.db.transaction(async (tx) => {
      // Locking the activity serialises re-sends of the same report from a device.
      const [a] = await tx.select().from(activities).where(eq(activities.id, activityId)).for('update')
      if (!a) throw notFound({ ar: 'النشاط', en: 'Activity' })
      const limited = scopeOffice(user)
      if (limited && a.officeId !== limited) throw forbidden({ ar: 'النشاط لا يتبع مكتبك', en: 'This activity belongs to another office' })
      if (b.clientId) {
        const [dup] = await tx.select().from(fieldReports).where(eq(fieldReports.clientId, b.clientId))
        if (dup) {
          if (dup.activityId !== activityId) throw conflict('CLIENT_ID_REUSED', { ar: 'معرّف الجهاز مستخدم لنشاط آخر', en: 'This device id was used for another activity' })
          return { ...dup, duplicate: true }
        }
      }
      const sum = (b.men ?? 0) + (b.women ?? 0) + (b.children ?? 0)
      if (sum > 0 && sum !== b.beneficiaries)
        throw unprocessable('BENEFICIARY_SPLIT', { ar: 'مجموع الرجال والنساء والأطفال لا يساوي عدد المستفيدين', en: 'Men + women + children does not equal the beneficiary total' })
      const [existing] = await tx.select({ id: fieldReports.id }).from(fieldReports).where(eq(fieldReports.activityId, activityId))
      if (existing) throw conflict('REPORT_EXISTS', { ar: 'رُفع تقرير هذا النشاط مسبقاً', en: 'This activity already has a report' })
      const no = await nextNo(tx, 'TR')
      const [r] = await tx.insert(fieldReports).values({ ...b, no, activityId, submittedById: user.id }).returning()
      await audit(tx, user, 'report.submit', 'field_report', r.id, { activity: a.code, no, via: b.via })
      return { ...r, duplicate: false }
    })
  }

  /** Technical vs financial matching: spending with no report, and reports with no spending. */
  async matching(user: AuthUser) {
    const limited = scopeOffice(user)
    const officeFilter = limited ? sql`and a.office_id = ${limited}` : sql``
    const spentNoReport = await this.db.execute(sql`
      select a.id, a.code, a.office_id, a.title_ar, a.title_en, sum(jl.debit - jl.credit) as spent_usd, min(je.date) as first_spent
      from journal_lines jl
        join journal_entries je on je.id = jl.entry_id
        join accounts ac on ac.code = jl.account_code and ac.type = 'expense'
        join activities a on a.id = jl.activity_id
        left join field_reports fr on fr.activity_id = a.id
      where fr.id is null ${officeFilter}
      group by a.id order by first_spent`)
    const reportNoSpend = await this.db.execute(sql`
      select a.id, a.code, a.office_id, a.title_ar, a.title_en, fr.no as report_no, fr.submitted_at
      from activities a join field_reports fr on fr.activity_id = a.id
      where not a.in_kind ${officeFilter}
        and not exists (select 1 from journal_lines jl join accounts ac on ac.code = jl.account_code
                        where jl.activity_id = a.id and ac.type = 'expense')
        and not exists (select 1 from advances ad where ad.activity_id = a.id and ad.status = 'open')
      order by fr.submitted_at`)
    return { spentWithoutReport: spentNoReport.rows, reportWithoutSpending: reportNoSpend.rows }
  }
}
