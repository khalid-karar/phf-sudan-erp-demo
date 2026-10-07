import { and, eq, inArray, lte, or, isNull, gte } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { employeeAllocations, employees, leaveRequests } from '../db/schema'
import { pctOf, sdgToUsd, toCents, toRate4, type Cents } from '../lib/money'

export const daysInMonth = (period: string) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const periodStart = (period: string) => `${period}-01`
export const periodEnd = (period: string) => `${period}-${String(daysInMonth(period)).padStart(2, '0')}`

const dayNo = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000)
/** Calendar days two ISO dates cover together, both ends included (0 when they do not overlap). */
export function overlapDays(aFrom: string, aTo: string, bFrom: string, bTo: string) {
  const from = aFrom > bFrom ? aFrom : bFrom
  const to = aTo < bTo ? aTo : bTo
  return to < from ? 0 : dayNo(to) - dayNo(from) + 1
}
export const inclusiveDays = (from: string, to: string) => dayNo(to) - dayNo(from) + 1

export interface PayrollRow {
  employeeId: string
  no: string
  nameAr: string
  nameEn: string
  officeId: string
  salarySdg: Cents
  payDays: number // days paid in the month
  unpaidLeaveDays: number
  grossSdg: Cents
  deductionSdg: Cents
  netSdg: Cents
  parts: { projectId: string | null; lineId: string | null; sdg: Cents; usd: Cents }[]
}

export interface PayrollCalc {
  period: string
  rate4: number
  deductionPct: string
  rows: PayrollRow[]
  grossSdg: Cents
  deductionSdg: Cents
  netSdg: Cents
  grossUsd: Cents
  deductionUsd: Cents
  /** Salary charged to each budget line (USD cents), across all employees. */
  byLine: Map<string, { projectId: string; usd: Cents }>
}

/**
 * Works out a month's salaries. Part months are paid by the day, approved unpaid leave is not paid,
 * the employee insurance share is withheld, and each salary is charged to project lines by allocation %.
 * Rounding: every allocation is rounded in SDG and the last one takes the remainder, so nothing is lost.
 */
export async function computePayroll(tx: DbOrTx, period: string, rate: string, deductionPct: string): Promise<PayrollCalc> {
  const rate4 = toRate4(rate)
  const start = periodStart(period)
  const end = periodEnd(period)
  const dim = daysInMonth(period)
  const emps = await tx
    .select()
    .from(employees)
    .where(and(lte(employees.startDate, end), or(isNull(employees.endDate), gte(employees.endDate, start))))
    .orderBy(employees.no)
  const eligible = emps.filter((e) => e.status === 'active' || (e.endDate !== null && e.endDate >= start))
  const ids = eligible.map((e) => e.id)
  const allocs = ids.length ? await tx.select().from(employeeAllocations).where(inArray(employeeAllocations.employeeId, ids)) : []
  const unpaid = ids.length
    ? await tx.select().from(leaveRequests).where(and(inArray(leaveRequests.employeeId, ids), eq(leaveRequests.type, 'unpaid'), eq(leaveRequests.status, 'approved'), lte(leaveRequests.fromDate, end), gte(leaveRequests.toDate, start)))
    : []

  const rows: PayrollRow[] = []
  const byLine = new Map<string, { projectId: string; usd: Cents }>()
  for (const e of eligible) {
    const salary = toCents(e.salarySdg)
    if (salary <= 0) continue
    const from = e.startDate > start ? e.startDate : start
    const to = e.endDate && e.endDate < end ? e.endDate : end
    const employed = overlapDays(from, to, start, end)
    if (employed <= 0) continue
    // Unpaid days count once even if two requests overlap: collect distinct days inside the employed window.
    const days = new Set<number>()
    for (const l of unpaid.filter((x) => x.employeeId === e.id)) {
      const lf = l.fromDate > from ? l.fromDate : from
      const lt = l.toDate < to ? l.toDate : to
      for (let d = dayNo(lf); d <= dayNo(lt); d++) days.add(d)
    }
    const unpaidDays = Math.min(days.size, employed)
    const payDays = employed - unpaidDays
    if (payDays <= 0) continue
    const gross = payDays === dim ? salary : Math.round((salary * payDays) / dim)
    const ded = pctOf(gross, deductionPct)
    const mine = allocs.filter((a) => a.employeeId === e.id)
    const parts: PayrollRow['parts'] = []
    let left = gross
    let pctLeft = 100
    for (const a of mine) {
      pctLeft -= a.pct
      const sdgPart = pctLeft <= 0 ? left : Math.round((gross * a.pct) / 100)
      left -= sdgPart
      parts.push({ projectId: a.projectId, lineId: a.lineId, sdg: sdgPart, usd: sdgToUsd(sdgPart, rate4) })
    }
    if (left > 0) parts.push({ projectId: null, lineId: null, sdg: left, usd: sdgToUsd(left, rate4) })
    for (const p of parts) if (p.lineId) byLine.set(p.lineId, { projectId: p.projectId!, usd: (byLine.get(p.lineId)?.usd ?? 0) + p.usd })
    rows.push({ employeeId: e.id, no: e.no, nameAr: e.nameAr, nameEn: e.nameEn, officeId: e.officeId, salarySdg: salary, payDays, unpaidLeaveDays: unpaidDays, grossSdg: gross, deductionSdg: ded, netSdg: gross - ded, parts })
  }
  const sum = (f: (r: PayrollRow) => Cents) => rows.reduce((t, r) => t + f(r), 0)
  const grossUsd = rows.reduce((t, r) => t + r.parts.reduce((x, p) => x + p.usd, 0), 0)
  const deductionSdg = sum((r) => r.deductionSdg)
  return { period, rate4, deductionPct, rows, grossSdg: sum((r) => r.grossSdg), deductionSdg, netSdg: sum((r) => r.netSdg), grossUsd, deductionUsd: Math.min(grossUsd, sdgToUsd(deductionSdg, rate4)), byLine }
}
