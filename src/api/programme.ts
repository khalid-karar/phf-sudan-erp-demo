// Programme management: project plans (sectors, objectives, team, milestones, reporting calendar), the monthly and
// quarterly reports with PMO review, and the donor portal. On the server in live mode; in the demo everything runs
// in the browser (localStorage) with the same rules, so a demo shows exactly what the real system will do.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as demoProg from '../data/programme'
import { daysBetween, dueDate, monthRange, quarterRange, slotsFor, todayIso, type MilestoneStatus, type ReportStatus, type ReportType, type TeamRole } from '../lib/programme'
import { useStore } from '../lib/store'
import { ApiError, api, LIVE } from './http'

// ─── shapes (the same as the API's) ──────────────────────────────────────────

export interface Sector { id: string; nameAr: string; nameEn: string; sort: number }
export interface Donor { id: string; code: string; nameAr: string; nameEn: string; active: boolean }
export type IndicatorSource = 'manual' | 'beneficiaries' | 'services' | 'activities' | 'field_beneficiaries'
export interface Indicator { id: string; objectiveId: string; code: string; nameAr: string; nameEn: string; unit: string; target: number | null; source: IndicatorSource; sort: number }
export interface Objective { id: string; projectId: string; sectorId: string | null; code: string; nameAr: string; nameEn: string; sort: number; indicators: Indicator[] }
export interface TeamMember { id?: string; role: TeamRole; userId: string; sectorId: string | null }
export interface Milestone { id: string; projectId: string; titleAr: string; titleEn: string; due: string; ownerId: string | null; status: MilestoneStatus; objectiveId: string | null; activityId: string | null; notifyDaysBefore: number; doneAt: string | null }
export interface Schedule { projectId: string; enabled: boolean; monthlyDueDay: number; quarterlyDueDay: number; notifyDaysBefore: number }
export interface Plan { projectId: string; sectors: string[]; objectives: Objective[]; team: TeamMember[]; milestones: Milestone[]; schedule: Schedule; scheduled: boolean }

export interface TField { key: string; label: { ar: string; en: string }; type: 'text' | 'longtext' | 'number' | 'date' | 'choice' | 'table'; required?: boolean; options?: string[]; columns?: { key: string; label: { ar: string; en: string }; type: 'text' | 'number' }[] }
export interface Template { id: string; nameAr: string; nameEn: string; sectorId: string | null; fields: TField[]; active: boolean }

export interface ReportRow {
  id: string; projectId: string; projectCode: string; projectNameAr: string; projectNameEn: string; donorId: string | null
  type: ReportType; period: string; periodStart: string; periodEnd: string; due: string; sectorId: string | null; templateId: string | null
  status: ReportStatus; ownerIds: string[]; overdue: boolean; daysLeft: number
  submittedAt: string | null; reviewedAt: string | null; reviewNote: string | null; releasedAt: string | null
}
export interface IndicatorValue { id: string; objectiveId: string; code: string; nameAr: string; nameEn: string; unit: string; target: number | null; source: IndicatorSource; auto: number | null; cumulative: number | null }
export interface ReportData {
  fieldReports: { n: number; ben: number; men: number; women: number; children: number }
  services: { services: number; served: number; men: number; women: number }
  byService: { type: string; n: number }[]
  byOffice: { officeId: string; reports: number }[]
  indicators: IndicatorValue[]
  monthly?: { period: string; status: ReportStatus }[]
  manualTotals?: Record<string, number>
  finance?: { ceilingUsd: string; spentUsd: string; committedUsd: string; availableUsd: string }
}
export interface ReportEvent { at: string; userId: string | null; action: string; note: string | null }
export interface ReportDetail extends ReportRow {
  content: Record<string, unknown>
  data: ReportData
  template: Template | null
  objectives: { id: string; code: string; nameAr: string; nameEn: string; sectorId: string | null }[]
  events?: ReportEvent[]
}
export interface PortalMe { donor: Donor; projects: { id: string; code: string; nameAr: string; nameEn: string; startDate: string; endDate: string }[] }
export interface PortalRow { id: string; projectId: string; projectCode: string; projectNameAr: string; projectNameEn: string; type: ReportType; period: string; periodStart: string; periodEnd: string; sectorId: string | null; releasedAt: string }
export interface DonorUser { id: string; email: string; nameAr: string; nameEn: string; phone?: string | null; active: boolean; temporaryPassword?: string | null }

export interface ReportQuery { projectId?: string; type?: ReportType; status?: ReportStatus; period?: string; mine?: boolean; waiting?: boolean }

export interface Backend {
  sectors(): Promise<Sector[]>
  addSector(id: string, nameAr: string, nameEn: string): Promise<void>
  donors(): Promise<Donor[]>
  saveDonor(id: string | null, d: { code: string; nameAr: string; nameEn: string; active: boolean }): Promise<Donor>
  linkDonor(projectId: string, donorId: string | null): Promise<void>
  projectDonors(): Promise<Record<string, string | null>>
  donorUsers(donorId: string): Promise<DonorUser[]>
  addDonorUser(donorId: string, u: { email: string; nameAr: string; nameEn: string }): Promise<DonorUser>

  plan(projectId: string): Promise<Plan>
  setSectors(projectId: string, sectorIds: string[]): Promise<void>
  setTeam(projectId: string, members: TeamMember[]): Promise<void>
  setSchedule(projectId: string, s: Omit<Schedule, 'projectId'>): Promise<void>
  generate(projectId: string): Promise<number>
  addObjective(projectId: string, o: { code: string; nameAr: string; nameEn: string; sectorId: string | null }): Promise<void>
  editObjective(id: string, o: Partial<{ code: string; nameAr: string; nameEn: string; sectorId: string | null }>): Promise<void>
  removeObjective(id: string): Promise<void>
  addIndicator(objectiveId: string, i: { code: string; nameAr: string; nameEn: string; unit: string; target: number | null; source: IndicatorSource }): Promise<void>
  editIndicator(id: string, i: Partial<{ code: string; nameAr: string; nameEn: string; unit: string; target: number | null; source: IndicatorSource }>): Promise<void>
  removeIndicator(id: string): Promise<void>
  setActivityObjective(activityId: string, objectiveId: string | null): Promise<void>
  activityObjectives(): Promise<Record<string, string>>

