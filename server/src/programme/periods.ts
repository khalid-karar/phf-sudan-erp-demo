// Reporting calendar maths: which monthly and quarterly reports a project owes, and when each is due.
// Plain ISO date strings (YYYY-MM-DD) throughout, computed in UTC so the result never shifts with the server's time zone.

export type ReportType = 'statistics' | 'narrative' | 'custom' | 'quarterly'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m is 1-based

/** First and last day of a YYYY-MM month. */
export function monthRange(period: string) {
  const [y, m] = period.split('-').map(Number)
  return { start: iso(y, m, 1), end: iso(y, m, lastDay(y, m)) }
}

/** First and last day of a YYYY-Qn quarter. */
export function quarterRange(period: string) {
  const [ys, q] = period.split('-Q')
  const y = Number(ys)
  const m0 = (Number(q) - 1) * 3 + 1
  return { start: iso(y, m0, 1), end: iso(y, m0 + 2, lastDay(y, m0 + 2)) }
}

export const quarterOf = (date: string) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`

/** Every YYYY-MM from `from` to `to` (inclusive, by month). */
export function monthsBetween(from: string, to: string) {
  const out: string[] = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const [ey, em] = to.slice(0, 7).split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** The date a report is due: `day` of the month after the period ends. */
export function dueDate(periodEnd: string, day: number) {
  let y = Number(periodEnd.slice(0, 4))
  let m = Number(periodEnd.slice(5, 7)) + 1
  if (m > 12) {
    m = 1
    y++
  }
  return iso(y, m, Math.min(day, lastDay(y, m)))
}

export interface SlotInput {
  start: string // project start
  end: string // project end
  monthlyDueDay: number
  quarterlyDueDay: number
  today: string
  customSectors: (string | null)[] // one custom monthly report per project-office sector
}
export interface Slot {
  type: ReportType
  period: string
  periodStart: string
  periodEnd: string
  due: string
  sectorId: string | null
}

/**
 * Report slots from the project's start up to the current month/quarter (future ones are created when their time comes).
 * The first and last period are clipped to the project's own dates.
 */
export function slotsFor(i: SlotInput): Slot[] {
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

export const today = () => new Date().toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
