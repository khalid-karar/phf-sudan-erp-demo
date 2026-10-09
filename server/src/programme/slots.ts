import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { projectReports, projects, projectTeam, reportingSchedules, reportTemplates } from '../db/schema'
import { slotsFor, today } from './periods'

const EDITABLE = ['open', 'draft', 'returned'] as const

/**
 * Makes sure every enabled project has a report slot for each period up to now. Safe to repeat.
 * With `reschedule`, slots nobody has submitted yet get the schedule's current due dates.
 */
export async function ensureSlots(db: DbOrTx, projectId?: string, reschedule = false): Promise<number> {
  const sched = await db
    .select({ sc: reportingSchedules, p: { id: projects.id, start: projects.startDate, end: projects.endDate } })
    .from(reportingSchedules)
    .innerJoin(projects, eq(projects.id, reportingSchedules.projectId))
    .where(and(eq(reportingSchedules.enabled, true), projectId ? eq(reportingSchedules.projectId, projectId) : undefined))
  let created = 0
  for (const { sc, p } of sched) {
    const office = await db.select({ sectorId: projectTeam.sectorId }).from(projectTeam).where(and(eq(projectTeam.projectId, p.id), eq(projectTeam.role, 'project_office')))
    const slots = slotsFor({ start: p.start, end: p.end, monthlyDueDay: sc.monthlyDueDay, quarterlyDueDay: sc.quarterlyDueDay, today: today(), customSectors: office.map((o) => o.sectorId) })
    const tpls = await db.select({ id: reportTemplates.id, sectorId: reportTemplates.sectorId }).from(reportTemplates).where(eq(reportTemplates.active, true)).orderBy(asc(reportTemplates.createdAt))
    const tplFor = (sector: string | null) => (tpls.find((t) => t.sectorId === sector) ?? tpls.find((t) => t.sectorId === null))?.id ?? null
    if (slots.length) {
      const ins = await db
        .insert(projectReports)
        .values(slots.map((x) => ({ projectId: p.id, type: x.type, period: x.period, periodStart: x.periodStart, periodEnd: x.periodEnd, due: x.due, sectorId: x.sectorId, templateId: x.type === 'custom' ? tplFor(x.sectorId) : null })))
        .onConflictDoNothing()
        .returning({ id: projectReports.id })
      created += ins.length
    }
    if (reschedule)
      for (const x of slots)
        await db
          .update(projectReports)
          .set({ due: x.due, updatedAt: new Date() })
          .where(and(eq(projectReports.projectId, p.id), eq(projectReports.type, x.type), eq(projectReports.period, x.period), x.sectorId ? eq(projectReports.sectorId, x.sectorId) : sql`${projectReports.sectorId} is null`, inArray(projectReports.status, [...EDITABLE])))
    // A template added later is picked up by custom reports that have none yet.
    for (const t of tpls) await db.update(projectReports).set({ templateId: t.id }).where(and(eq(projectReports.projectId, p.id), eq(projectReports.type, 'custom'), sql`${projectReports.templateId} is null`, inArray(projectReports.status, [...EDITABLE]), t.sectorId ? eq(projectReports.sectorId, t.sectorId) : sql`true`))
  }
  return created
}

