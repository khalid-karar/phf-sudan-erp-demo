// Reporting-calendar maths and labels for programme management. Mirrors server/src/programme/periods.ts
// (the demo runs without the server, so it needs its own copy).
import type { Bi } from '../data/types'

export type ReportType = 'statistics' | 'narrative' | 'custom' | 'quarterly'
export type ReportStatus = 'open' | 'draft' | 'submitted' | 'returned' | 'approved' | 'released'
export type TeamRole = 'project_manager' | 'project_coordinator' | 'project_office'
export type MilestoneStatus = 'planned' | 'in_progress' | 'done' | 'delayed'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
export const todayIso = () => new Date().toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export function monthRange(period: string) {
  const [y, m] = period.split('-').map(Number)
  return { start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)) }
}
export function quarterRange(period: string) {
  const [ys, q] = period.split('-Q')
  const y = Number(ys)
  const m0 = (Number(q) - 1) * 3 + 1
  return { start: iso(y, m0, 1), end: iso(y, m0 + 2, lastDay(y, m0 + 2)) }
}
export const quarterOf = (date: string) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`
export function monthsBetween(from: string, to: string) {
  const out: string[] = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const [ey, em] = to.slice(0, 7).split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad(m)}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}
export function dueDate(periodEnd: string, day: number) {
  let y = Number(periodEnd.slice(0, 4))
  let m = Number(periodEnd.slice(5, 7)) + 1
  if (m > 12) {
    m = 1
    y++
  }
  return iso(y, m, Math.min(day, lastDay(y, m)))
}

export interface Slot { type: ReportType; period: string; periodStart: string; periodEnd: string; due: string; sectorId: string | null }
export function slotsFor(i: { start: string; end: string; monthlyDueDay: number; quarterlyDueDay: number; today: string; customSectors: (string | null)[] }): Slot[] {
  const out: Slot[] = []
  const upTo = i.end < i.today ? i.end : i.today
  if (upTo < i.start) return out
  for (const p of monthsBetween(i.start, upTo)) {
    const r = monthRange(p)
    const periodStart = r.start < i.start ? i.start : r.start
    const periodEnd = r.end > i.end ? i.end : r.end
    const due = dueDate(r.end, i.monthlyDueDay)
    out.push({ type: 'statistics', period: p, periodStart, periodEnd, due, sectorId: null })
    out.push({ type: 'narrative', period: p, periodStart, periodEnd, due, sectorId: null })
    for (const s of new Set(i.customSectors)) out.push({ type: 'custom', period: p, periodStart, periodEnd, due, sectorId: s })
  }
  const seen = new Set<string>()
  for (const p of monthsBetween(i.start, upTo)) {
    const q = quarterOf(`${p}-01`)
    if (seen.has(q)) continue
    seen.add(q)
    const r = quarterRange(q)
    out.push({ type: 'quarterly', period: q, periodStart: r.start < i.start ? i.start : r.start, periodEnd: r.end > i.end ? i.end : r.end, due: dueDate(r.end, i.quarterlyDueDay), sectorId: null })
  }
  return out
}

/** "2026-09" → "September 2026" / "سبتمبر 2026"; "2026-Q3" → "Q3 2026" / "الربع 3 — 2026". */
export function periodLabel(period: string, ar: boolean) {
  if (period.includes('-Q')) {
    const [y, q] = period.split('-Q')
    return ar ? `الربع ${q} — ${y}` : `Q${q} ${y}`
  }
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(ar ? 'ar' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export const TYPE_LABEL: Record<ReportType, Bi> = {
  statistics: { ar: 'التقرير الإحصائي', en: 'Statistics report' },
  narrative: { ar: 'التقرير السردي', en: 'Narrative report' },
  custom: { ar: 'التقرير المخصص', en: 'Custom report' },
  quarterly: { ar: 'التقرير الربع سنوي', en: 'Quarterly report' },
}
export const TYPE_OWNER: Record<ReportType, Bi> = {
  statistics: { ar: 'مدير المشروع', en: 'Project manager' },
  narrative: { ar: 'منسق المشروع', en: 'Project coordinator' },
  custom: { ar: 'مكتب المشروع', en: 'Project office' },
  quarterly: { ar: 'مدير المشروع', en: 'Project manager' },
}
export const STATUS_LABEL: Record<ReportStatus, Bi & { cls: string }> = {
  open: { ar: 'لم يبدأ', en: 'Not started', cls: 'bg-sand text-ink' },
  draft: { ar: 'مسودة', en: 'Draft', cls: 'bg-amber-100 text-amber-900' },
  submitted: { ar: 'بانتظار مراجعة PMO', en: 'Waiting for PMO', cls: 'bg-sky-100 text-sky-900' },
  returned: { ar: 'أُعيد للتعديل', en: 'Returned', cls: 'bg-crescent-soft text-crescent' },
  approved: { ar: 'معتمد', en: 'Approved', cls: 'bg-indigo-100 text-indigo-900' },
  released: { ar: 'أُفرج عنه للمانح', en: 'Released to donor', cls: 'bg-leaf/15 text-leaf' },
}
export const TEAM_LABEL: Record<TeamRole, Bi> = {
  project_manager: { ar: 'مدير المشروع', en: 'Project manager' },
  project_coordinator: { ar: 'منسق المشروع', en: 'Project coordinator' },
  project_office: { ar: 'مكتب المشروع', en: 'Project office' },
}
export const MILESTONE_LABEL: Record<MilestoneStatus, Bi & { cls: string }> = {
  planned: { ar: 'مخطط', en: 'Planned', cls: 'bg-sand text-ink' },
  in_progress: { ar: 'قيد التنفيذ', en: 'In progress', cls: 'bg-amber-100 text-amber-900' },
  done: { ar: 'مكتمل', en: 'Done', cls: 'bg-leaf/15 text-leaf' },
  delayed: { ar: 'متأخر', en: 'Delayed', cls: 'bg-crescent-soft text-crescent' },
}
export const SOURCE_LABEL: Record<string, Bi> = {
  manual: { ar: 'يدوي', en: 'Typed in' },
  beneficiaries: { ar: 'مستفيدون (من سجل المستفيدين)', en: 'People served (register)' },
  services: { ar: 'خدمات مقدمة (من السجل)', en: 'Services given (register)' },
  activities: { ar: 'أنشطة منفذة (تقارير فنية)', en: 'Activities done (field reports)' },
  field_beneficiaries: { ar: 'مستفيدون (من التقارير الفنية)', en: 'People (field reports)' },
}
export const SERVICE_LABEL_KEY = 'serviceName'
