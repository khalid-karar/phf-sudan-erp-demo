import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { can } from '../auth/auth-user'
import { openBlob } from '../attachments/files'
import { audit } from '../common/audit'
import { AppError, forbidden, notFound, unprocessable } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { attachments, hqDrafts, orgSettings, projects, reportSettings, roles, sentReports, users } from '../db/schema'
import { loadChannelConfigs } from '../notifications/engine.service'
import { notReady } from '../notifications/channels'
import { TRANSPORT, type Transport } from '../notifications/transports'
import { monthlyReport } from './monthly'
import type { Delivery, HqDelivery, deliveryQuery, draftBody, sendBody, sentQuery, settingsBody } from './reports.schemas'

const DEFAULT_SECTIONS = { finance: true, projects: true, activities: true, compliance: true, supply: true, hr: true, challenges: true, plan: true }

const defaultDelivery = (kind: 'hq' | 'donor'): Delivery =>
  kind === 'hq'
    ? {
        to: [],
        cc: [],
        subject: { ar: 'التقرير الشهري لمكتب السودان — {month}', en: 'Sudan office monthly report — {month}' },
        body: {
          ar: 'السادة / {hq} المحترمين،\nالسلام عليكم ورحمة الله وبركاته،\n\nنرفق لكم التقرير الشهري لمكتب السودان عن شهر {month}، ويتضمن الموقف المالي وتقدم المشاريع والأنشطة الميدانية وأعداد المستفيدين.\n\nوتفضلوا بقبول فائق الاحترام،\n{sender}\n{org}',
          en: 'Dear {hq},\n\nPlease find attached the Sudan office monthly report for {month}, covering the financial position, project progress, field activities and beneficiaries.\n\nKind regards,\n{sender}\n{org}',
        },
      }
    : {
        to: [],
        cc: [],
        subject: { ar: 'تقرير المشروع {project} — {period}', en: 'Project report {project} — {period}' },
        body: { ar: 'السادة / {donor} المحترمين،\n\nنرفق تقرير المشروع {project} عن الفترة {period}.\n\nمع التحية،\n{sender}\n{org}', en: 'Dear {donor},\n\nPlease find attached the {project} report for {period}.\n\nKind regards,\n{sender}\n{org}' },
      }

const defaultHq = (): HqDelivery => ({ ...defaultDelivery('hq'), requireApproval: true, approverRole: 'executive_director', autoSendDay: null, includeSections: { ...DEFAULT_SECTIONS } })

const monthLabel = (period: string, lang: 'ar' | 'en') => {
  const [y, m] = period.split('-').map(Number)
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SD-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all)

