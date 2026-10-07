import { matchingGaps, type useStore } from './store'
import { projectUsage, pillarUsage } from './budget'

type S = ReturnType<typeof useStore.getState>

export const periodOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export function periodRange(period: string) {
  const [y, m] = period.split('-').map(Number)
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) }
}
export function periodLabel(period: string, ar: boolean) {
  const { start } = periodRange(period)
  return new Intl.DateTimeFormat(ar ? 'ar-SD-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(start)
}
/** The last six months, newest first; the month just ended is the default. */
export function recentPeriods(n = 6) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => periodOf(new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)))
}
export const lastMonth = () => {
  const n = new Date()
  return periodOf(new Date(n.getFullYear(), n.getMonth() - 1, 1))
}

const inRange = (iso: string | undefined, a: Date, b: Date) => !!iso && +new Date(iso) >= +a && +new Date(iso) <= +b

export function monthlyData(s: S, period: string) {
  const { start, end } = periodRange(period)
  const rate = s.rates.filter((r) => +new Date(r.date) <= +end).at(-1)?.rate ?? s.rates.at(-1)?.rate ?? 0
  const receipts = s.vouchers.filter((v) => v.kind === 'receipt' && inRange(v.date, start, end))
  const received = receipts.reduce((t, v) => t + v.amountUSD, 0)
  const expenses = s.expenses.filter((e) => inRange(e.date, start, end))
  const spent = expenses.reduce((t, e) => t + e.amountUSD, 0)
  const fxEntries = s.journal.filter((e) => e.source === 'fx' && inRange(e.date, start, end))
  const fx = fxEntries.reduce((t, e) => t + e.lines.filter((l) => l.account === '4104').reduce((a, l) => a + l.credit, 0) - e.lines.filter((l) => l.account === '5206').reduce((a, l) => a + l.debit, 0), 0)

  const byOffice = s.offices
    .map((o) => {
      const ex = expenses.filter((e) => e.officeId === o.id)
      const acts = s.activities.filter((a) => a.officeId === o.id && a.report && inRange(a.report.doneOn ?? a.date, start, end))
      return {
        office: o,
        spent: ex.reduce((t, e) => t + e.amountUSD, 0),
        expenses: ex.length,
        matched: ex.filter((e) => e.hasTechReport).length,
        activities: acts.length,
        beneficiaries: acts.reduce((t, a) => t + (a.report?.beneficiaries ?? 0), 0),
        closed: !!s.closes.find((c) => c.officeId === o.id)?.closedAt,
      }
    })
    .filter((x) => x.spent > 0 || x.activities > 0 || x.office.isHQ)

  const doneActs = s.activities.filter((a) => a.report && inRange(a.report.doneOn ?? a.date, start, end))
  const people = doneActs.reduce(
    (t, a) => ({ men: t.men + (a.report?.men ?? 0), women: t.women + (a.report?.women ?? 0), children: t.children + (a.report?.children ?? 0) }),
    { men: 0, women: 0, children: 0 },
  )
  const beneficiaries = people.men + people.women + people.children
  const compliance = expenses.length ? expenses.filter((e) => e.hasTechReport).length / expenses.length : 1

  const reqs = s.requests.filter((r) => inRange(r.createdAt, start, end))
  const decided = s.requests.filter((r) => r.status !== 'pending' && inRange(r.steps.at(-1)?.at, start, end))
  const hours = decided.map((r) => (+new Date(r.steps.at(-1)!.at!) - +new Date(r.createdAt)) / 3_600_000).filter((h) => h > 0)
  const avgApprovalHours = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null

  const projects = s.projects.map((p) => {
    const u = projectUsage(p, s)
    const elapsed = Math.min(1, Math.max(0, (+end - +new Date(p.start)) / (+new Date(p.end) - +new Date(p.start))))
    const monthSpent = expenses.filter((e) => e.projectId === p.id).reduce((t, e) => t + e.amountUSD, 0)
    return { project: p, usage: u, elapsed, burn: u.ceiling ? u.spent / u.ceiling : 0, monthSpent, pillars: p.pillars.map((pl) => ({ pillar: pl, usage: pillarUsage(pl, s) })) }
  })

  const cashFund = { received: s.vouchers.filter((v) => v.kind === 'receipt').reduce((t, v) => t + v.amountUSD, 0), spent: s.expenses.reduce((t, e) => t + e.amountUSD, 0) }
  const openAdv = s.advances.filter((a) => a.status === 'open')
  const overdueAdv = openAdv.filter((a) => +new Date(a.dueAt) < Date.now())
  const gaps = matchingGaps(s)

  // In-kind supplies and staff (filled once those modules hold data).
  const x = s as unknown as {
    stockMoves?: { kind: string; date: string; valueUSD: number }[]
    employees?: { status: string; officeId: string }[]
  }
  const inKind = x.stockMoves
    ? {
        received: x.stockMoves.filter((m) => m.kind === 'receipt' && inRange(m.date, start, end)).reduce((t, m) => t + m.valueUSD, 0),
        issued: x.stockMoves.filter((m) => m.kind === 'issue' && inRange(m.date, start, end)).reduce((t, m) => t + m.valueUSD, 0),
      }
    : null
  const staff = x.employees ? { total: x.employees.filter((e) => e.status === 'active').length, offices: new Set(x.employees.map((e) => e.officeId)).size } : null

  const upcoming = s.deadlines.filter((d) => !d.done && +new Date(d.due) > +end).sort((a, b) => +new Date(a.due) - +new Date(b.due)).slice(0, 5)
  const plannedNext = s.activities.filter((a) => !a.report && +new Date(a.date) > +end).sort((a, b) => +new Date(a.date) - +new Date(b.date)).slice(0, 6)

  return {
    period,
    start,
    end,
    rate,
    received,
    receipts,
    spent,
    fx,
    byOffice,
    doneActs,
    people,
    beneficiaries,
    compliance,
    reqs,
    decided,
    avgApprovalHours,
    projects,
    cashFund,
    openAdv,
    overdueAdv,
    gaps,
    inKind,
    staff,
    upcoming,
    plannedNext,
  }
}