  milestones(q?: { projectId?: string }): Promise<Milestone[]>
  addMilestone(projectId: string, m: Omit<Milestone, 'id' | 'projectId' | 'doneAt'>): Promise<void>
  editMilestone(id: string, m: Partial<Omit<Milestone, 'id' | 'projectId' | 'doneAt'>>): Promise<void>
  removeMilestone(id: string): Promise<void>

  reports(q?: ReportQuery): Promise<ReportRow[]>
  report(id: string): Promise<ReportDetail>
  saveReport(id: string, content: Record<string, unknown>): Promise<ReportDetail>
  submitReport(id: string): Promise<ReportDetail>
  reviewReport(id: string, decision: 'approve' | 'return', note?: string): Promise<ReportDetail>
  releaseReport(id: string): Promise<ReportDetail>
  reopenReport(id: string, note: string): Promise<ReportDetail>
  templates(): Promise<Template[]>
  saveTemplate(id: string | null, t: Omit<Template, 'id'>): Promise<void>

  portalMe(): Promise<PortalMe>
  portalReports(): Promise<PortalRow[]>
  portalReport(id: string): Promise<ReportDetail>
  portalExpenditure(id: string, currency: 'USD' | 'SDG'): Promise<void>
}

// ─── live: the server ────────────────────────────────────────────────────────

const qs = (o: Record<string, string | boolean | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== false && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v === true ? '1' : String(v))}`)
  return p.length ? `?${p.join('&')}` : ''
}

const liveBackend: Backend = {
  sectors: () => api.get('/programme/sectors'),
  addSector: async (id, nameAr, nameEn) => void (await api.post('/programme/sectors', { id, nameAr, nameEn })),
  donors: () => api.get('/donors'),
  saveDonor: (id, d) => (id ? api.patch<Donor>(`/donors/${id}`, d) : api.post<Donor>('/donors', d)),
  linkDonor: async (projectId, donorId) => void (await api.put(`/donors/link/${projectId}`, { donorId })),
  projectDonors: async () => {
    const ps = await api.get<{ id: string; donorId?: string | null }[]>('/projects')
    return Object.fromEntries(ps.map((p) => [p.id, p.donorId ?? null]))
  },
  donorUsers: (id) => api.get(`/donors/${id}/users`),
  addDonorUser: (id, u) => api.post(`/donors/${id}/users`, u),

  plan: (id) => api.get(`/programme/projects/${id}/plan`),
  setSectors: async (id, sectorIds) => void (await api.put(`/programme/projects/${id}/sectors`, { sectorIds })),
  setTeam: async (id, members) => void (await api.put(`/programme/projects/${id}/team`, { members: members.map((m) => ({ role: m.role, userId: m.userId, sectorId: m.sectorId })) })),
  setSchedule: async (id, s) => void (await api.put(`/programme/projects/${id}/schedule`, s)),
  generate: async (id) => (await api.post<{ created: number }>(`/programme/projects/${id}/schedule/generate`)).created,
  addObjective: async (id, o) => void (await api.post(`/programme/projects/${id}/objectives`, o)),
  editObjective: async (id, o) => void (await api.patch(`/programme/objectives/${id}`, o)),
  removeObjective: async (id) => void (await api.del(`/programme/objectives/${id}`)),
  addIndicator: async (id, i) => void (await api.post(`/programme/objectives/${id}/indicators`, i)),
  editIndicator: async (id, i) => void (await api.patch(`/programme/indicators/${id}`, i)),
  removeIndicator: async (id) => void (await api.del(`/programme/indicators/${id}`)),
  setActivityObjective: async (id, objectiveId) => void (await api.put(`/programme/activities/${id}/objective`, { objectiveId })),
  activityObjectives: async () => {
    const as = await api.get<{ id: string; objectiveId?: string | null }[]>('/activities?limit=500')
    return Object.fromEntries(as.filter((a) => a.objectiveId).map((a) => [a.id, a.objectiveId as string]))
  },

  milestones: (q) => api.get(`/programme/milestones${qs({ projectId: q?.projectId })}`),
  addMilestone: async (id, m) => void (await api.post(`/programme/projects/${id}/milestones`, m)),
  editMilestone: async (id, m) => void (await api.patch(`/programme/milestones/${id}`, m)),
  removeMilestone: async (id) => void (await api.del(`/programme/milestones/${id}`)),

  reports: (q) => api.get(`/programme/reports${qs({ projectId: q?.projectId, type: q?.type, status: q?.status, period: q?.period, mine: q?.mine, waiting: q?.waiting })}`),
  report: (id) => api.get(`/programme/reports/${id}`),
  saveReport: (id, content) => api.put(`/programme/reports/${id}/content`, { content }),
  submitReport: (id) => api.post(`/programme/reports/${id}/submit`),
  reviewReport: (id, decision, note) => api.post(`/programme/reports/${id}/review`, { decision, note }),
  releaseReport: (id) => api.post(`/programme/reports/${id}/release`),
  reopenReport: (id, note) => api.post(`/programme/reports/${id}/reopen`, { note }),
  templates: () => api.get('/programme/reports/templates'),
  saveTemplate: async (id, t) => void (await (id ? api.put(`/programme/reports/templates/${id}`, t) : api.post('/programme/reports/templates', t))),

  portalMe: () => api.get('/donor/me'),
  portalReports: () => api.get('/donor/reports'),
  portalReport: (id) => api.get(`/donor/reports/${id}`),
  portalExpenditure: async (id, currency) => {
    const b = await api.blob(`/donor/reports/${id}/expenditure.xlsx?currency=${currency}`)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `Expenditure-report-${id.slice(0, 8)}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
  },
}

// ─── demo: the same rules, in the browser ────────────────────────────────────

