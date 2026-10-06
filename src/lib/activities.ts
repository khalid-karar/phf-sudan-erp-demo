import type { FieldActivity } from '../data/types'
import type { useStore } from './store'

type S = ReturnType<typeof useStore.getState>

export type ActivityStatus = 'planned' | 'awaiting_report' | 'report_overdue' | 'reported' | 'matched' | 'unfunded'

export const statusName: Record<ActivityStatus, { ar: string; en: string }> = {
  planned: { ar: 'مخطط', en: 'Planned' },
  awaiting_report: { ar: 'بانتظار التقرير', en: 'Awaiting report' },
  report_overdue: { ar: 'التقرير متأخر', en: 'Report overdue' },
  reported: { ar: 'رُفع التقرير', en: 'Reported' },
  matched: { ar: 'مطابق', en: 'Matched' },
  unfunded: { ar: 'تقرير بلا صرف', en: 'Report, no spend' },
}

export const statusTone: Record<ActivityStatus, string> = {
  planned: 'bg-paper text-muted ring-1 ring-line',
  awaiting_report: 'bg-amber-soft text-amber',
  report_overdue: 'bg-crescent-soft text-crescent',
  reported: 'bg-nile-soft text-nile',
  matched: 'bg-leaf-soft text-leaf',
  unfunded: 'bg-amber-soft text-amber',
}

/** Money linked to an activity through its activity number. */
export function activityMoney(a: FieldActivity, s: Pick<S, 'requests' | 'advances' | 'expenses'>) {
  const requests = s.requests.filter((r) => r.activityCode === a.code)
  const advances = s.advances.filter((x) => x.activityCode === a.code)
  const expenses = s.expenses.filter((e) => e.activityCode === a.code)
  const spent = expenses.reduce((t, e) => t + e.amountUSD, 0)
  const outstanding = advances.filter((x) => x.status === 'open').reduce((t, x) => t + x.amountUSD, 0)
  return { requests, advances, expenses, spent, outstanding, funded: requests.some((r) => r.status !== 'rejected') || advances.length > 0 || expenses.length > 0 }
}

export function activityStatus(a: FieldActivity, s: Pick<S, 'requests' | 'advances' | 'expenses'>): ActivityStatus {
  const m = activityMoney(a, s)
  const due = +new Date(a.date)
  if (!a.report) {
    if (due > Date.now()) return 'planned'
    return due + 5 * 86_400_000 < Date.now() ? 'report_overdue' : 'awaiting_report'
  }
  if (!m.funded && !a.inKind) return 'unfunded'
  if (a.inKind) return 'matched'
  if (m.advances.some((x) => x.status === 'open')) return 'reported'
  return m.expenses.length ? 'matched' : 'reported'
}
