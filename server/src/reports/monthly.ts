// The numbers behind the monthly report to headquarters. Everything is computed from the ledger and
// the operational tables, in USD, as exact decimal strings; ratios are plain numbers.
import { desc, eq, lte, sql } from 'drizzle-orm'
import { fromCents, toCents } from '../lib/money'
import { projectUsage, usageJson } from '../budget/usage'
import type { DbOrTx } from '../db/client'
import { exchangeRates, hqDrafts, offices, projects } from '../db/schema'
import { ledgerAccount } from '../ledger/posting'

export const periodRange = (period: string) => {
  const [y, m] = period.split('-').map(Number)
  return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
}

const n = (v: unknown) => Number(v ?? 0)
/** An exact amount as "1234.50" (Postgres returns "0" for an empty sum). */
const s = (v: unknown) => fromCents(toCents(v === null || v === undefined ? '0' : String(v)))

export const defaultChallenges = {
  ar: '• استمرار الوضع الأمني في شمال دارفور يؤخر رفع تقارير مكتب الفاشر وتسوية عهده.\n• تراجع سعر الجنيه أمام الدولار يرفع تكلفة الأدوية والوقود ويستلزم إعادة تقييم شهرية.\n• ضعف الاتصال بالإنترنت في بعض المكاتب؛ يُعالج بالتقارير دون اتصال وقوالب Excel.',
  en: '• The security situation in North Darfur delays El Fasher reports and advance settlements.\n• The pound’s fall against the dollar raises medicine and fuel costs and requires monthly revaluation.\n• Weak internet in some offices; handled with offline reports and Excel templates.',
}

const money = (v: string) => `$${Math.round(Number(v)).toLocaleString('en-US')}`

/** The opening paragraph written from the month's numbers; the report author can edit it. */
export function autoSummary(d: { activities: number; beneficiaries: number; statesReached: number; spent: string; received: string; compliance: number }) {
  const pct = Math.round(d.compliance * 100)
  return {
    ar: `خلال الشهر نفّذت المكاتب ${d.activities} نشاطاً ميدانياً استفاد منها ${d.beneficiaries.toLocaleString('en-US')} شخصاً في ${d.statesReached} ولايات. بلغ الصرف ${money(d.spent)}، ووردت منح وتبرعات بقيمة ${money(d.received)}. نسبة المصروفات المطابقة بتقارير فنية ${pct}٪.`,
    en: `During the month the offices carried out ${d.activities} field activities reaching ${d.beneficiaries.toLocaleString('en-US')} people in ${d.statesReached} states. Spending was ${money(d.spent)} and ${money(d.received)} of grants and donations were received. ${pct}% of expenses are matched to field reports.`,
  }
}