interface Rep {
  id: string; projectId: string; type: ReportType; period: string; periodStart: string; periodEnd: string; due: string; sectorId: string | null; templateId: string | null
  status: ReportStatus; content: Record<string, unknown>; submittedAt: string | null; submittedById: string | null; reviewedAt: string | null; reviewedById: string | null
  reviewNote: string | null; releasedAt: string | null; releasedById: string | null
}
interface DemoDb {
  v: number
  donors: Donor[]
  projectDonor: Record<string, string | null>
  sectors: Sector[]
  templates: Template[]
  plans: Record<string, Plan>
  reports: Rep[]
  events: Record<string, ReportEvent[]>
  activityObjective: Record<string, string>
  donorUsers: (DonorUser & { donorId: string })[]
}
const KEY = 'phf-programme-demo-v1'
const EDITABLE: ReportStatus[] = ['open', 'draft', 'returned']
const OWNER_ROLE: Record<ReportType, TeamRole> = { statistics: 'project_manager', quarterly: 'project_manager', narrative: 'project_coordinator', custom: 'project_office' }
const uid = () => crypto.randomUUID()
const rank = { none: 0, view: 1, edit: 2, manage: 3 } as const

const err = (status: number, code: string, ar: string, en: string) => new ApiError(status, code, { ar, en })
const forbidden = (ar = 'لا تملك صلاحية هذا الإجراء', en = 'You do not have permission for this action') => err(403, 'FORBIDDEN', ar, en)
const notFound = (ar: string, en: string) => err(404, 'NOT_FOUND', `${ar} غير موجود`, `${en} not found`)
const unprocessable = (code: string, ar: string, en: string) => err(422, code, ar, en)

function ctx() {
  const s = useStore.getState()
  const user = s.users.find((u) => u.id === s.userId) ?? s.users[0]
  const role = s.roles.find((r) => r.id === user?.role)
  const can = (m: keyof NonNullable<typeof role>['permissions'], min: keyof typeof rank = 'view') => !!role && rank[role.permissions[m] ?? 'none'] >= rank[min]
  return { s, user, role, can }
}

function freshDb(): DemoDb {
  const { s } = ctx()
  const sectors: Sector[] = [
    { id: 'health', nameAr: 'الصحة', nameEn: 'Health', sort: 1 },
    { id: 'nutrition', nameAr: 'التغذية', nameEn: 'Nutrition', sort: 2 },
    { id: 'cash', nameAr: 'الدعم النقدي', nameEn: 'Cash support', sort: 3 },
    { id: 'wash', nameAr: 'المياه والإصحاح', nameEn: 'WASH', sort: 4 },
  ]
  const db: DemoDb = {
    v: 1,
    donors: demoProg.donors.map((d) => ({ id: d.id, code: d.code, nameAr: d.name.ar, nameEn: d.name.en, active: true })),
    projectDonor: { ...demoProg.projectDonor },
    sectors,
    templates: demoProg.templates.map((t) => ({ id: t.id, nameAr: t.name.ar, nameEn: t.name.en, sectorId: t.sectorId, active: true, fields: t.fields as TField[] })),
    plans: {},
    reports: [],
    events: {},
    activityObjective: {},
    donorUsers: [],
  }
  const objIds: Record<string, Record<string, string>> = {}
  const indIds: Record<string, Record<string, string>> = {}
  for (const [pid, p] of Object.entries(demoProg.plans)) {
    objIds[pid] = {}
    indIds[pid] = {}
    const objectives: Objective[] = p.objectives.map((o, oi) => {
      const oid = `o-${pid}-${o.code}`
      objIds[pid][o.code] = oid
      return {
        id: oid, projectId: pid, sectorId: o.sectorId, code: o.code, nameAr: o.name.ar, nameEn: o.name.en, sort: oi + 1,
        indicators: o.indicators.map((i, ii) => {
          const iid = `i-${pid}-${o.code}-${i.code}`
          indIds[pid][`${o.code}.${i.code}`] = iid
          return { id: iid, objectiveId: oid, code: i.code, nameAr: i.name.ar, nameEn: i.name.en, unit: i.unit.en, target: i.target, source: i.source, sort: ii + 1 }
        }),
      }
    })
    db.plans[pid] = {
      projectId: pid,
      sectors: p.sectors,
      objectives,
      team: p.team.map((m) => ({ role: m.role, userId: m.userId, sectorId: m.sectorId ?? null })),
      milestones: p.milestones.map((m, i) => ({ id: `m-${pid}-${i}`, projectId: pid, titleAr: m.title.ar, titleEn: m.title.en, due: demoProg.day(m.due), ownerId: m.ownerId, status: m.status, objectiveId: m.objective ? objIds[pid][m.objective] : null, activityId: null, notifyDaysBefore: m.notifyDaysBefore, doneAt: m.status === 'done' ? new Date().toISOString() : null })),
      schedule: { projectId: pid, enabled: true, ...p.schedule },
      scheduled: true,
    }
  }
  for (const a of s.activities) {
    const code = demoProg.objectiveFor(a.projectId, a.type)
    if (code && objIds[a.projectId]?.[code]) db.activityObjective[a.id] = objIds[a.projectId][code]
  }
  ensureSlots(db)
  const old = new Date(Date.now() - demoProg.RELEASED_BEFORE_DAYS * 86_400_000).toISOString().slice(0, 10)
  for (const r of db.reports) {
    if (r.periodEnd >= old) continue
    const at = new Date(Date.parse(r.due) - 2 * 86_400_000).toISOString()
    r.content = demoProg.sampleContent(r.type, demoProg.plans[r.projectId], r.period, { objectives: objIds[r.projectId] ?? {}, indicators: indIds[r.projectId] ?? {} }, r.templateId) as Record<string, unknown>
    Object.assign(r, { status: 'released', submittedAt: at, submittedById: r.type === 'narrative' ? 'u-pc' : 'u-pm', reviewedAt: at, reviewedById: 'u-pmo', releasedAt: at, releasedById: 'u-pmo' })
  }
  return db
}

