import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { can, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { activities, indicators, milestones, objectives, projects, projectSectors, projectTeam, reportingSchedules, sectors, users } from '../db/schema'
import type * as s from './programme.schemas'
import { ProjectReportsService } from './project-reports.service'

const num = (v: string | null) => (v === null ? null : Number(v))

@Injectable()
export class ProgrammeService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reports: ProjectReportsService,
  ) {}

  private async project(db: DbOrTx, id: string) {
    const [p] = await db.select({ id: projects.id, code: projects.code }).from(projects).where(eq(projects.id, id))
    if (!p) throw notFound({ ar: 'المشروع', en: 'Project' })
    return p
  }

  // ─── the plan of one project ──────────────────────────────────────────────

  async sectorList() {
    return this.db.select().from(sectors).orderBy(asc(sectors.sort), asc(sectors.id))
  }

  async createSector(user: AuthUser, b: z.infer<typeof s.sectorBody>) {
    const [x] = await this.db.insert(sectors).values({ id: b.id, nameAr: b.nameAr, nameEn: b.nameEn, sort: 99 }).onConflictDoNothing().returning()
    if (!x) throw conflict('SECTOR_EXISTS', { ar: 'القطاع موجود', en: 'That sector already exists' })
    await audit(this.db, user, 'sector.create', 'sector', x.id, {})
    return x
  }

  async plan(projectId: string) {
    await this.project(this.db, projectId)
    const [sec, objs, inds, team, ms, sched] = await Promise.all([
      this.db.select({ id: projectSectors.sectorId }).from(projectSectors).where(eq(projectSectors.projectId, projectId)),
      this.db.select().from(objectives).where(eq(objectives.projectId, projectId)).orderBy(asc(objectives.sort), asc(objectives.code)),
      this.db.select({ i: indicators }).from(indicators).innerJoin(objectives, eq(objectives.id, indicators.objectiveId)).where(eq(objectives.projectId, projectId)).orderBy(asc(indicators.sort), asc(indicators.code)),
      this.db.select().from(projectTeam).where(eq(projectTeam.projectId, projectId)),
      this.db.select().from(milestones).where(eq(milestones.projectId, projectId)).orderBy(asc(milestones.due)),
      this.db.select().from(reportingSchedules).where(eq(reportingSchedules.projectId, projectId)),
    ])
    return {
      projectId,
      sectors: sec.map((x) => x.id),
      objectives: objs.map((o) => ({ ...o, indicators: inds.filter((x) => x.i.objectiveId === o.id).map((x) => ({ ...x.i, target: num(x.i.target) })) })),
      team: team.map((t) => ({ id: t.id, role: t.role, userId: t.userId, sectorId: t.sectorId })),
      milestones: ms,
      schedule: sched[0] ?? { projectId, enabled: false, monthlyDueDay: 10, quarterlyDueDay: 20, notifyDaysBefore: 5 },
      scheduled: sched.length > 0,
    }
  }

  async setSectors(user: AuthUser, projectId: string, b: z.infer<typeof s.sectorsBody>) {
    await this.project(this.db, projectId)
    const ids = [...new Set(b.sectorIds)]
    if (ids.length) {
      const found = await this.db.select({ id: sectors.id }).from(sectors).where(inArray(sectors.id, ids))
      if (found.length !== ids.length) throw unprocessable('SECTOR', { ar: 'قطاع غير معروف', en: 'Unknown sector' })
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(projectSectors).where(eq(projectSectors.projectId, projectId))
      if (ids.length) await tx.insert(projectSectors).values(ids.map((sectorId) => ({ projectId, sectorId })))
      await audit(tx, user, 'project.sectors', 'project', projectId, { ids })
    })
    return { ok: true }
  }

  // ─── objectives and indicators ────────────────────────────────────────────

  private async checkSector(sectorId: string | null | undefined) {
    if (!sectorId) return
    const [x] = await this.db.select({ id: sectors.id }).from(sectors).where(eq(sectors.id, sectorId))
    if (!x) throw unprocessable('SECTOR', { ar: 'قطاع غير معروف', en: 'Unknown sector' })
  }

  async createObjective(user: AuthUser, projectId: string, b: z.infer<typeof s.objectiveBody>) {
    await this.project(this.db, projectId)
    await this.checkSector(b.sectorId)
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(objectives).where(eq(objectives.projectId, projectId))
    try {
      const [o] = await this.db.insert(objectives).values({ projectId, code: b.code, nameAr: b.nameAr, nameEn: b.nameEn, sectorId: b.sectorId ?? null, sort: n + 1 }).returning()
      await audit(this.db, user, 'objective.create', 'objective', o.id, { projectId, code: b.code })
      return { ...o, indicators: [] }
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('OBJECTIVE_CODE', { ar: 'رمز الهدف مستخدم في هذا المشروع', en: 'That objective code is already used in this project' })
      throw e
    }
  }

  async updateObjective(user: AuthUser, id: string, b: z.infer<typeof s.objectivePatch>) {
    await this.checkSector(b.sectorId)
    const set = { ...(b.code !== undefined && { code: b.code }), ...(b.nameAr !== undefined && { nameAr: b.nameAr }), ...(b.nameEn !== undefined && { nameEn: b.nameEn }), ...(b.sectorId !== undefined && { sectorId: b.sectorId }) }
    if (!Object.keys(set).length) throw unprocessable('EMPTY', { ar: 'لا تغييرات', en: 'Nothing to change' })
    try {
      const [o] = await this.db.update(objectives).set(set).where(eq(objectives.id, id)).returning()
      if (!o) throw notFound({ ar: 'الهدف', en: 'Objective' })
      await audit(this.db, user, 'objective.update', 'objective', id, set)
      return o
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('OBJECTIVE_CODE', { ar: 'رمز الهدف مستخدم في هذا المشروع', en: 'That objective code is already used in this project' })
      throw e
    }
  }

  async deleteObjective(user: AuthUser, id: string) {
    const [o] = await this.db.delete(objectives).where(eq(objectives.id, id)).returning({ id: objectives.id, projectId: objectives.projectId })
    if (!o) throw notFound({ ar: 'الهدف', en: 'Objective' })
    await audit(this.db, user, 'objective.delete', 'objective', id, { projectId: o.projectId })
    return { ok: true }
  }

  async createIndicator(user: AuthUser, objectiveId: string, b: z.infer<typeof s.indicatorBody>) {
    const [o] = await this.db.select({ id: objectives.id }).from(objectives).where(eq(objectives.id, objectiveId))
    if (!o) throw notFound({ ar: 'الهدف', en: 'Objective' })
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(indicators).where(eq(indicators.objectiveId, objectiveId))
    try {
      const [x] = await this.db.insert(indicators).values({ objectiveId, code: b.code, nameAr: b.nameAr, nameEn: b.nameEn, unit: b.unit, target: b.target === null || b.target === undefined ? null : String(b.target), source: b.source, sort: n + 1 }).returning()
      await audit(this.db, user, 'indicator.create', 'indicator', x.id, { objectiveId })
      return { ...x, target: num(x.target) }
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('INDICATOR_CODE', { ar: 'رمز المؤشر مستخدم في هذا الهدف', en: 'That indicator code is already used for this objective' })
      throw e
    }
  }

  async updateIndicator(user: AuthUser, id: string, b: z.infer<typeof s.indicatorPatch>) {
    const set = {
      ...(b.code !== undefined && { code: b.code }),
      ...(b.nameAr !== undefined && { nameAr: b.nameAr }),
      ...(b.nameEn !== undefined && { nameEn: b.nameEn }),
      ...(b.unit !== undefined && { unit: b.unit }),
      ...(b.source !== undefined && { source: b.source }),
      ...(b.target !== undefined && { target: b.target === null ? null : String(b.target) }),
    }
    if (!Object.keys(set).length) throw unprocessable('EMPTY', { ar: 'لا تغييرات', en: 'Nothing to change' })
    const [x] = await this.db.update(indicators).set(set).where(eq(indicators.id, id)).returning()
    if (!x) throw notFound({ ar: 'المؤشر', en: 'Indicator' })
    await audit(this.db, user, 'indicator.update', 'indicator', id, set)
    return { ...x, target: num(x.target) }
  }

  async deleteIndicator(user: AuthUser, id: string) {
    const [x] = await this.db.delete(indicators).where(eq(indicators.id, id)).returning({ id: indicators.id })
    if (!x) throw notFound({ ar: 'المؤشر', en: 'Indicator' })
    await audit(this.db, user, 'indicator.delete', 'indicator', id, {})
    return { ok: true }
  }

  async setActivityObjective(user: AuthUser, activityId: string, objectiveId: string | null) {
    const [a] = await this.db.select({ id: activities.id, projectId: activities.projectId }).from(activities).where(eq(activities.id, activityId))
    if (!a) throw notFound({ ar: 'النشاط', en: 'Activity' })
    if (objectiveId) {
      const [o] = await this.db.select({ projectId: objectives.projectId }).from(objectives).where(eq(objectives.id, objectiveId))
      if (!o || o.projectId !== a.projectId) throw unprocessable('OBJECTIVE_PROJECT', { ar: 'الهدف لا يتبع مشروع النشاط', en: 'That objective belongs to a different project' })
    }
    await this.db.update(activities).set({ objectiveId }).where(eq(activities.id, activityId))
    await audit(this.db, user, 'activity.objective', 'activity', activityId, { objectiveId })
    return { ok: true }
  }

  // ─── project team ─────────────────────────────────────────────────────────

  async setTeam(user: AuthUser, projectId: string, b: z.infer<typeof s.teamBody>) {
    await this.project(this.db, projectId)
    const ids = [...new Set(b.members.map((m) => m.userId))]
    if (ids.length) {
      const found = await this.db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.active, true), sql`${users.donorId} is null`))
      if (found.length !== ids.length) throw unprocessable('TEAM_USER', { ar: 'مستخدم غير موجود أو غير فعّال', en: 'A team member is not an active staff user' })
    }
    for (const m of b.members) await this.checkSector(m.sectorId)
    await this.db.transaction(async (tx) => {
      await tx.delete(projectTeam).where(eq(projectTeam.projectId, projectId))
      const seen = new Set<string>()
      const rows = b.members.filter((m) => {
        const k = `${m.role}:${m.userId}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      if (rows.length) await tx.insert(projectTeam).values(rows.map((m) => ({ projectId, role: m.role, userId: m.userId, sectorId: m.role === 'project_office' ? (m.sectorId ?? null) : null })))
      await audit(tx, user, 'project.team', 'project', projectId, { members: rows.length })
    })
    // A new project office may mean new custom-report slots.
    await this.reports.ensureSlots(this.db, projectId)
    return { ok: true }
  }

  // ─── milestones ───────────────────────────────────────────────────────────

  private async checkLinks(projectId: string, b: { objectiveId?: string | null; activityId?: string | null; ownerId?: string | null }) {
    if (b.objectiveId) {
      const [o] = await this.db.select({ p: objectives.projectId }).from(objectives).where(eq(objectives.id, b.objectiveId))
      if (!o || o.p !== projectId) throw unprocessable('OBJECTIVE_PROJECT', { ar: 'الهدف لا يتبع هذا المشروع', en: 'That objective belongs to a different project' })
    }
    if (b.activityId) {
      const [a] = await this.db.select({ p: activities.projectId }).from(activities).where(eq(activities.id, b.activityId))
      if (!a || a.p !== projectId) throw unprocessable('ACTIVITY_PROJECT', { ar: 'النشاط لا يتبع هذا المشروع', en: 'That activity belongs to a different project' })
    }
    if (b.ownerId) {
      const [u] = await this.db.select({ id: users.id }).from(users).where(and(eq(users.id, b.ownerId), eq(users.active, true), sql`${users.donorId} is null`))
      if (!u) throw unprocessable('OWNER', { ar: 'المسؤول غير موجود أو غير فعّال', en: 'The owner is not an active staff user' })
    }
  }

  async listMilestones(user: AuthUser, q: z.infer<typeof s.milestoneQuery>) {
    const conds = [q.projectId ? eq(milestones.projectId, q.projectId) : undefined, q.mine ? eq(milestones.ownerId, user.id) : undefined, q.status === 'open' ? sql`${milestones.status} <> 'done'` : q.status ? eq(milestones.status, q.status) : undefined].filter(Boolean) as ReturnType<typeof eq>[]
    return this.db.select().from(milestones).where(conds.length ? and(...conds) : undefined).orderBy(asc(milestones.due)).limit(1000)
  }

  async createMilestone(user: AuthUser, projectId: string, b: z.infer<typeof s.milestoneBody>) {
    await this.project(this.db, projectId)
    await this.checkLinks(projectId, b)
    const [m] = await this.db
      .insert(milestones)
      .values({ projectId, titleAr: b.titleAr, titleEn: b.titleEn, due: b.due, ownerId: b.ownerId ?? null, objectiveId: b.objectiveId ?? null, activityId: b.activityId ?? null, notifyDaysBefore: b.notifyDaysBefore, status: b.status, doneAt: b.status === 'done' ? new Date() : null, createdById: user.id })
      .returning()
    await audit(this.db, user, 'milestone.create', 'milestone', m.id, { projectId })
    return m
  }

  async updateMilestone(user: AuthUser, id: string, b: z.infer<typeof s.milestonePatch>) {
    const [cur] = await this.db.select().from(milestones).where(eq(milestones.id, id))
    if (!cur) throw notFound({ ar: 'المعلم', en: 'Milestone' })
    const editor = can(user, 'projects', 'edit')
    // The owner may move their own milestone along; anything else needs project edit rights.
    const onlyStatus = Object.keys(b).every((k) => k === 'status')
    if (!editor && !(cur.ownerId === user.id && onlyStatus)) throw forbidden({ ar: 'يمكن للمسؤول تحديث حالة معلمه فقط', en: 'The owner may update the status of their own milestone only' })
    await this.checkLinks(cur.projectId, b)
    const set: Partial<typeof milestones.$inferInsert> = {
      ...(b.titleAr !== undefined && { titleAr: b.titleAr }),
      ...(b.titleEn !== undefined && { titleEn: b.titleEn }),
      ...(b.due !== undefined && { due: b.due }),
      ...(b.ownerId !== undefined && { ownerId: b.ownerId }),
      ...(b.objectiveId !== undefined && { objectiveId: b.objectiveId }),
      ...(b.activityId !== undefined && { activityId: b.activityId }),
      ...(b.notifyDaysBefore !== undefined && { notifyDaysBefore: b.notifyDaysBefore }),
    }
    if (b.status !== undefined) {
      set.status = b.status
      set.doneAt = b.status === 'done' ? (cur.doneAt ?? new Date()) : null
    }
    if (!Object.keys(set).length) throw unprocessable('EMPTY', { ar: 'لا تغييرات', en: 'Nothing to change' })
    const [m] = await this.db.update(milestones).set(set).where(eq(milestones.id, id)).returning()
    await audit(this.db, user, 'milestone.update', 'milestone', id, set)
    return m
  }

  async deleteMilestone(user: AuthUser, id: string) {
    const [m] = await this.db.delete(milestones).where(eq(milestones.id, id)).returning({ id: milestones.id })
    if (!m) throw notFound({ ar: 'المعلم', en: 'Milestone' })
    await audit(this.db, user, 'milestone.delete', 'milestone', id, {})
    return { ok: true }
  }

  // ─── reporting calendar ───────────────────────────────────────────────────

  async setSchedule(user: AuthUser, projectId: string, b: z.infer<typeof s.scheduleBody>) {
    await this.project(this.db, projectId)
    await this.db.insert(reportingSchedules).values({ projectId, ...b }).onConflictDoUpdate({ target: reportingSchedules.projectId, set: b })
    await audit(this.db, user, 'project.schedule', 'project', projectId, b)
    // Due dates of reports nobody has submitted yet follow the new days.
    const created = await this.reports.ensureSlots(this.db, projectId, true)
    return { ok: true, created }
  }

  async generate(user: AuthUser, projectId: string) {
    await this.project(this.db, projectId)
    const created = await this.reports.ensureSlots(this.db, projectId, true)
    await audit(this.db, user, 'project.schedule.generate', 'project', projectId, { created })
    return { created }
  }
}