export type MonthlyData = ReturnType<typeof monthlyData>

export function autoSummary(d: MonthlyData, ar: boolean) {
  const pct = Math.round(d.compliance * 100)
  const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
  return ar
    ? `خلال الشهر نفّذ المكتب ${d.doneActs.length} نشاطاً ميدانياً استفاد منها ${d.beneficiaries.toLocaleString('en-US')} شخصاً في ${d.byOffice.filter((o) => o.activities > 0).length} ولايات. بلغ الصرف ${money(d.spent)}، ووردت منح وتبرعات بقيمة ${money(d.received)}. نسبة المصروفات المطابقة بتقارير فنية ${pct}٪.`
    : `During the month the office carried out ${d.doneActs.length} field activities reaching ${d.beneficiaries.toLocaleString('en-US')} people in ${d.byOffice.filter((o) => o.activities > 0).length} states. Spending was ${money(d.spent)} and ${money(d.received)} of grants and donations were received. ${pct}% of expenses are matched to field reports.`
}

export const defaultChallenges = {
  ar: '• استمرار الوضع الأمني في شمال دارفور يؤخر رفع تقارير مكتب الفاشر وتسوية عهده.\n• تراجع سعر الجنيه أمام الدولار يرفع تكلفة الأدوية والوقود ويستلزم إعادة تقييم شهرية.\n• ضعف الاتصال بالإنترنت في بعض المكاتب؛ يُعالج بالتقارير دون اتصال وقوالب Excel.',
  en: '• The security situation in North Darfur delays El Fasher reports and advance settlements.\n• The pound’s fall against the dollar raises medicine and fuel costs and requires monthly revaluation.\n• Weak internet in some offices; handled with offline reports and Excel templates.',
}