function ensureSlots(db: DemoDb, onlyProject?: string): number {
  const { s } = ctx()
  let created = 0
  for (const p of s.projects) {
    if (onlyProject && p.id !== onlyProject) continue
    const plan = db.plans[p.id]
    if (!plan?.scheduled || !plan.schedule.enabled) continue
    const sectors = plan.team.filter((t) => t.role === 'project_office').map((t) => t.sectorId)
    const slots = slotsFor({ start: p.start.slice(0, 10), end: p.end.slice(0, 10), monthlyDueDay: plan.schedule.monthlyDueDay, quarterlyDueDay: plan.schedule.quarterlyDueDay, today: todayIso(), customSectors: sectors })
    for (const x of slots) {
      const have = db.reports.find((r) => r.projectId === p.id && r.type === x.type && r.period === x.period && (r.sectorId ?? '') === (x.sectorId ?? ''))
      const tpl = x.type === 'custom' ? (db.templates.find((t) => t.active && t.sectorId === x.sectorId) ?? db.templates.find((t) => t.active && !t.sectorId))?.id ?? null : null
      if (have) {
        if (EDITABLE.includes(have.status)) {
          have.due = x.due
          if (x.type === 'custom' && !have.templateId) have.templateId = tpl
        }
        continue
      }
      db.reports.push({ id: uid(), projectId: p.id, type: x.type, period: x.period, periodStart: x.periodStart, periodEnd: x.periodEnd, due: x.due, sectorId: x.sectorId, templateId: tpl, status: 'open', content: {}, submittedAt: null, submittedById: null, reviewedAt: null, reviewedById: null, reviewNote: null, releasedAt: null, releasedById: null })
      created++
    }
  }
  return created
}

let cache: DemoDb | null = null
function load(): DemoDb {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const j = JSON.parse(raw) as DemoDb
      if (j.v === 1) return (cache = j)
    }
  } catch {
    /* fall through to a fresh copy */
  }
  cache = freshDb()
  save()
  return cache
}
function save() {
  try {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage full or blocked: the demo just forgets */
  }
}
/** Called by "Reset demo" so the programme data starts over too. */
export function resetProgrammeDemo() {
  cache = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

function owners(db: DemoDb, r: Pick<Rep, 'projectId' | 'type' | 'sectorId'>): string[] {
  const team = db.plans[r.projectId]?.team ?? []
  return team.filter((t) => t.role === OWNER_ROLE[r.type] && (r.type !== 'custom' || !r.sectorId || !t.sectorId || t.sectorId === r.sectorId)).map((t) => t.userId)
}

function canPrepare(db: DemoDb, r: Rep) {
  const { user, can } = ctx()
  if (can('reports', 'manage')) return true
  if (!can('reports', 'edit')) return false
  const o = owners(db, r)
  return o.length === 0 || o.includes(user.id)
}

function row(db: DemoDb, r: Rep): ReportRow {
  const p = ctx().s.projects.find((x) => x.id === r.projectId)
  const left = daysBetween(todayIso(), r.due)
  return {
    id: r.id, projectId: r.projectId, projectCode: p?.code ?? r.projectId, projectNameAr: p?.name.ar ?? '', projectNameEn: p?.name.en ?? '', donorId: db.projectDonor[r.projectId] ?? null,
    type: r.type, period: r.period, periodStart: r.periodStart, periodEnd: r.periodEnd, due: r.due, sectorId: r.sectorId, templateId: r.templateId,
    status: r.status, ownerIds: owners(db, r), overdue: EDITABLE.includes(r.status) && left < 0, daysLeft: left,
    submittedAt: r.submittedAt, reviewedAt: r.reviewedAt, reviewNote: r.reviewNote, releasedAt: r.releasedAt,
  }
}

/** What the browser's own data says about the period (the server does the same from its tables). */
function dataFor(db: DemoDb, r: Rep): ReportData {
  const { s } = ctx()
  const acts = s.activities.filter((a) => a.projectId === r.projectId)
  const actIds = new Set(acts.map((a) => a.id))
  const inRange = (d: string, from: string, to: string) => d.slice(0, 10) >= from && d.slice(0, 10) <= to
  const reps = (from: string, to: string, objective?: string) =>
    acts.filter((a) => a.report && (!objective || db.activityObjective[a.id] === objective) && inRange(a.report.doneOn ?? a.report.submittedAt, from, to)).map((a) => ({ a, rep: a.report! }))
  const svcs = (from: string, to: string, objective?: string) =>
    s.beneficiaries.flatMap((b) => b.services.filter((v) => v.activityId && actIds.has(v.activityId) && (!objective || db.activityObjective[v.activityId] === objective) && inRange(v.date, from, to)).map((v) => ({ b, v })))
  const sum = (xs: number[]) => xs.reduce((t, n) => t + n, 0)
  const fr = reps(r.periodStart, r.periodEnd)
  const sv = svcs(r.periodStart, r.periodEnd)
  const distinct = (xs: { b: { id: string } }[]) => new Set(xs.map((x) => x.b.id)).size
  const count = (source: IndicatorSource, objective: string, from: string, to: string) => {
    if (source === 'beneficiaries') return distinct(svcs(from, to, objective))
    if (source === 'services') return svcs(from, to, objective).length
    if (source === 'activities') return reps(from, to, objective).length
    if (source === 'field_beneficiaries') return sum(reps(from, to, objective).map((x) => x.rep.beneficiaries))
    return null
  }
  const plan = db.plans[r.projectId]
  const start = s.projects.find((p) => p.id === r.projectId)?.start.slice(0, 10) ?? r.periodStart
  const indicators: IndicatorValue[] = (plan?.objectives ?? []).flatMap((o) =>
    o.indicators.map((i) => ({ id: i.id, objectiveId: o.id, code: i.code, nameAr: i.nameAr, nameEn: i.nameEn, unit: i.unit, target: i.target, source: i.source, auto: i.source === 'manual' ? null : count(i.source, o.id, r.periodStart, r.periodEnd), cumulative: i.source === 'manual' ? null : count(i.source, o.id, start, r.periodEnd) })),
  )
  const byType = new Map<string, number>()
  for (const x of sv) byType.set(x.v.type, (byType.get(x.v.type) ?? 0) + 1)
  const byOffice = new Map<string, number>()
  for (const x of fr) byOffice.set(x.a.officeId, (byOffice.get(x.a.officeId) ?? 0) + 1)
  const out: ReportData = {
    fieldReports: { n: fr.length, ben: sum(fr.map((x) => x.rep.beneficiaries)), men: sum(fr.map((x) => x.rep.men ?? 0)), women: sum(fr.map((x) => x.rep.women ?? 0)), children: sum(fr.map((x) => x.rep.children ?? 0)) },
    services: { services: sv.length, served: distinct(sv), men: distinct(sv.filter((x) => x.b.gender === 'm')), women: distinct(sv.filter((x) => x.b.gender === 'f')) },
    byService: [...byType].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n),
    byOffice: [...byOffice].map(([officeId, reports]) => ({ officeId, reports })).sort((a, b) => b.reports - a.reports),
    indicators,
  }
  if (r.type === 'quarterly') {
    const months = db.reports.filter((m) => m.projectId === r.projectId && m.type === 'statistics' && m.periodStart >= r.periodStart && m.periodEnd <= r.periodEnd).sort((a, b) => a.period.localeCompare(b.period))
    const manual: Record<string, number> = {}
    for (const m of months) if (['submitted', 'approved', 'released'].includes(m.status)) for (const [k, v] of Object.entries((m.content.values ?? {}) as Record<string, number | null>)) if (typeof v === 'number') manual[k] = (manual[k] ?? 0) + v
    out.monthly = months.map((m) => ({ period: m.period, status: m.status }))
    out.manualTotals = manual
    const p = s.projects.find((x) => x.id === r.projectId)
    const lines = (p?.pillars ?? []).flatMap((pl) => pl.lines)
    const ceiling = lines.reduce((t, l) => t + l.ceilingUSD, 0)
    const spent = lines.reduce((t, l) => t + (s.serverUsage?.[l.id]?.spent ?? 0), 0)
    out.finance = { ceilingUsd: ceiling.toFixed(2), spentUsd: spent.toFixed(2), committedUsd: '0.00', availableUsd: (ceiling - spent).toFixed(2) }
  }
  return out
}

