// The monthly headquarters report in live mode: the server computes the figures from the ledger, the screen lays them out.
import { useCallback, useEffect, useState } from 'react'
import type { Bi, HqDraft, Office } from '../data/types'
import { periodRange, type MonthlyData } from '../lib/reportData'
import { useStore } from '../lib/store'
import { api } from './http'
import { n } from './map'

interface Usage { original: string; ceiling: string; spent: string; inKind: string; committed: string; pending: string; available: string }
export interface MonthlyDto {
  period: string
  rate: { rate: string; date: string } | null
  received: string
  receiptCount: number
  spent: string
  fx: string
  byOffice: { office: { id: string; nameAr: string; nameEn: string; stateAr: string; stateEn: string; type: string }; spent: string; expenses: number; matched: number; activities: number; beneficiaries: number; closed: boolean }[]
  activitiesDone: number
  people: { men: number; women: number; children: number }
  beneficiaries: number
  compliance: number
  approvals: { created: number; decided: number; avgHours: number | null }
  projects: { id: string; elapsed: number; burn: number; monthSpent: string; usage: Usage; pillars: { id: string; usage: Usage }[] }[]
  cashFund: { received: string; spent: string }
  advances: { open: number; total: string; overdue: number; overdueTotal: string }
  gaps: { spendNoReport: { count: number }; reportOverdue: { count: number }; reportNoSpend: { count: number } }
  inKind: { received: string; issued: string }
  staff: { total: number; offices: number }
  upcoming: { id: string; titleAr: string; titleEn: string; due: string }[]
  plannedNext: { code: string; titleAr: string; titleEn: string; plannedDate: string }[]
  draft: { status: 'draft' | 'approved' | 'sent'; summary: Bi | null; challenges: Bi | null; plan: Bi | null; approvedById: string | null; approvedAt: string | null }
}

const usage = (u: Usage) => ({ ceiling: n(u.ceiling), original: n(u.original), spent: n(u.spent), committed: n(u.committed), pending: n(u.pending), available: n(u.available) })
const bi = (a: string, e: string): Bi => ({ ar: a, en: e })
// A language left blank means "not customised": the report falls back to its automatic text for that language.
const part = (b: Bi | null) => (b && (b.ar || b.en) ? ({ ar: b.ar || undefined, en: b.en || undefined } as unknown as Bi) : undefined)

export function draftFrom(period: string, d: MonthlyDto['draft']): HqDraft {
  return { period, status: d.status, summary: part(d.summary), challenges: part(d.challenges), plan: part(d.plan), approvedBy: d.approvedById ?? undefined, approvedAt: d.approvedAt ?? undefined }
}

export function fromServer(sv: MonthlyDto, s: ReturnType<typeof useStore.getState>): MonthlyData {
  const { start, end } = periodRange(sv.period)
  const officeOf = (o: MonthlyDto['byOffice'][number]['office']): Office => s.offices.find((x) => x.id === o.id) ?? { id: o.id, name: bi(o.nameAr, o.nameEn), state: bi(o.stateAr, o.stateEn), lat: 0, lon: 0, isHQ: o.type === 'hq', type: o.type as Office['type'] }
  const projects = sv.projects.flatMap((p) => {
    const project = s.projects.find((x) => x.id === p.id)
    if (!project) return []
    return [{ project, usage: usage(p.usage), elapsed: p.elapsed, burn: p.burn, monthSpent: n(p.monthSpent), pillars: project.pillars.map((pillar) => ({ pillar, usage: usage(p.pillars.find((x) => x.id === pillar.id)?.usage ?? p.usage) })) }]
  })
  const doneActs = s.activities.filter((a) => a.report && +new Date(a.report.doneOn ?? a.date) >= +start && +new Date(a.report.doneOn ?? a.date) <= +end)
  return {
    period: sv.period,
    start,
    end,
    rate: n(sv.rate?.rate),
    received: n(sv.received),
    receiptCount: sv.receiptCount,
    spent: n(sv.spent),
    fx: n(sv.fx),
    byOffice: sv.byOffice.map((o) => ({ office: officeOf(o.office), spent: n(o.spent), expenses: o.expenses, matched: o.matched, activities: o.activities, beneficiaries: o.beneficiaries, closed: o.closed })),
    doneCount: sv.activitiesDone,
    highlights: doneActs.slice(0, 6).map((a) => ({ id: a.id, title: a.title, summary: a.report!.summary })),
    people: sv.people,
    beneficiaries: sv.beneficiaries,
    compliance: sv.compliance,
    reqCount: sv.approvals.created,
    decidedCount: sv.approvals.decided,
    avgApprovalHours: sv.approvals.avgHours,
    projects,
    cashFund: { received: n(sv.cashFund.received), spent: n(sv.cashFund.spent) },
    openAdvTotal: n(sv.advances.total),
    overdueAdvCount: sv.advances.overdue,
    overdueAdvTotal: n(sv.advances.overdueTotal),
    gapCount: sv.gaps.spendNoReport.count + sv.gaps.reportOverdue.count + sv.gaps.reportNoSpend.count,
    inKind: { received: n(sv.inKind.received), issued: n(sv.inKind.issued) },
    staff: sv.staff,
    upcoming: sv.upcoming.map((d) => ({ id: d.id, due: d.due, title: bi(d.titleAr, d.titleEn) })),
    plannedNext: sv.plannedNext.map((a) => ({ id: a.code, date: a.plannedDate, title: bi(a.titleAr, a.titleEn) })),
  }
}

/** Fetches a month's report from the server (and puts its saved draft into the store so the editor reads it). */
export function useServerMonthly(period: string, enabled: boolean) {
  const [sv, setSv] = useState<MonthlyDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!enabled) return
    try {
      const r = await api.get<MonthlyDto>(`/reports/monthly?period=${period}`)
      setSv(r)
      setError(null)
      useStore.setState((st) => ({ hqDrafts: [...st.hqDrafts.filter((d) => d.period !== period), draftFrom(period, r.draft)] }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    }
  }, [period, enabled])
  useEffect(() => {
    setSv(null)
    void load()
  }, [load])
  return { sv, error, reload: load }
}
