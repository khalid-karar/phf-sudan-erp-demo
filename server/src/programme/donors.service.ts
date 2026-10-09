import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { hashPassword } from '../auth/passwords'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { donors, offices, projectReports, projects, users } from '../db/schema'
import { ExpenditureService } from '../reports/expenditure.service'
import { ProjectReportsService } from './project-reports.service'

const s = (n = 200) => z.string().trim().max(n)
export const donorBody = z.object({ code: s(30).min(1), nameAr: s().min(1), nameEn: s().min(1), active: z.boolean().default(true) })
export const donorPatch = donorBody.partial()
export const donorUserBody = z.object({ email: z.string().trim().toLowerCase().email().max(200), nameAr: s().min(1), nameEn: s().min(1), phone: s(40).optional() })
export const linkDonorBody = z.object({ donorId: z.string().nullable() })
export const portalQuery = z.object({ projectId: z.string().optional(), type: z.enum(['statistics', 'narrative', 'custom', 'quarterly']).optional() })
export const portalExpQuery = z.object({ currency: z.enum(['SDG', 'USD']).default('USD') })

const tempPassword = () => `Phf-${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}1`
const newId = () => `don-${randomBytes(5).toString('hex')}`

@Injectable()
export class DonorsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reports: ProjectReportsService,
    private readonly exp: ExpenditureService,
  ) {}

  // ─── managing donors (staff) ──────────────────────────────────────────────

  list() {
    return this.db.select().from(donors).orderBy(asc(donors.nameEn))
  }

  async create(user: AuthUser, b: z.infer<typeof donorBody>) {
    try {
      const [d] = await this.db.insert(donors).values({ id: newId(), ...b }).returning()
      await audit(this.db, user, 'donor.create', 'donor', d.id, { code: d.code })
      return d
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('DONOR_CODE', { ar: 'رمز الجهة مستخدم', en: 'That donor code is already used' })
      throw e
    }
  }

  async update(user: AuthUser, id: string, b: z.infer<typeof donorPatch>) {
    if (!Object.keys(b).length) throw unprocessable('EMPTY', { ar: 'لا تغييرات', en: 'Nothing to change' })
    const [d] = await this.db.update(donors).set(b).where(eq(donors.id, id)).returning()
    if (!d) throw notFound({ ar: 'الجهة المانحة', en: 'Donor' })
    await audit(this.db, user, 'donor.update', 'donor', id, b)
    return d
  }

  async linkProject(user: AuthUser, projectId: string, donorId: string | null) {
    if (donorId) {
      const [d] = await this.db.select({ id: donors.id }).from(donors).where(eq(donors.id, donorId))
      if (!d) throw notFound({ ar: 'الجهة المانحة', en: 'Donor' })
    }
    const [p] = await this.db.update(projects).set({ donorId }).where(eq(projects.id, projectId)).returning({ id: projects.id })
    if (!p) throw notFound({ ar: 'المشروع', en: 'Project' })
    await audit(this.db, user, 'project.donor', 'project', projectId, { donorId })
    return { ok: true }
  }

  listUsers(donorId: string) {
    return this.db.select({ id: users.id, email: users.email, nameAr: users.nameAr, nameEn: users.nameEn, phone: users.phone, active: users.active, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.donorId, donorId)).orderBy(asc(users.nameEn))
  }

  /** A view-only login for someone at the funding entity. They see the portal and nothing else. */
  async createUser(user: AuthUser, donorId: string, b: z.infer<typeof donorUserBody>) {
    const [d] = await this.db.select({ id: donors.id, active: donors.active }).from(donors).where(eq(donors.id, donorId))
    if (!d) throw notFound({ ar: 'الجهة المانحة', en: 'Donor' })
    if (!d.active) throw unprocessable('DONOR_INACTIVE', { ar: 'الجهة المانحة موقوفة', en: 'This donor is inactive' })
    const [hq] = await this.db.select({ id: offices.id }).from(offices).where(eq(offices.type, 'hq')).limit(1)
    if (!hq) throw unprocessable('NO_HQ', { ar: 'لا يوجد مكتب رئيسي', en: 'There is no head office' })
    const temp = tempPassword()
    try {
      const [u] = await this.db
        .insert(users)
        .values({ email: b.email, nameAr: b.nameAr, nameEn: b.nameEn, phone: b.phone ?? null, passwordHash: await hashPassword(temp), mustChangePassword: true, roleId: 'donor_viewer', officeId: hq.id, donorId })
        .returning({ id: users.id, email: users.email, nameAr: users.nameAr, nameEn: users.nameEn })
      await audit(this.db, user, 'donor.user.create', 'user', u.id, { donorId, email: u.email })
      return { ...u, temporaryPassword: temp }
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('EMAIL_USED', { ar: 'البريد مستخدم', en: 'That email is already used' })
      throw e
    }
  }

  // ─── the donor's own portal ───────────────────────────────────────────────

  private mine(user: AuthUser) {
    if (!user.donorId) throw forbidden({ ar: 'هذه البوابة لممثلي الجهات المانحة', en: 'This portal is for donor representatives' })
    return user.donorId
  }

  async me(user: AuthUser) {
    const donorId = this.mine(user)
    const [d] = await this.db.select().from(donors).where(eq(donors.id, donorId))
    const ps = await this.db.select({ id: projects.id, code: projects.code, nameAr: projects.nameAr, nameEn: projects.nameEn, startDate: projects.startDate, endDate: projects.endDate }).from(projects).where(eq(projects.donorId, donorId)).orderBy(asc(projects.code))
    return { donor: d, projects: ps }
  }

  async reportList(user: AuthUser, q: z.infer<typeof portalQuery>) {
    const donorId = this.mine(user)
    const rows = await this.db
      .select({ r: projectReports, p: { code: projects.code, nameAr: projects.nameAr, nameEn: projects.nameEn } })
      .from(projectReports)
      .innerJoin(projects, eq(projects.id, projectReports.projectId))
      .where(and(eq(projects.donorId, donorId), eq(projectReports.status, 'released'), q.projectId ? eq(projectReports.projectId, q.projectId) : undefined, q.type ? eq(projectReports.type, q.type) : undefined))
      .orderBy(desc(projectReports.periodEnd), asc(projectReports.type))
      .limit(500)
    return rows.map(({ r, p }) => ({ id: r.id, projectId: r.projectId, projectCode: p.code, projectNameAr: p.nameAr, projectNameEn: p.nameEn, type: r.type, period: r.period, periodStart: r.periodStart, periodEnd: r.periodEnd, sectorId: r.sectorId, releasedAt: r.releasedAt }))
  }

  /** A released report of this donor's own project, or "not found" — never a hint that someone else's exists. */
  private async released(user: AuthUser, id: string) {
    const donorId = this.mine(user)
    const [x] = await this.db.select({ r: projectReports }).from(projectReports).innerJoin(projects, eq(projects.id, projectReports.projectId)).where(and(eq(projectReports.id, id), eq(projects.donorId, donorId), eq(projectReports.status, 'released')))
    if (!x) throw notFound({ ar: 'التقرير', en: 'Report' })
    return x.r
  }

  async report(user: AuthUser, id: string) {
    await this.released(user, id)
    const d = await this.reports.detail(this.db, id, false)
    const { reviewNote: _n, submittedAt: _s, reviewedAt: _r, ownerIds: _o, ...safe } = d
    void _n, _s, _r, _o
    return safe
  }

  /** The donor's own expenditure layout for a released quarterly report. */
  async expenditure(user: AuthUser, id: string, currency: 'SDG' | 'USD') {
    const r = await this.released(user, id)
    if (r.type !== 'quarterly') throw unprocessable('NOT_QUARTERLY', { ar: 'تقرير المصروفات للتقرير الربع سنوي فقط', en: 'The expenditure report belongs to the quarterly report' })
    // The report is the donor's to see; building it needs no office restriction.
    return this.exp.xlsx({ ...user, scope: 'all' }, { projectId: r.projectId, from: r.periodStart, to: r.periodEnd, currency })
  }
}