function detail(db: DemoDb, r: Rep, internal = true): ReportDetail {
  const frozen = (r.content.snapshot as ReportData | undefined) && !EDITABLE.includes(r.status) ? (r.content.snapshot as ReportData) : dataFor(db, r)
  const { snapshot: _s, ...content } = r.content
  void _s
  const plan = db.plans[r.projectId]
  const out: ReportDetail = {
    ...row(db, r), content, data: frozen,
    template: r.templateId ? (db.templates.find((t) => t.id === r.templateId) ?? null) : null,
    objectives: (plan?.objectives ?? []).map((o) => ({ id: o.id, code: o.code, nameAr: o.nameAr, nameEn: o.nameEn, sectorId: o.sectorId })),
  }
  if (internal) out.events = db.events[r.id] ?? []
  return out
}

function checkContent(db: DemoDb, r: Rep, c: Record<string, unknown>, forSubmit: boolean) {
  const bad = (code: string, ar: string, en: string) => unprocessable(code, ar, en)
  if (r.type === 'statistics') {
    const ids = new Set((db.plans[r.projectId]?.objectives ?? []).flatMap((o) => o.indicators.map((i) => i.id)))
    for (const k of Object.keys((c.values ?? {}) as object)) if (!ids.has(k)) throw bad('INDICATOR', 'مؤشر لا يتبع هذا المشروع', 'An indicator does not belong to this project')
  }
  if (r.type === 'narrative' || r.type === 'quarterly') {
    if (forSubmit && !String(c.summary ?? '').trim()) throw bad('SUMMARY_REQUIRED', 'اكتب الملخص قبل الإرسال', 'Write the summary before submitting')
  }
  if (r.type === 'custom') {
    const tpl = db.templates.find((t) => t.id === r.templateId)
    const values = (c.values ?? {}) as Record<string, unknown>
    for (const f of tpl?.fields ?? []) {
      const v = values[f.key]
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
      if (empty) {
        if (forSubmit && f.required) throw bad('FIELD_REQUIRED', `الحقل «${f.label.ar}» مطلوب`, `“${f.label.en}” is required`)
        continue
      }
      const wrong = bad('FIELD_TYPE', `قيمة غير صالحة في «${f.label.ar}»`, `Invalid value for “${f.label.en}”`)
      if (f.type === 'number' && typeof v !== 'number') throw wrong
      if (f.type === 'choice' && !(f.options ?? []).includes(String(v))) throw wrong
    }
  }
}

const needPlanEdit = () => {
  if (!ctx().can('projects', 'edit')) throw forbidden()
}
const find = <T extends { id: string }>(xs: T[], id: string, ar: string, en: string) => {
  const x = xs.find((y) => y.id === id)
  if (!x) throw notFound(ar, en)
  return x
}
const allObjectives = (db: DemoDb) => Object.values(db.plans).flatMap((p) => p.objectives)