export async function monthlyReport(db: DbOrTx, period: string) {
  const { start, end } = periodRange(period)
  const rows = async <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) => (await db.execute<T>(q)).rows
  const [gain, loss] = [await ledgerAccount(db, 'fx_gain'), await ledgerAccount(db, 'fx_loss')]

  const [rateRow] = await db.select({ rate: exchangeRates.rate, date: exchangeRates.date }).from(exchangeRates).where(lte(exchangeRates.date, end)).orderBy(desc(exchangeRates.date)).limit(1)

  // Money in: receipt vouchers in the month.
  const [rec] = await rows<{ total: string; count: number }>(sql`select coalesce(sum(amount_usd),0)::text as total, count(*)::int as count from vouchers where kind = 'receipt' and date between ${start} and ${end}`)

  // Money out: cash spending posted to budget lines in the month (in-kind issues are not cash).
  const spentByOffice = await rows<{ office_id: string; spent: string }>(sql`
    select jl.office_id, sum(jl.debit - jl.credit)::text as spent
    from journal_lines jl join accounts a on a.code = jl.account_code join journal_entries je on je.id = jl.entry_id
    where je.period = ${period} and a.type = 'expense' and je.source <> 'stock' and jl.budget_line_id is not null
    group by jl.office_id`)
  const spentByProject = await rows<{ project_id: string; spent: string }>(sql`
    select jl.project_id, sum(jl.debit - jl.credit)::text as spent
    from journal_lines jl join accounts a on a.code = jl.account_code join journal_entries je on je.id = jl.entry_id
    where je.period = ${period} and a.type = 'expense' and je.source <> 'stock' and jl.budget_line_id is not null and jl.project_id is not null
    group by jl.project_id`)
  const spentCents = spentByOffice.reduce((t, r) => t + toCents(r.spent), 0)

  const [fxRow] = await rows<{ net: string }>(sql`
    select coalesce(sum(case when jl.account_code = ${gain} then jl.credit - jl.debit when jl.account_code = ${loss} then jl.credit - jl.debit else 0 end), 0)::text as net
    from journal_lines jl join journal_entries je on je.id = jl.entry_id
    where je.period = ${period} and je.source = 'fx'`)

  // Each expense (a payment or an advance settlement) and whether the activity it paid for has a field report.
  const expenseRows = await rows<{ office_id: string; amount: string; matched: boolean }>(sql`
    select x.office_id, x.amount::text as amount, x.matched from (
      select je.id, jl.office_id, sum(jl.debit - jl.credit) as amount, bool_or(fr.id is not null) as matched
      from journal_entries je join journal_lines jl on jl.entry_id = je.id join accounts a on a.code = jl.account_code
        left join field_reports fr on fr.activity_id = jl.activity_id
      where je.period = ${period} and je.source in ('payment', 'settlement') and a.type = 'expense' and jl.budget_line_id is not null
      group by je.id, jl.office_id) x`)

  const actRows = await rows<{ office_id: string; activities: number; beneficiaries: number; men: number; women: number; children: number }>(sql`
    select a.office_id, count(*)::int as activities, coalesce(sum(fr.beneficiaries),0)::int as beneficiaries,
      coalesce(sum(fr.men),0)::int as men, coalesce(sum(fr.women),0)::int as women, coalesce(sum(fr.children),0)::int as children
    from field_reports fr join activities a on a.id = fr.activity_id
    where coalesce(fr.done_on, fr.submitted_at::date) between ${start} and ${end}
    group by a.office_id`)

  const closes = await rows<{ office_id: string; closed: boolean }>(sql`select office_id, (closed_at is not null) as closed from period_closes where period = ${period}`)
  const officeList = await db.select({ id: offices.id, nameAr: offices.nameAr, nameEn: offices.nameEn, stateAr: offices.stateAr, stateEn: offices.stateEn, type: offices.type }).from(offices)

  const byOffice = officeList
    .map((o) => {
      const ex = expenseRows.filter((e) => e.office_id === o.id)
      const act = actRows.find((a) => a.office_id === o.id)
      return {
        office: o,
        spent: s(spentByOffice.find((x) => x.office_id === o.id)?.spent ?? '0.00'),
        expenses: ex.length,
        matched: ex.filter((e) => e.matched).length,
        activities: act?.activities ?? 0,
        beneficiaries: act?.beneficiaries ?? 0,
        closed: closes.find((c) => c.office_id === o.id)?.closed ?? false,
      }
    })
    .filter((x) => toCents(x.spent) > 0 || x.activities > 0 || x.office.type === 'hq')

  const people = actRows.reduce((t, a) => ({ men: t.men + a.men, women: t.women + a.women, children: t.children + a.children }), { men: 0, women: 0, children: 0 })
  const beneficiaries = actRows.reduce((t, a) => t + a.beneficiaries, 0)
  const activitiesDone = actRows.reduce((t, a) => t + a.activities, 0)
  const compliance = expenseRows.length ? expenseRows.filter((e) => e.matched).length / expenseRows.length : 1

  // Approvals: how many requests, and how long a decision takes.
  const [appr] = await rows<{ created: number; decided: number; avg_hours: string | null }>(sql`
    select (select count(*)::int from spend_requests where created_at >= ${start}::date and created_at < (${end}::date + 1)) as created,
      count(*)::int as decided, avg(extract(epoch from (decided_at - created_at)) / 3600)::text as avg_hours
    from spend_requests where status <> 'pending' and decided_at >= ${start}::date and decided_at < (${end}::date + 1) and decided_at > created_at`)

  // Project burn against ceilings, with this month's spending.
  const projectRows = await db.select().from(projects).where(eq(projects.active, true)).orderBy(projects.code)
  const projectsOut = []
  for (const p of projectRows) {
    const u = await projectUsage(db, p.id)
    const a = new Date(p.startDate).getTime()
    const b = new Date(p.endDate).getTime()
    const elapsed = b > a ? Math.min(1, Math.max(0, (new Date(end).getTime() - a) / (b - a))) : 1
    const pillarRows = await db.execute<{ id: string; code: string; name_ar: string; name_en: string }>(sql`select id, code, name_ar, name_en from pillars where project_id = ${p.id} order by sort, code`)
    projectsOut.push({
      id: p.id,
      code: p.code,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      donorAr: p.donorAr,
      donorEn: p.donorEn,
      startDate: p.startDate,
      endDate: p.endDate,
      usage: usageJson(u.project),
      elapsed,
      burn: u.project.ceiling ? u.project.spent / u.project.ceiling : 0,
      monthSpent: s(spentByProject.find((x) => x.project_id === p.id)?.spent ?? '0.00'),
      pillars: pillarRows.rows.map((pl) => ({ id: pl.id, code: pl.code, nameAr: pl.name_ar, nameEn: pl.name_en, usage: usageJson(u.pillars.get(pl.id)!) })),
    })
  }

  // Everything received and spent from the start up to the end of the month.
  const [recAll] = await rows<{ total: string }>(sql`select coalesce(sum(amount_usd),0)::text as total from vouchers where kind = 'receipt' and date <= ${end}`)
  const [spentAll] = await rows<{ total: string }>(sql`
    select coalesce(sum(jl.debit - jl.credit),0)::text as total
    from journal_lines jl join accounts a on a.code = jl.account_code join journal_entries je on je.id = jl.entry_id
    where je.date <= ${end} and a.type = 'expense' and je.source <> 'stock' and jl.budget_line_id is not null`)

  // Advances still out at the end of the month.
  const [adv] = await rows<{ open: number; total: string; overdue: number; overdue_total: string }>(sql`
    select count(*)::int as open, coalesce(sum(amount_usd),0)::text as total,
      count(*) filter (where due_at < ${end}::date)::int as overdue, coalesce(sum(amount_usd) filter (where due_at < ${end}::date),0)::text as overdue_total
    from advances where issued_at < (${end}::date + 1) and (settled_at is null or settled_at >= (${end}::date + 1))`)

  // Places where the technical and financial sides do not line up.
  const unmatched = expenseRows.filter((e) => !e.matched)
  const [overdueReports] = await rows<{ count: number }>(sql`
    select count(*)::int as count from activities a
    where a.planned_date + 5 < ${end}::date and not exists (select 1 from field_reports fr where fr.activity_id = a.id)`)
  const [noSpend] = await rows<{ count: number }>(sql`
    select count(*)::int as count from field_reports fr join activities a on a.id = fr.activity_id
    where coalesce(fr.done_on, fr.submitted_at::date) between ${start} and ${end} and not a.in_kind
      and not exists (select 1 from spend_requests r where r.activity_id = a.id and r.status <> 'rejected')
      and not exists (select 1 from advances x where x.activity_id = a.id)
      and not exists (select 1 from journal_lines jl where jl.activity_id = a.id)`)
  const gaps = { spendNoReport: { count: unmatched.length, amount: fromCents(unmatched.reduce((t, e) => t + toCents(e.amount), 0)) }, reportOverdue: { count: overdueReports.count }, reportNoSpend: { count: noSpend.count } }

  const inKindRows = await rows<{ kind: string; total: string }>(sql`select kind, coalesce(sum(value_usd),0)::text as total from stock_moves where date between ${start} and ${end} and kind in ('receipt','issue') group by kind`)
  const inKind = { received: s(inKindRows.find((r) => r.kind === 'receipt')?.total ?? '0.00'), issued: s(inKindRows.find((r) => r.kind === 'issue')?.total ?? '0.00') }
  const [staff] = await rows<{ total: number; offices: number }>(sql`select count(*)::int as total, count(distinct office_id)::int as offices from employees where status = 'active' and start_date <= ${end}`)

  const upcoming = await rows<{ id: string; title_ar: string; title_en: string; due: string; project_id: string | null }>(sql`select id, title_ar, title_en, due::text, project_id from deadlines where not done and due > ${end} order by due limit 5`)
  const plannedNext = await rows<{ code: string; title_ar: string; title_en: string; office_id: string; planned_date: string }>(sql`
    select a.code, a.title_ar, a.title_en, a.office_id, a.planned_date::text from activities a
    where a.planned_date > ${end} and not exists (select 1 from field_reports fr where fr.activity_id = a.id) order by a.planned_date limit 6`)

  const [draft] = await db.select().from(hqDrafts).where(eq(hqDrafts.period, period))
  const spent = fromCents(spentCents)
  const summary = autoSummary({ activities: activitiesDone, beneficiaries, statesReached: actRows.length, spent, received: s(rec.total), compliance })

  return {
    period,
    start,
    end,
    rate: rateRow ? { rate: rateRow.rate, date: rateRow.date } : null,
    received: s(rec.total),
    receiptCount: rec.count,
    spent,
    fx: s(fxRow.net),
    byOffice,
    activitiesDone,
    people,
    beneficiaries,
    compliance,
    approvals: { created: appr.created, decided: appr.decided, avgHours: appr.avg_hours === null ? null : Math.round(n(appr.avg_hours) * 10) / 10 },
    projects: projectsOut,
    cashFund: { received: s(recAll.total), spent: s(spentAll.total) },
    advances: { open: adv.open, total: s(adv.total), overdue: adv.overdue, overdueTotal: s(adv.overdue_total) },
    gaps,
    inKind,
    staff,
    upcoming: upcoming.map((d) => ({ id: d.id, titleAr: d.title_ar, titleEn: d.title_en, due: d.due, projectId: d.project_id })),
    plannedNext: plannedNext.map((a) => ({ code: a.code, titleAr: a.title_ar, titleEn: a.title_en, officeId: a.office_id, plannedDate: a.planned_date })),
    draft: { status: draft?.status ?? 'draft', summary: draft?.summary ?? null, challenges: draft?.challenges ?? null, plan: draft?.plan ?? null, approvedById: draft?.approvedById ?? null, approvedAt: draft?.approvedAt ?? null },
    defaults: { summary, challenges: defaultChallenges },
  }
}
