import { z } from 'zod'
import { INDICATOR_SOURCES } from '../db/schema'

const s = (n = 300) => z.string().trim().max(n)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const bi = (n = 300) => ({ nameAr: s(n).min(1), nameEn: s(n).min(1) })

export const sectorsBody = z.object({ sectorIds: z.array(z.string().min(1)).max(20) })
export const sectorBody = z.object({ id: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/), ...bi(100) })

export const objectiveBody = z.object({ code: s(30).min(1), ...bi(500), sectorId: z.string().nullable().optional() })
export const objectivePatch = objectiveBody.partial()
// A patch must not inherit the create form's defaults (they would silently overwrite what is stored), so it is built from the plain fields.
const indicatorFields = { code: s(30).min(1), ...bi(300), unit: s(40), target: z.number().min(0).max(1e12).nullable().optional(), source: z.enum(INDICATOR_SOURCES) }
export const indicatorBody = z.object({ ...indicatorFields, unit: indicatorFields.unit.default(''), source: indicatorFields.source.default('manual') })
export const indicatorPatch = z.object(indicatorFields).partial()

export const teamBody = z.object({
  members: z
    .array(z.object({ role: z.enum(['project_manager', 'project_coordinator', 'project_office']), userId: z.string().min(1), sectorId: z.string().nullable().optional() }))
    .max(40),
})

const milestoneFields = {
  titleAr: s(300).min(1),
  titleEn: s(300).min(1),
  due: date,
  ownerId: z.string().nullable().optional(),
  objectiveId: z.string().nullable().optional(),
  activityId: z.string().nullable().optional(),
  notifyDaysBefore: z.number().int().min(0).max(90),
  status: z.enum(['planned', 'in_progress', 'done', 'delayed']),
}
export const milestoneBody = z.object({ ...milestoneFields, notifyDaysBefore: milestoneFields.notifyDaysBefore.default(7), status: milestoneFields.status.default('planned') })
export const milestonePatch = z.object(milestoneFields).partial()
export const milestoneQuery = z.object({ projectId: z.string().optional(), status: z.enum(['planned', 'in_progress', 'done', 'delayed', 'open']).optional(), mine: z.enum(['1']).optional() })

export const scheduleBody = z.object({
  enabled: z.boolean().default(true),
  monthlyDueDay: z.number().int().min(1).max(28),
  quarterlyDueDay: z.number().int().min(1).max(28),
  notifyDaysBefore: z.number().int().min(0).max(60),
})

export const activityObjectiveBody = z.object({ objectiveId: z.string().nullable() })

// ─── report templates (the "custom report" builder) ───
const fieldKey = z.string().regex(/^[a-z][a-zA-Z0-9_]{0,40}$/)
const label = z.object({ ar: s(200).min(1), en: s(200).min(1) })
export const templateField = z.object({
  key: fieldKey,
  label,
  type: z.enum(['text', 'longtext', 'number', 'date', 'choice', 'table']),
  required: z.boolean().optional(),
  options: z.array(s(100)).max(30).optional(),
  columns: z.array(z.object({ key: fieldKey, label, type: z.enum(['text', 'number']) })).max(12).optional(),
})
export const templateBody = z.object({
  ...bi(200),
  sectorId: z.string().nullable().optional(),
  active: z.boolean().default(true),
  fields: z.array(templateField).min(1).max(60),
})

// ─── reports ───
export const reportQuery = z.object({
  projectId: z.string().optional(),
  type: z.enum(['statistics', 'narrative', 'custom', 'quarterly']).optional(),
  status: z.enum(['open', 'draft', 'submitted', 'returned', 'approved', 'released']).optional(),
  period: z.string().regex(/^\d{4}-(\d{2}|Q[1-4])$/).optional(),
  mine: z.enum(['1']).optional(),
  waiting: z.enum(['1']).optional(), // for PMO: submitted and waiting for review
})

const num = z.number().min(-1e12).max(1e12).nullable()
export const statisticsContent = z.object({ values: z.record(z.string(), num).default({}), notes: s(4000).default('') })
export const narrativeContent = z.object({
  summary: s(8000).default(''),
  sections: z.array(z.object({ objectiveId: z.string().min(1), progress: s(8000).default(''), challenges: s(8000).default(''), nextSteps: s(8000).default('') })).max(60).default([]),
})
export const quarterlyContent = z.object({ summary: s(8000).default(''), challenges: s(8000).default(''), nextQuarter: s(8000).default('') })
export const customContent = z.object({ values: z.record(z.string(), z.unknown()).default({}), notes: s(8000).default('') })

export const reviewBody = z.object({ decision: z.enum(['approve', 'return']), note: s(2000).optional() })
export const contentBody = z.object({ content: z.record(z.string(), z.unknown()) })