const demoBackend: Backend = {
  sectors: async () => load().sectors,
  addSector: async (id, nameAr, nameEn) => {
    if (!ctx().can('projects', 'manage')) throw forbidden()
    const db = load()
    if (db.sectors.some((x) => x.id === id)) throw err(409, 'SECTOR_EXISTS', 'القطاع موجود', 'That sector already exists')
    db.sectors.push({ id, nameAr, nameEn, sort: 99 })
    save()
  },
  donors: async () => load().donors,
  saveDonor: async (id, d) => {
    if (!ctx().can('settings', 'manage')) throw forbidden()
    const db = load()
    if (db.donors.some((x) => x.code === d.code && x.id !== id)) throw err(409, 'DONOR_CODE', 'رمز الجهة مستخدم', 'That donor code is already used')
    let out: Donor
    if (id) {
      out = find(db.donors, id, 'الجهة المانحة', 'Donor')
      Object.assign(out, d)
    } else {
      out = { id: `don-${uid().slice(0, 8)}`, ...d }
      db.donors.push(out)
    }
    save()
    return out
  },
  linkDonor: async (projectId, donorId) => {
    needPlanEdit()
    const db = load()
    if (donorId) find(db.donors, donorId, 'الجهة المانحة', 'Donor')
    db.projectDonor[projectId] = donorId
    save()
  },
  projectDonors: async () => load().projectDonor,
  donorUsers: async (id) => load().donorUsers.filter((u) => u.donorId === id),
  addDonorUser: async (donorId, u) => {
    if (!ctx().can('settings', 'manage')) throw forbidden()
    const db = load()
    if (db.donorUsers.some((x) => x.email === u.email.toLowerCase())) throw err(409, 'EMAIL_USED', 'البريد مستخدم', 'That email is already used')
    const out = { id: `du-${uid().slice(0, 8)}`, donorId, email: u.email.toLowerCase(), nameAr: u.nameAr, nameEn: u.nameEn, active: true, temporaryPassword: `Phf-${uid().slice(0, 4)}-${uid().slice(0, 4)}1` }
    db.donorUsers.push(out)
    save()
    return out
  },

  plan: async (id) => {
    const db = load()
    return db.plans[id] ?? { projectId: id, sectors: [], objectives: [], team: [], milestones: [], schedule: { projectId: id, enabled: false, monthlyDueDay: 10, quarterlyDueDay: 20, notifyDaysBefore: 5 }, scheduled: false }
  },
  setSectors: async (id, sectorIds) => {
    needPlanEdit()
    const db = load()
    if (sectorIds.some((x) => !db.sectors.some((s) => s.id === x))) throw unprocessable('SECTOR', 'قطاع غير معروف', 'Unknown sector')
    plan(db, id).sectors = [...new Set(sectorIds)]
    save()
  },
  setTeam: async (id, members) => {
    needPlanEdit()
    const db = load()
    const users = ctx().s.users
    for (const m of members) if (!users.some((u) => u.id === m.userId && u.active !== false && !u.donorId)) throw unprocessable('TEAM_USER', 'مستخدم غير موجود أو غير فعّال', 'A team member is not an active staff user')
    const seen = new Set<string>()
    plan(db, id).team = members.filter((m) => !seen.has(`${m.role}:${m.userId}`) && seen.add(`${m.role}:${m.userId}`)).map((m) => ({ role: m.role, userId: m.userId, sectorId: m.role === 'project_office' ? m.sectorId : null }))
    ensureSlots(db, id)
    save()
  },
  setSchedule: async (id, sc) => {
    needPlanEdit()
    const db = load()
    if (sc.monthlyDueDay < 1 || sc.monthlyDueDay > 28 || sc.quarterlyDueDay < 1 || sc.quarterlyDueDay > 28) throw err(400, 'VALIDATION', 'بيانات غير صالحة', 'Invalid input')
    const p = plan(db, id)
    p.schedule = { projectId: id, ...sc }
    p.scheduled = true
    ensureSlots(db, id)
    save()
  },
  generate: async (id) => {
    needPlanEdit()
    const db = load()
    const n = ensureSlots(db, id)
    save()
    return n
  },
  addObjective: async (id, o) => {
    needPlanEdit()
    const db = load()
    const p = plan(db, id)
    if (p.objectives.some((x) => x.code === o.code)) throw err(409, 'OBJECTIVE_CODE', 'رمز الهدف مستخدم في هذا المشروع', 'That objective code is already used in this project')
    p.objectives.push({ id: uid(), projectId: id, sectorId: o.sectorId, code: o.code, nameAr: o.nameAr, nameEn: o.nameEn, sort: p.objectives.length + 1, indicators: [] })
    save()
  },
  editObjective: async (id, o) => {
    needPlanEdit()
    const db = load()
    const x = find(allObjectives(db), id, 'الهدف', 'Objective')
    if (o.code && db.plans[x.projectId].objectives.some((y) => y.code === o.code && y.id !== id)) throw err(409, 'OBJECTIVE_CODE', 'رمز الهدف مستخدم في هذا المشروع', 'That objective code is already used in this project')
    Object.assign(x, o)
    save()
  },
  removeObjective: async (id) => {
    needPlanEdit()
    const db = load()
    const x = find(allObjectives(db), id, 'الهدف', 'Objective')
    db.plans[x.projectId].objectives = db.plans[x.projectId].objectives.filter((y) => y.id !== id)
    for (const [a, o] of Object.entries(db.activityObjective)) if (o === id) delete db.activityObjective[a]
    save()
  },
  addIndicator: async (objectiveId, i) => {
    needPlanEdit()
    const db = load()
    const o = find(allObjectives(db), objectiveId, 'الهدف', 'Objective')
    if (o.indicators.some((x) => x.code === i.code)) throw err(409, 'INDICATOR_CODE', 'رمز المؤشر مستخدم في هذا الهدف', 'That indicator code is already used for this objective')
    o.indicators.push({ id: uid(), objectiveId, sort: o.indicators.length + 1, ...i })
    save()
  },
  editIndicator: async (id, i) => {
    needPlanEdit()
    const db = load()
    const x = find(allObjectives(db).flatMap((o) => o.indicators), id, 'المؤشر', 'Indicator')
    Object.assign(x, i)
    save()
  },
  removeIndicator: async (id) => {
    needPlanEdit()
    const db = load()
    for (const o of allObjectives(db)) o.indicators = o.indicators.filter((x) => x.id !== id)
    save()
  },
  setActivityObjective: async (activityId, objectiveId) => {
    if (!ctx().can('activities', 'edit')) throw forbidden()
    const db = load()
    const a = find(ctx().s.activities, activityId, 'النشاط', 'Activity')
    if (objectiveId) {
      const o = find(allObjectives(db), objectiveId, 'الهدف', 'Objective')
      if (o.projectId !== a.projectId) throw unprocessable('OBJECTIVE_PROJECT', 'الهدف لا يتبع مشروع النشاط', 'That objective belongs to a different project')
      db.activityObjective[activityId] = objectiveId
    } else delete db.activityObjective[activityId]
    save()
  },
  activityObjectives: async () => load().activityObjective,

  milestones: async (q) => Object.values(load().plans).flatMap((p) => p.milestones).filter((m) => !q?.projectId || m.projectId === q.projectId).sort((a, b) => a.due.localeCompare(b.due)),
  addMilestone: async (projectId, m) => {
    needPlanEdit()
    const db = load()
    plan(db, projectId).milestones.push({ id: uid(), projectId, doneAt: m.status === 'done' ? new Date().toISOString() : null, ...m })
    save()
  },
  editMilestone: async (id, m) => {
    const db = load()
    const x = find(Object.values(db.plans).flatMap((p) => p.milestones), id, 'المعلم', 'Milestone')
    const { user, can } = ctx()
    const onlyStatus = Object.keys(m).every((k) => k === 'status')
    if (!can('projects', 'edit') && !(x.ownerId === user.id && onlyStatus)) throw forbidden('يمكن للمسؤول تحديث حالة معلمه فقط', 'The owner may update the status of their own milestone only')
    Object.assign(x, m)
    if (m.status !== undefined) x.doneAt = m.status === 'done' ? (x.doneAt ?? new Date().toISOString()) : null
    save()
  },
  removeMilestone: async (id) => {
    needPlanEdit()
    const db = load()
    for (const p of Object.values(db.plans)) p.milestones = p.milestones.filter((x) => x.id !== id)
    save()
  },

  reports: async (q) => {
    const db = load()
    if (ensureSlots(db)) save()
    const me = ctx().user.id
    return db.reports
      .filter((r) => (!q?.projectId || r.projectId === q.projectId) && (!q?.type || r.type === q.type) && (!q?.status || r.status === q.status) && (!q?.period || r.period === q.period) && (!q?.waiting || r.status === 'submitted'))
      .map((r) => row(db, r))
      .filter((r) => !q?.mine || r.ownerIds.includes(me))
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || a.type.localeCompare(b.type))
  },
  report: async (id) => {
    const db = load()
    return detail(db, find(db.reports, id, 'التقرير', 'Report'))
  },
  saveReport: async (id, content) => {
    const db = load()
    const r = find(db.reports, id, 'التقرير', 'Report')
    if (!canPrepare(db, r)) throw forbidden('هذا التقرير يعدّه فريق المشروع المعيّن له', 'This report is prepared by the team member assigned to it')
    if (!EDITABLE.includes(r.status)) throw err(409, 'LOCKED', 'التقرير مرسل ولا يُعدَّل. اطلب من PMO إعادته', 'This report has been submitted. Ask the PMO to return it first')
    checkContent(db, r, content, false)
    r.content = content
    r.status = 'draft'
    save()
    return detail(db, r)
  },
  submitReport: async (id) => {
    const db = load()
    const r = find(db.reports, id, 'التقرير', 'Report')
    if (!canPrepare(db, r)) throw forbidden('هذا التقرير يعدّه فريق المشروع المعيّن له', 'This report is prepared by the team member assigned to it')
    if (!EDITABLE.includes(r.status)) throw err(409, 'LOCKED', 'التقرير أُرسل من قبل', 'This report was already submitted')
    checkContent(db, r, r.content, true)
    r.content = { ...r.content, snapshot: dataFor(db, r) }
    Object.assign(r, { status: 'submitted', submittedAt: new Date().toISOString(), submittedById: ctx().user.id, reviewedAt: null, reviewedById: null, reviewNote: null })
    ;(db.events[id] ??= []).push({ at: new Date().toISOString(), userId: ctx().user.id, action: 'submit', note: null })
    save()
    return detail(db, r)
  },
  reviewReport: async (id, decision, note) => {
    const db = load()
    const r = find(db.reports, id, 'التقرير', 'Report')
    const { user, can } = ctx()
    if (!can('reports', 'manage')) throw forbidden()
    if (r.status !== 'submitted') throw err(409, 'NOT_SUBMITTED', 'التقرير ليس بانتظار المراجعة', 'This report is not waiting for review')
    if (r.submittedById === user.id) throw forbidden('لا تراجع تقريراً أرسلته بنفسك', 'You cannot review a report you submitted yourself')
    if (decision === 'return' && !note?.trim()) throw unprocessable('NOTE_REQUIRED', 'اكتب سبب الإعادة', 'Say why you are returning it')
    Object.assign(r, { status: decision === 'approve' ? 'approved' : 'returned', reviewedAt: new Date().toISOString(), reviewedById: user.id, reviewNote: note?.trim() || null })
    ;(db.events[id] ??= []).push({ at: new Date().toISOString(), userId: user.id, action: decision === 'approve' ? 'approve' : 'return', note: note?.trim() || null })
    save()
    return detail(db, r)
  },
  releaseReport: async (id) => {
    const db = load()
    const r = find(db.reports, id, 'التقرير', 'Report')
    const { user, can } = ctx()
    if (!can('reports', 'manage')) throw forbidden()
    if (r.status !== 'approved') throw err(409, 'NOT_APPROVED', 'لا يُفرج إلا عن تقرير معتمد', 'Only an approved report can be released')
    if (!db.projectDonor[r.projectId]) throw unprocessable('NO_DONOR', 'اربط المشروع بجهة مانحة أولاً', 'Link the project to a donor first')
    Object.assign(r, { status: 'released', releasedAt: new Date().toISOString(), releasedById: user.id })
    ;(db.events[id] ??= []).push({ at: new Date().toISOString(), userId: user.id, action: 'release', note: null })
    save()
    return detail(db, r)
  },
  reopenReport: async (id, note) => {
    const db = load()
    const r = find(db.reports, id, 'التقرير', 'Report')
    const { user, can } = ctx()
    if (!can('reports', 'manage')) throw forbidden()
    if (r.status !== 'approved' && r.status !== 'released') throw err(409, 'NOT_FINAL', 'يُسحب التقرير المعتمد أو المفرج عنه فقط', 'Only an approved or released report can be pulled back')
    if (!note.trim()) throw unprocessable('NOTE_REQUIRED', 'اكتب سبب السحب', 'Say why you are pulling it back')
    Object.assign(r, { status: 'returned', releasedAt: null, releasedById: null, reviewNote: note.trim() })
    ;(db.events[id] ??= []).push({ at: new Date().toISOString(), userId: user.id, action: 'reopen', note: note.trim() })
    save()
    return detail(db, r)
  },
  templates: async () => load().templates,
  saveTemplate: async (id, t) => {
    if (!ctx().can('reports', 'manage')) throw forbidden()
    const db = load()
    const keys = t.fields.map((f) => f.key)
    if (new Set(keys).size !== keys.length) throw unprocessable('FIELD_KEYS', 'مفاتيح الحقول يجب ألا تتكرر', 'Field keys must be unique')
    for (const f of t.fields) {
      if (f.type === 'choice' && !f.options?.length) throw unprocessable('CHOICE_OPTIONS', `حدد خيارات الحقل «${f.label.ar}»`, `Give “${f.label.en}” some options`)
      if (f.type === 'table' && !f.columns?.length) throw unprocessable('TABLE_COLUMNS', `حدد أعمدة الجدول «${f.label.ar}»`, `Give the table “${f.label.en}” some columns`)
    }
    if (id) Object.assign(find(db.templates, id, 'النموذج', 'Template'), t)
    else db.templates.push({ id: `tpl-${uid().slice(0, 8)}`, ...t })
    ensureSlots(db)
    save()
  },

  portalMe: async () => {
    const db = load()
    const donorId = donorOf(db)
    const donor = find(db.donors, donorId, 'الجهة المانحة', 'Donor')
    const { s } = ctx()
    return { donor, projects: s.projects.filter((p) => db.projectDonor[p.id] === donorId).map((p) => ({ id: p.id, code: p.code, nameAr: p.name.ar, nameEn: p.name.en, startDate: p.start.slice(0, 10), endDate: p.end.slice(0, 10) })) }
  },
  portalReports: async () => {
    const db = load()
    const donorId = donorOf(db)
    return db.reports
      .filter((r) => r.status === 'released' && db.projectDonor[r.projectId] === donorId)
      .map((r) => {
        const x = row(db, r)
        return { id: r.id, projectId: r.projectId, projectCode: x.projectCode, projectNameAr: x.projectNameAr, projectNameEn: x.projectNameEn, type: r.type, period: r.period, periodStart: r.periodStart, periodEnd: r.periodEnd, sectorId: r.sectorId, releasedAt: r.releasedAt! }
      })
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || a.type.localeCompare(b.type))
  },
  portalReport: async (id) => {
    const db = load()
    const donorId = donorOf(db)
    const r = db.reports.find((x) => x.id === id && x.status === 'released' && db.projectDonor[x.projectId] === donorId)
    if (!r) throw notFound('التقرير', 'Report')
    const { events: _e, reviewNote: _n, submittedAt: _s, reviewedAt: _r, ownerIds: _o, ...safe } = detail(db, r, false) as ReportDetail & { events?: unknown }
    void _e, _n, _s, _r, _o
    return { ...safe, reviewNote: null, submittedAt: null, reviewedAt: null, ownerIds: [] } as ReportDetail
  },
  portalExpenditure: async (id, currency) => {
    const db = load()
    const donorId = donorOf(db)
    const r = db.reports.find((x) => x.id === id && x.status === 'released' && db.projectDonor[x.projectId] === donorId)
    if (!r) throw notFound('التقرير', 'Report')
    if (r.type !== 'quarterly') throw unprocessable('NOT_QUARTERLY', 'تقرير المصروفات للتقرير الربع سنوي فقط', 'The expenditure report belongs to the quarterly report')
    const { demoExpenditure, downloadExpenditureXlsx } = await import('../lib/reports/donor')
    const data = demoExpenditure(useStore.getState(), r.projectId, r.periodStart, r.periodEnd, {})
    await downloadExpenditureXlsx(data, r.periodStart, r.periodEnd, currency)
  },
}

