import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { can, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { indicators, objectives, projectReportEvents, projectReports, projects, projectTeam, reportTemplates, sectors, type TemplateField } from '../db/schema'
import { projectUsage } from '../budget/usage'
import { fromCents } from '../lib/money'
import { daysBetween, today } from './periods'
import { ensureSlots } from './slots'
import * as s from './programme.schemas'
import { parse } from './parse'

type Report = typeof projectReports.$inferSelect
type Content = Record<string, unknown>

/** Which project-team role prepares each kind of report. */
const OWNER_ROLE = { statistics: 'project_manager', quarterly: 'project_manager', narrative: 'project_coordinator', custom: 'project_office' } as const
const EDITABLE = ['open', 'draft', 'returned'] as const
const rows = async <T>(db: DbOrTx, q: SQL) => (await db.execute(q)).rows as T[]

@Injectable()
export class ProjectReportsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ─── the reporting calendar ───────────────────────────────────────────────

  /** See slots.ts. */
  ensureSlots(db: DbOrTx, projectId?: string, reschedule = false) {
    return ensureSlots(db, projectId, reschedule)
  }

  // ─── who prepares what ────────────────────────────────────────────────────

  /** The project-team members who prepare this report (empty when the project has nobody in that role). */
  private async owners(db: DbOrTx, r: Pick<Report, 'projectId' | 'type' | 'sectorId'>): Promise<string[]> {
    const team = await db.select({ userId: projectTeam.userId, sectorId: projectTeam.sectorId }).from(projectTeam).where(and(eq(projectTeam.projectId, r.projectId), eq(projectTeam.role, OWNER_ROLE[r.type])))
    return team.filter((t) => r.type !== 'custom' || !r.sectorId || !t.sectorId || t.sectorId === r.sectorId).map((t) => t.userId)
  }

  private async canPrepare(user: AuthUser, r: Report) {
    if (can(user, 'reports', 'manage')) return true
    if (!can(user, 'reports', 'edit')) return false
    const owners = await this.owners(this.db, r)
    return owners.length === 0 || owners.includes(user.id)
  }

  // ─── lists and detail ─────────────────────────────────────────────────────

  private shape(r: Report, p: { code: string; nameAr: string; nameEn: string; donorId: string | null }, owners: string[]) {
    const open = (EDITABLE as readonly string[]).includes(r.status)
    const left = daysBetween(today(), r.due)
    return {
      id: r.id, projectId: r.projectId, projectCode: p.code, projectNameAr: p.nameAr, projectNameEn: p.nameEn, donorId: p.donorId,
      type: r.type, period: r.period, periodStart: r.periodStart, periodEnd: r.periodEnd, due: r.due, sectorId: r.sectorId, templateId: r.templateId,
      status: r.status, ownerIds: owners, overdue: open && left < 0, daysLeft: left,
      submittedAt: r.submittedAt, reviewedAt: r.reviewedAt, reviewNote: r.reviewNote, releasedAt: r.releasedAt,
    }
  }

  async list(user: AuthUser, q: z.infer<typeof s.reportQuery>) {
    await this.ensureSlots(this.db)
    const conds: SQL[] = []
    if (q.projectId) conds.push(eq(projectReports.projectId, q.projectId))
    if (q.type) conds.push(eq(projectReports.type, q.type))
    if (q.status) conds.push(eq(projectReports.status, q.status))
    if (q.period) conds.push(eq(projectReports.period, q.period))
    if (q.waiting) conds.push(eq(projectReports.status, 'submitted'))
    const list = await this.db
      .select({ r: projectReports, p: { code: projects.code, nameAr: projects.nameAr, nameEn: projects.nameEn, donorId: projects.donorId } })
      .from(projectReports)
      .innerJoin(projects, eq(projects.id, projectReports.projectId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(projectReports.periodEnd), asc(projectReports.type))
      .limit(1500)
    const team = await this.db.select().from(projectTeam)
    const out = list.map(({ r, p }) => {
      const owners = team.filter((t) => t.projectId === r.projectId && t.role === OWNER_ROLE[r.type] && (r.type !== 'custom' || !r.sectorId || !t.sectorId || t.sectorId === r.sectorId)).map((t) => t.userId)
      return this.shape(r, p, owners)
    })
    return q.mine ? out.filter((x) => x.ownerIds.includes(user.id)) : out
  }

  private async load(db: DbOrTx, id: string) {
    const [x] = await db
      .select({ r: projectReports, p: { code: projects.code, nameAr: projects.nameAr, nameEn: projects.nameEn, donorId: projects.donorId } })
      .from(projectReports)
      .innerJoin(projects, eq(projects.id, projectReports.projectId))
      .where(eq(projectReports.id, id))
    if (!x) throw notFound({ ar: 'التقرير', en: 'Report' })
    return x
  }

  /** One report with the numbers the system holds for its period, the template and the history. */
  async detail(db: DbOrTx, id: string, internal = true) {
    const { r, p } = await this.load(db, id)
    const owners = await this.owners(db, r)
    const frozen = (r.content as Content).snapshot as Content | undefined
    const data = frozen && !(EDITABLE as readonly string[]).includes(r.status) ? frozen : await this.data(db, r)
    const [tpl] = r.templateId ? await db.select().from(reportTemplates).where(eq(reportTemplates.id, r.templateId)) : []
    const objs = await db.select().from(objectives).where(eq(objectives.projectId, r.projectId)).orderBy(asc(objectives.sort), asc(objectives.code))
    const events = internal ? await db.select().from(projectReportEvents).where(eq(projectReportEvents.reportId, id)).orderBy(asc(projectReportEvents.id)) : []
    const { snapshot: _s, ...content } = r.content as Content
    const out = { ...this.shape(r, p, owners), content, data, template: tpl ?? null, objectives: objs.map((o) => ({ id: o.id, code: o.code, nameAr: o.nameAr, nameEn: o.nameEn, sectorId: o.sectorId })) }
    return internal ? { ...out, events: events.map((e) => ({ at: e.at, userId: e.userId, action: e.action, note: e.note })) } : out
  }

  get(id: string) {
    return this.detail(this.db, id)
  }

  // ─── numbers from the system ──────────────────────────────────────────────

  /** What the system itself knows about the report's period: field-report totals, services given and indicator values. */
  async data(db: DbOrTx, r: Pick<Report, 'projectId' | 'type' | 'period' | 'periodStart' | 'periodEnd'>): Promise<Content> {
    const { projectId: pid, periodStart: from, periodEnd: to } = r
    const [fr] = await rows<{ n: number; ben: number; men: number; women: number; children: number }>(
      db,
      sql`select count(*)::int as n, coalesce(sum(fr.beneficiaries),0)::int as ben, coalesce(sum(fr.men),0)::int as men, coalesce(sum(fr.women),0)::int as women, coalesce(sum(fr.children),0)::int as children
          from field_reports fr join activities a on a.id = fr.activity_id
          where a.project_id = ${pid} and coalesce(fr.done_on, fr.submitted_at::date) between ${from}::date and ${to}::date`,
    )
    const [sv] = await rows<{ services: number; served: number; men: number; women: number }>(
      db,
      sql`select count(*)::int as services, count(distinct bs.beneficiary_id)::int as served,
                 count(distinct bs.beneficiary_id) filter (where b.gender = 'm')::int as men, count(distinct bs.beneficiary_id) filter (where b.gender = 'f')::int as women
          from beneficiary_services bs join activities a on a.id = bs.activity_id join beneficiaries b on b.id = bs.beneficiary_id
          where a.project_id = ${pid} and bs.date between ${from}::date and ${to}::date`,
    )
    const byService = await rows<{ type: string; n: number }>(db, sql`select bs.type::text as type, count(*)::int as n from beneficiary_services bs join activities a on a.id = bs.activity_id where a.project_id = ${pid} and bs.date between ${from}::date and ${to}::date group by 1 order by 2 desc`)
    const byOffice = await rows<{ office_id: string; n: number }>(db, sql`select a.office_id, count(*)::int as n from field_reports fr join activities a on a.id = fr.activity_id where a.project_id = ${pid} and coalesce(fr.done_on, fr.submitted_at::date) between ${from}::date and ${to}::date group by 1 order by 2 desc`)

    // Indicator values: counted over the period, and over the whole project so far.
    const inds = await db.select({ i: indicators }).from(indicators).innerJoin(objectives, eq(objectives.id, indicators.objectiveId)).where(eq(objectives.projectId, pid)).orderBy(asc(objectives.sort), asc(indicators.sort))
    const count = async (source: string, objectiveId: string, f: string, t: string) => {
      if (source === 'beneficiaries') return (await rows<{ n: number }>(db, sql`select count(distinct bs.beneficiary_id)::int as n from beneficiary_services bs join activities a on a.id = bs.activity_id where a.objective_id = ${objectiveId} and bs.date between ${f}::date and ${t}::date`))[0].n
      if (source === 'services') return (await rows<{ n: number }>(db, sql`select count(*)::int as n from beneficiary_services bs join activities a on a.id = bs.activity_id where a.objective_id = ${objectiveId} and bs.date between ${f}::date and ${t}::date`))[0].n
      if (source === 'activities') return (await rows<{ n: number }>(db, sql`select count(*)::int as n from field_reports fr join activities a on a.id = fr.activity_id where a.objective_id = ${objectiveId} and coalesce(fr.done_on, fr.submitted_at::date) between ${f}::date and ${t}::date`))[0].n
      if (source === 'field_beneficiaries') return (await rows<{ n: number }>(db, sql`select coalesce(sum(fr.beneficiaries),0)::int as n from field_reports fr join activities a on a.id = fr.activity_id where a.objective_id = ${objectiveId} and coalesce(fr.done_on, fr.submitted_at::date) between ${f}::date and ${t}::date`))[0].n
      return null
    }
    const [proj] = await db.select({ start: projects.startDate }).from(projects).where(eq(projects.id, pid))
    const indicatorRows = []
    for (const { i } of inds) {
      const auto = i.source === 'manual' ? null : await count(i.source, i.objectiveId, from, to)
      const cumulative = i.source === 'manual' ? null : await count(i.source, i.objectiveId, proj.start, to)
      indicatorRows.push({ id: i.id, objectiveId: i.objectiveId, code: i.code, nameAr: i.nameAr, nameEn: i.nameEn, unit: i.unit, target: i.target === null ? null : Number(i.target), source: i.source, auto, cumulative })
    }

    const out: Content = {
      fieldReports: fr, services: sv, byService, byOffice: byOffice.map((x) => ({ officeId: x.office_id, reports: x.n })), indicators: indicatorRows,
    }
    if (r.type === 'quarterly') {
      // Manual indicator values come from the three monthly statistics reports; the budget position is today's.
      const months = await db.select({ period: projectReports.period, status: projectReports.status, content: projectReports.content }).from(projectReports).where(and(eq(projectReports.projectId, pid), eq(projectReports.type, 'statistics'), sql`${projectReports.periodStart} >= ${from}::date and ${projectReports.periodEnd} <= ${to}::date`)).orderBy(asc(projectReports.period))
      const manual: Record<string, number> = {}
      for (const m of months)
        if (['submitted', 'approved', 'released'].includes(m.status)) for (const [k, v] of Object.entries(((m.content as Content).values ?? {}) as Record<string, number | null>)) if (typeof v === 'number') manual[k] = (manual[k] ?? 0) + v
      out.monthly = months.map((m) => ({ period: m.period, status: m.status }))
      out.manualTotals = manual
      const u = await projectUsage(db, pid)
      out.finance = { ceilingUsd: fromCents(u.project.ceiling), spentUsd: fromCents(u.project.spent), committedUsd: fromCents(u.project.committed), availableUsd: fromCents(u.project.available) }
    }
    return out
  }

  // ─── writing ──────────────────────────────────────────────────────────────

  private async template(db: DbOrTx, id: string | null) {
    if (!id) return null
    const [t] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id))
    return t ?? null
  }

  private async validate(db: DbOrTx, r: Report, raw: Content, forSubmit: boolean): Promise<Content> {
    const bad = (code: string, ar: string, en: string) => unprocessable(code, { ar, en })
    switch (r.type) {
      case 'statistics': {
        const c = parse(s.statisticsContent, raw)
        const ids = new Set((await db.select({ id: indicators.id }).from(indicators).innerJoin(objectives, eq(objectives.id, indicators.objectiveId)).where(eq(objectives.projectId, r.projectId))).map((x) => x.id))
        for (const k of Object.keys(c.values)) if (!ids.has(k)) throw bad('INDICATOR', 'مؤشر لا يتبع هذا المشروع', 'An indicator does not belong to this project')
        return c
      }
      case 'narrative': {
        const c = parse(s.narrativeContent, raw)
        const ids = new Set((await db.select({ id: objectives.id }).from(objectives).where(eq(objectives.projectId, r.projectId))).map((x) => x.id))
        for (const x of c.sections) if (!ids.has(x.objectiveId)) throw bad('OBJECTIVE', 'هدف لا يتبع هذا المشروع', 'An objective does not belong to this project')
        if (forSubmit && !c.summary.trim()) throw bad('SUMMARY_REQUIRED', 'اكتب الملخص قبل الإرسال', 'Write the summary before submitting')
        return c
      }
      case 'quarterly': {
        const c = parse(s.quarterlyContent, raw)
        if (forSubmit && !c.summary.trim()) throw bad('SUMMARY_REQUIRED', 'اكتب الملخص قبل الإرسال', 'Write the summary before submitting')
        return c
      }
      case 'custom': {
        const c = parse(s.customContent, raw)
        const tpl = await this.template(db, r.templateId)
        if (tpl) {
          const keys = new Set(tpl.fields.map((f) => f.key))
          for (const k of Object.keys(c.values)) if (!keys.has(k)) throw bad('FIELD', 'حقل غير موجود في النموذج', 'A field is not part of the template')
          for (const f of tpl.fields) this.checkField(f, c.values[f.key], forSubmit)
        }
        return c
      }
    }
  }

  private checkField(f: TemplateField, v: unknown, forSubmit: boolean) {
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) {
      if (forSubmit && f.required) throw unprocessable('FIELD_REQUIRED', { ar: `الحقل «${f.label.ar}» مطلوب`, en: `“${f.label.en}” is required` })
      return
    }
    const wrong = () => unprocessable('FIELD_TYPE', { ar: `قيمة غير صالحة في «${f.label.ar}»`, en: `Invalid value for “${f.label.en}”` })
    if (f.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) throw wrong()
    if ((f.type === 'text' || f.type === 'longtext' || f.type === 'date') && typeof v !== 'string') throw wrong()
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v as string)) throw wrong()
    if (f.type === 'choice' && (typeof v !== 'string' || !(f.options ?? []).includes(v))) throw wrong()
    if (f.type === 'table' && (!Array.isArray(v) || v.length > 200)) throw wrong()
  }

  private async lock(tx: DbOrTx, id: string) {
    const [r] = await tx.select().from(projectReports).where(eq(projectReports.id, id)).for('update')
    if (!r) throw notFound({ ar: 'التقرير', en: 'Report' })
    return r
  }

  async saveContent(user: AuthUser, id: string, raw: Content) {
    return this.db.transaction(async (tx) => {
      const r = await this.lock(tx, id)
      if (!(await this.canPrepare(user, r))) throw forbidden({ ar: 'هذا التقرير يعدّه فريق المشروع المعيّن له', en: 'This report is prepared by the team member assigned to it' })
      if (!(EDITABLE as readonly string[]).includes(r.status)) throw conflict('LOCKED', { ar: 'التقرير مرسل ولا يُعدَّل. اطلب من PMO إعادته', en: 'This report has been submitted. Ask the PMO to return it first' })
      const content = await this.validate(tx, r, raw, false)
      await tx.update(projectReports).set({ content, status: 'draft', updatedAt: new Date() }).where(eq(projectReports.id, id))
      return this.detail(tx, id)
    })
  }

  async submit(user: AuthUser, id: string) {
    const out = await this.db.transaction(async (tx) => {
      const r = await this.lock(tx, id)
      if (!(await this.canPrepare(user, r))) throw forbidden({ ar: 'هذا التقرير يعدّه فريق المشروع المعيّن له', en: 'This report is prepared by the team member assigned to it' })
      if (!(EDITABLE as readonly string[]).includes(r.status)) throw conflict('LOCKED', { ar: 'التقرير أُرسل من قبل', en: 'This report was already submitted' })
      const content = await this.validate(tx, r, r.content as Content, true)
      // The figures are frozen now, so the version PMO reviews is the one the donor later sees.
      const snapshot = await this.data(tx, r)
      await tx.update(projectReports).set({ content: { ...content, snapshot }, status: 'submitted', submittedAt: new Date(), submittedById: user.id, reviewedAt: null, reviewedById: null, reviewNote: null, updatedAt: new Date() }).where(eq(projectReports.id, id))
      await tx.insert(projectReportEvents).values({ reportId: id, userId: user.id, action: 'submit' })
      await audit(tx, user, 'project_report.submit', 'project_report', id, { type: r.type, period: r.period })
      return this.detail(tx, id)
    })
    return out
  }

  /** PMO decision on a submitted report: approve it, or return it with a reason. Not the person who submitted it. */
  async review(user: AuthUser, id: string, b: z.infer<typeof s.reviewBody>) {
    return this.db.transaction(async (tx) => {
      const r = await this.lock(tx, id)
      if (r.status !== 'submitted') throw conflict('NOT_SUBMITTED', { ar: 'التقرير ليس بانتظار المراجعة', en: 'This report is not waiting for review' })
      if (r.submittedById === user.id) throw forbidden({ ar: 'لا تراجع تقريراً أرسلته بنفسك', en: 'You cannot review a report you submitted yourself' })
      if (b.decision === 'return' && !b.note?.trim()) throw unprocessable('NOTE_REQUIRED', { ar: 'اكتب سبب الإعادة', en: 'Say why you are returning it' })
      const approve = b.decision === 'approve'
      await tx.update(projectReports).set({ status: approve ? 'approved' : 'returned', reviewedAt: new Date(), reviewedById: user.id, reviewNote: b.note?.trim() || null, updatedAt: new Date() }).where(eq(projectReports.id, id))
      await tx.insert(projectReportEvents).values({ reportId: id, userId: user.id, action: approve ? 'approve' : 'return', note: b.note?.trim() || null })
      await audit(tx, user, approve ? 'project_report.approve' : 'project_report.return', 'project_report', id, {})
      return this.detail(tx, id)
    })
  }

  /** Makes an approved report visible to the project's donor. */
  async release(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const { r, p } = await this.load(tx, id)
      if (r.status !== 'approved') throw conflict('NOT_APPROVED', { ar: 'لا يُفرج إلا عن تقرير معتمد', en: 'Only an approved report can be released' })
      if (!p.donorId) throw unprocessable('NO_DONOR', { ar: 'اربط المشروع بجهة مانحة أولاً', en: 'Link the project to a donor first' })
      await tx.update(projectReports).set({ status: 'released', releasedAt: new Date(), releasedById: user.id, updatedAt: new Date() }).where(eq(projectReports.id, id))
      await tx.insert(projectReportEvents).values({ reportId: id, userId: user.id, action: 'release' })
      await audit(tx, user, 'project_report.release', 'project_report', id, { donorId: p.donorId })
      return this.detail(tx, id)
    })
  }

  /** PMO pulls a released or approved report back for correction. */
  async reopen(user: AuthUser, id: string, note: string | undefined) {
    return this.db.transaction(async (tx) => {
      const r = await this.lock(tx, id)
      if (r.status !== 'approved' && r.status !== 'released') throw conflict('NOT_FINAL', { ar: 'يُسحب التقرير المعتمد أو المفرج عنه فقط', en: 'Only an approved or released report can be pulled back' })
      if (!note?.trim()) throw unprocessable('NOTE_REQUIRED', { ar: 'اكتب سبب السحب', en: 'Say why you are pulling it back' })
      await tx.update(projectReports).set({ status: 'returned', releasedAt: null, releasedById: null, reviewNote: note.trim(), updatedAt: new Date() }).where(eq(projectReports.id, id))
      await tx.insert(projectReportEvents).values({ reportId: id, userId: user.id, action: 'reopen', note: note.trim() })
      await audit(tx, user, 'project_report.reopen', 'project_report', id, {})
      return this.detail(tx, id)
    })
  }

  // ─── templates (custom report builder) ────────────────────────────────────

  listTemplates() {
    return this.db.select().from(reportTemplates).orderBy(asc(reportTemplates.createdAt))
  }

  private async checkTemplate(b: z.infer<typeof s.templateBody>) {
    const keys = b.fields.map((f) => f.key)
    if (new Set(keys).size !== keys.length) throw unprocessable('FIELD_KEYS', { ar: 'مفاتيح الحقول يجب ألا تتكرر', en: 'Field keys must be unique' })
    for (const f of b.fields) {
      if (f.type === 'choice' && !f.options?.length) throw unprocessable('CHOICE_OPTIONS', { ar: `حدد خيارات الحقل «${f.label.ar}»`, en: `Give “${f.label.en}” some options` })
      if (f.type === 'table' && !f.columns?.length) throw unprocessable('TABLE_COLUMNS', { ar: `حدد أعمدة الجدول «${f.label.ar}»`, en: `Give the table “${f.label.en}” some columns` })
    }
    if (b.sectorId) {
      const [x] = await this.db.select({ id: sectors.id }).from(sectors).where(eq(sectors.id, b.sectorId))
      if (!x) throw unprocessable('SECTOR', { ar: 'قطاع غير معروف', en: 'Unknown sector' })
    }
  }

  async createTemplate(user: AuthUser, b: z.infer<typeof s.templateBody>) {
    await this.checkTemplate(b)
    const [t] = await this.db.insert(reportTemplates).values({ nameAr: b.nameAr, nameEn: b.nameEn, sectorId: b.sectorId ?? null, fields: b.fields, active: b.active }).returning()
    await audit(this.db, user, 'report_template.create', 'report_template', t.id, {})
    await this.ensureSlots(this.db)
    return t
  }

  async updateTemplate(user: AuthUser, id: string, b: z.infer<typeof s.templateBody>) {
    await this.checkTemplate(b)
    const [t] = await this.db.update(reportTemplates).set({ nameAr: b.nameAr, nameEn: b.nameEn, sectorId: b.sectorId ?? null, fields: b.fields, active: b.active }).where(eq(reportTemplates.id, id)).returning()
    if (!t) throw notFound({ ar: 'النموذج', en: 'Template' })
    await audit(this.db, user, 'report_template.update', 'report_template', id, {})
    return t
  }
}