/** Reports are for the organisation as a whole, so office-limited accounts do not get them. */
const assertWholeOrg = (u: AuthUser) => {
  if (u.scope === 'office') throw forbidden({ ar: 'التقارير الشهرية للمقر لا تتاح لحسابات المكاتب', en: 'The monthly headquarters report is not available to office-limited accounts' })
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TRANSPORT) private readonly transport: Transport,
  ) {}

  // ─── settings ──────────────────────────────────────────────────────────────

  async settings() {
    await this.db.insert(reportSettings).values({ id: 1, hq: defaultHq(), donor: {} }).onConflictDoNothing()
    const [r] = await this.db.select().from(reportSettings).where(eq(reportSettings.id, 1))
    const projectRows = await this.db.select({ id: projects.id }).from(projects)
    const stored = r.donor as Record<string, Delivery>
    // Every project has a donor template, even if nobody has edited it yet.
    const donor = Object.fromEntries(projectRows.map((p) => [p.id, stored[p.id] ?? defaultDelivery('donor')]))
    return { hq: { ...defaultHq(), ...(r.hq as Partial<HqDelivery>) } as HqDelivery, donor, updatedAt: r.updatedAt }
  }

  async saveSettings(user: AuthUser, b: z.infer<typeof settingsBody>) {
    const [role] = await this.db.select({ id: roles.id }).from(roles).where(eq(roles.id, b.hq.approverRole))
    if (!role) throw unprocessable('UNKNOWN_ROLE', { ar: 'دور الاعتماد غير موجود', en: 'The approver role does not exist' })
    const ids = Object.keys(b.donor)
    if (ids.length) {
      const known = new Set((await this.db.select({ id: projects.id }).from(projects)).map((p) => p.id))
      const bad = ids.filter((i) => !known.has(i))
      if (bad.length) throw unprocessable('UNKNOWN_PROJECT', { ar: 'مشروع غير موجود في إعدادات المانحين', en: 'A donor template refers to a project that does not exist' }, { projects: bad })
    }
    await this.db.transaction(async (tx) => {
      await tx.insert(reportSettings).values({ id: 1, hq: b.hq, donor: b.donor, updatedById: user.id }).onConflictDoUpdate({ target: reportSettings.id, set: { hq: b.hq, donor: b.donor, updatedById: user.id, updatedAt: new Date() } })
      await audit(tx, user, 'report-settings.update', 'report_settings', '1')
    })
    return this.settings()
  }

  // ─── the monthly report ────────────────────────────────────────────────────

  async monthly(user: AuthUser, period: string) {
    assertWholeOrg(user)
    return monthlyReport(this.db, period)
  }

  /** Saves the narrative parts. Editing an approved report sends it back to draft, so what was approved is what goes out. */
  async saveDraft(user: AuthUser, period: string, b: z.infer<typeof draftBody>) {
    assertWholeOrg(user)
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'hq-draft:' + period}))`)
      const [cur] = await tx.select().from(hqDrafts).where(eq(hqDrafts.period, period))
      const next = { summary: b.summary === undefined ? (cur?.summary ?? null) : b.summary, challenges: b.challenges === undefined ? (cur?.challenges ?? null) : b.challenges, plan: b.plan === undefined ? (cur?.plan ?? null) : b.plan }
      const changed = JSON.stringify([next.summary, next.challenges, next.plan]) !== JSON.stringify([cur?.summary ?? null, cur?.challenges ?? null, cur?.plan ?? null])
      const reset = changed && cur && cur.status !== 'draft'
      const [row] = await tx
        .insert(hqDrafts)
        .values({ period, ...next, updatedById: user.id })
        .onConflictDoUpdate({ target: hqDrafts.period, set: { ...next, updatedById: user.id, updatedAt: new Date(), ...(reset ? { status: 'draft' as const, approvedById: null, approvedAt: null } : {}) } })
        .returning()
      await audit(tx, user, 'hq-report.draft', 'hq_draft', period, { reset: !!reset })
      return row
    })
  }

  async approve(user: AuthUser, period: string) {
    assertWholeOrg(user)
    const s = await this.settings()
    if (user.roleId !== s.hq.approverRole && !can(user, 'settings', 'manage')) {
      const [r] = await this.db.select({ ar: roles.nameAr, en: roles.nameEn }).from(roles).where(eq(roles.id, s.hq.approverRole))
      throw forbidden({ ar: `يعتمد التقرير ${r?.ar ?? 'الدور المحدد'}`, en: `Only ${r?.en ?? 'the approver role'} can approve this report` })
    }
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'hq-draft:' + period}))`)
      const [cur] = await tx.select().from(hqDrafts).where(eq(hqDrafts.period, period))
      if (cur?.status === 'sent') throw unprocessable('ALREADY_SENT', { ar: 'التقرير أُرسل بالفعل', en: 'This report has already been sent' })
      const [row] = await tx
        .insert(hqDrafts)
        .values({ period, status: 'approved', approvedById: user.id, approvedAt: new Date(), updatedById: user.id })
        .onConflictDoUpdate({ target: hqDrafts.period, set: { status: 'approved', approvedById: user.id, approvedAt: new Date() } })
        .returning()
      await audit(tx, user, 'hq-report.approve', 'hq_draft', period)
      return row
    })
  }

  // ─── sending ───────────────────────────────────────────────────────────────

  /** The recipients, subject and text to pre-fill when someone presses "Send by email". */
  async delivery(user: AuthUser, q: z.infer<typeof deliveryQuery>) {
    assertWholeOrg(user)
    const s = await this.settings()
    const [org] = await this.db.select().from(orgSettings).where(eq(orgSettings.id, 1))
    const lang = q.lang
    const vars: Record<string, string> = {
      month: monthLabel(q.period, lang),
      period: monthLabel(q.period, lang),
      hq: lang === 'ar' ? org.hqNameAr : org.hqNameEn,
      org: lang === 'ar' ? org.nameAr : org.nameEn,
      sender: lang === 'ar' ? user.nameAr : user.nameEn,
    }
    let d: Delivery
    if (q.kind === 'hq') d = s.hq
    else {
      if (!q.projectId) throw unprocessable('PROJECT_REQUIRED', { ar: 'حدد المشروع', en: 'Choose a project' })
      const [p] = await this.db.select().from(projects).where(eq(projects.id, q.projectId))
      if (!p) throw notFound({ ar: 'المشروع', en: 'Project' })
      d = s.donor[p.id]
      vars.project = `${p.code} — ${lang === 'ar' ? p.nameAr : p.nameEn}`
      vars.donor = lang === 'ar' ? p.donorAr : p.donorEn
    }
    return { to: d.to, cc: d.cc, subject: fill(d.subject[lang], vars), body: fill(d.body[lang], vars), approvalRequired: q.kind === 'hq' && s.hq.requireApproval, includeSections: s.hq.includeSections }
  }

  /**
   * Emails a report with its PDF. The PDF is uploaded first (owner type "report", owner id "hq:2026-09" or
   * "donor:2026-09:<project>") and passed here by id; the app makes the PDF, the server sends and logs it.
   */
  async send(user: AuthUser, b: z.infer<typeof sendBody>) {
    assertWholeOrg(user)
    const key = `${b.kind}:${b.period}${b.kind === 'donor' ? ':' + (b.projectId ?? '') : ''}`
    if (b.kind === 'donor' && !b.projectId) throw unprocessable('PROJECT_REQUIRED', { ar: 'حدد المشروع', en: 'Choose a project' })
    if (b.kind === 'donor') {
      const [p] = await this.db.select({ id: projects.id }).from(projects).where(eq(projects.id, b.projectId!))
      if (!p) throw notFound({ ar: 'المشروع', en: 'Project' })
    }
    const [att] = await this.db.select().from(attachments).where(and(eq(attachments.id, b.attachmentId), sql`${attachments.deletedAt} is null`))
    if (!att || att.ownerType !== 'report' || att.ownerId !== key) throw unprocessable('BAD_ATTACHMENT', { ar: 'ملف التقرير غير صالح لهذا الإرسال', en: 'That file is not the PDF for this report' })
    if (att.mime !== 'application/pdf') throw unprocessable('NOT_PDF', { ar: 'يجب أن يكون المرفق بصيغة PDF', en: 'The attachment must be a PDF' })

    if (b.kind === 'hq') {
      const s = await this.settings()
      if (s.hq.requireApproval) {
        const [d] = await this.db.select().from(hqDrafts).where(eq(hqDrafts.period, b.period))
        if (!d || d.status === 'draft') throw unprocessable('NOT_APPROVED', { ar: 'يجب اعتماد التقرير قبل إرساله', en: 'The report must be approved before it is sent' })
      }
    }

    const email = (await loadChannelConfigs(this.db)).email
    const why = notReady('email', email)
    if (why) throw unprocessable('EMAIL_NOT_READY', why)

    // A second click on "send" a moment later must not send the same message twice.
    const dup = await this.db.execute<{ n: number }>(sql`select count(*)::int as n from sent_reports where status = 'sent' and attachment_id = ${att.id} and sent_at > now() - interval '60 seconds'`)
    if (dup.rows[0].n > 0) throw unprocessable('ALREADY_SENT_JUST_NOW', { ar: 'أُرسل هذا التقرير للتو', en: 'This report was just sent' })

    const content = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      openBlob(att.sha256).on('data', (c: string | Buffer) => chunks.push(Buffer.from(c))).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject)
    })
    const log = { kind: b.kind, period: b.period, projectId: b.projectId ?? null, toAddresses: b.to, ccAddresses: b.cc, subject: b.subject, body: b.body, attachmentId: att.id, sentById: user.id }
    try {
      await this.transport.send('email', email, { to: b.to.join(', '), cc: b.cc, subject: b.subject, body: b.body, lang: 'ar', auto: false, attachments: [{ filename: att.fileName, content, contentType: 'application/pdf' }] })
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 300) : 'unknown error'
      await this.db.transaction(async (tx) => {
        await tx.insert(sentReports).values({ ...log, status: 'failed', error: msg })
        await audit(tx, user, 'report.send_failed', 'sent_report', key, { error: msg })
      })
      throw new AppError(502, 'SEND_FAILED', { ar: 'تعذّر إرسال البريد؛ راجع إعدادات البريد ثم أعد المحاولة', en: 'The email could not be sent; check the email settings and try again' }, { reason: msg })
    }
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(sentReports).values({ ...log, status: 'sent' }).returning()
      if (b.kind === 'hq') await tx.update(hqDrafts).set({ status: 'sent' }).where(eq(hqDrafts.period, b.period))
      await audit(tx, user, 'report.send', 'sent_report', row.id, { key, to: b.to.length + b.cc.length })
      return row
    })
  }

  async sent(user: AuthUser, q: z.infer<typeof sentQuery>) {
    assertWholeOrg(user)
    const rows = await this.db
      .select({ r: sentReports, byAr: users.nameAr, byEn: users.nameEn })
      .from(sentReports)
      .leftJoin(users, eq(users.id, sentReports.sentById))
      .where(and(q.kind ? eq(sentReports.kind, q.kind) : undefined, q.period ? eq(sentReports.period, q.period) : undefined))
      .orderBy(desc(sentReports.sentAt))
      .limit(q.limit)
    return rows.map(({ r, byAr, byEn }) => ({ ...r, sentByAr: byAr, sentByEn: byEn }))
  }
}