const plan = (db: DemoDb, id: string): Plan => {
  const p = db.plans[id]
  if (p) return p
  return (db.plans[id] = { projectId: id, sectors: [], objectives: [], team: [], milestones: [], schedule: { projectId: id, enabled: true, monthlyDueDay: 10, quarterlyDueDay: 20, notifyDaysBefore: 5 }, scheduled: false })
}
function donorOf(db: DemoDb): string {
  const { user } = ctx()
  const own = user.donorId ?? db.donorUsers.find((d) => d.id === user.id)?.donorId
  if (!own) throw forbidden('هذه البوابة لممثلي الجهات المانحة', 'This portal is for donor representatives')
  return own
}

export const backend: Backend = LIVE ? liveBackend : demoBackend

// ─── hooks for the screens ───────────────────────────────────────────────────

export function errMsg(e: unknown, ar: boolean) {
  if (e instanceof ApiError) return e.msg[ar ? 'ar' : 'en']
  return ar ? 'حدث خطأ غير متوقع. حاول مجدداً.' : 'Something unexpected went wrong. Please try again.'
}

/** Loads something from the backend and reloads it on request. Keeps the previous value while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const seq = useRef(0)
  const run = useCallback(() => {
    const mine = ++seq.current
    setLoading(true)
    return fn()
      .then((d) => mine === seq.current && (setData(d), setError(null)))
      .catch((e) => mine === seq.current && setError(e))
      .finally(() => mine === seq.current && setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    void run()
  }, [run])
  return { data, loading, error, reload: run }
}

/** Runs a change: shows the server's own message if it is refused (returns false), otherwise toasts and returns true. */
export function useDo() {
  const toast = useStore((s) => s.toast)
  const ar = useStore((s) => s.lang) === 'ar'
  return useCallback(
    async (run: () => Promise<unknown>, ok?: { ar: string; en: string }): Promise<boolean> => {
      try {
        await run()
      } catch (e) {
        toast({ ar: errMsg(e, true), en: errMsg(e, false) }, 'bad')
        return false
      }
      if (ok) toast(ok, 'ok')
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast, ar],
  )
}

export { dueDate, monthRange, quarterRange }
