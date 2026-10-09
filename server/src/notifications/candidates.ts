import { sql } from 'drizzle-orm'
import { projectUsage } from '../budget/usage'
import type { DbOrTx } from '../db/client'
import { fromCents } from '../lib/money'
import type { NotifEvent } from './events'

/** Something worth telling people about, before it is matched to a rule's recipients. */
export interface Candidate {
  key: string // identifies the situation, so it is announced once
  severity: 'info' | 'warn' | 'critical'
  titleAr: string
  titleEn: string
  bodyAr: string
  bodyEn: string
  link: string
  concerned: string[] // user ids the event is about (approver, requester, owner, office team…)
  officeId?: string
}

type Row = Record<string, string | number | null>
const rows = async (db: DbOrTx, q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Row[]
const str = (v: unknown) => String(v ?? '')

/** Active users holding a role; an office-scoped role only counts for the office the event is about. */
export async function usersForRole(db: DbOrTx, roleId: string, officeId?: string | null): Promise<string[]> {
  const r = await rows(db, sql`select u.id from users u join roles r on r.id = u.role_id where u.active and u.role_id = ${roleId} ${officeId ? sql`and (r.scope <> 'office' or u.office_id = ${officeId})` : sql``}`)
  return r.map((x) => str(x.id))
}

/** The people at an office who work on activities (field officers, supervisors…). */
async function officeTeam(db: DbOrTx, officeId: string): Promise<string[]> {
  const r = await rows(db, sql`select u.id from users u join roles r on r.id = u.role_id where u.active and u.office_id = ${officeId} and r.permissions->>'activities' in ('edit', 'manage')`)
  return r.map((x) => str(x.id))
}

const REPORT_NAME: Record<string, [string, string]> = {
  statistics: ['التقرير الإحصائي', 'Statistics report'],
  narrative: ['التقرير السردي', 'Narrative report'],
  custom: ['التقرير المخصص', 'Custom report'],
  quarterly: ['التقرير الربع سنوي', 'Quarterly report'],
}
const OWNER_ROLE: Record<string, string> = { statistics: 'project_manager', quarterly: 'project_manager', narrative: 'project_coordinator', custom: 'project_office' }

async function teamOf(db: DbOrTx, projectId: string, role: string, sectorId?: string | null): Promise<string[]> {
  const r = await rows(db, sql`select t.user_id, t.sector_id from project_team t join users u on u.id = t.user_id where t.project_id = ${projectId} and t.role = ${role}::team_role and u.active`)
  return r.filter((x) => !sectorId || !x.sector_id || x.sector_id === sectorId).map((x) => str(x.user_id))
}

/** Who prepares a project report; the PMO (anyone who manages reports) when nobody is assigned. */
async function reportOwners(db: DbOrTx, projectId: string, type: string, sectorId: string | null): Promise<string[]> {
  const t = await teamOf(db, projectId, OWNER_ROLE[type] ?? 'project_manager', type === 'custom' ? sectorId : null)
  if (t.length) return t
  return (await rows(db, sql`select u.id from users u join roles ro on ro.id = u.role_id where u.active and u.donor_id is null and ro.permissions->>'reports' = 'manage'`)).map((x) => str(x.id))
}

export async function candidatesFor(db: DbOrTx, event: NotifEvent, threshold: number | null): Promise<Candidate[]> {
  const out: Candidate[] = []
  switch (event) {
    case 'approval_waiting':
    case 'request_stale': {
      const stale = event === 'request_stale'
      const limit = threshold ?? 48
      const reqs = await rows(db, sql`
        select r.id, r.code, r.purpose, r.office_id, s.seq, s.role_id,
               extract(epoch from now() - coalesce((select max(p.at) from approval_steps p where p.request_id = r.id and p.seq < s.seq and p.at is not null), r.created_at)) / 3600 as hours
        from spend_requests r join approval_steps s on s.request_id = r.id and s.status = 'pending'
        where r.status = 'pending'`)
      for (const r of reqs) {
        if (stale && Number(r.hours) < limit) continue
        const days = Math.floor(Number(r.hours) / 24)
        out.push({
          key: `${event}:${r.id}:${r.seq}`,
          severity: stale ? 'warn' : 'info',
          titleAr: stale ? `الطلب ${r.code} متوقف منذ ${days} يوم` : `طلب بانتظار اعتمادك: ${r.code}`,
          titleEn: stale ? `${r.code} waiting for ${days} days` : `Waiting for your approval: ${r.code}`,
          bodyAr: str(r.purpose),
          bodyEn: str(r.purpose),
          link: `/requests/${r.id}`,
          concerned: await usersForRole(db, str(r.role_id), str(r.office_id)),
          officeId: str(r.office_id),
        })
      }
      if (!stale) {
        const res = await rows(db, sql`select r.id, r.code, r.reason, s.seq, s.role_id from reallocations r join approval_steps s on s.reallocation_id = r.id and s.status = 'pending' where r.status = 'pending'`)
        for (const r of res)
          out.push({ key: `${event}:${r.id}:${r.seq}`, severity: 'info', titleAr: `مناقلة بانتظار اعتمادك: ${r.code}`, titleEn: `Reallocation waiting for you: ${r.code}`, bodyAr: str(r.reason), bodyEn: str(r.reason), link: '/approvals', concerned: await usersForRole(db, str(r.role_id)) })
      }
      break
    }
    case 'request_decided': {
      const decided = await rows(db, sql`
        select r.id, r.code, r.purpose, r.status, r.requester_id, r.office_id
        from spend_requests r left join vouchers v on v.request_id = r.id
        where r.status in ('approved', 'rejected', 'paid') and coalesce(v.created_at, r.decided_at, r.created_at) >= now() - interval '2 days'`)
      for (const r of decided) {
        const [ar, en] = r.status === 'rejected' ? [`رُفض طلبك ${r.code}`, `Your request ${r.code} was rejected`] : r.status === 'paid' ? [`صُرف طلبك ${r.code}`, `Your request ${r.code} was paid`] : [`اعتُمد طلبك ${r.code}`, `Your request ${r.code} was approved`]
        out.push({ key: `${event}:${r.id}:${r.status}`, severity: r.status === 'rejected' ? 'warn' : 'info', titleAr: ar, titleEn: en, bodyAr: str(r.purpose), bodyEn: str(r.purpose), link: `/requests/${r.id}`, concerned: [str(r.requester_id)], officeId: str(r.office_id) })
      }
      break
    }
    case 'deadline_near':
    case 'deadline_overdue': {
      const over = event === 'deadline_overdue'
      const ds = await rows(db, sql`
        select d.id, d.title_ar, d.title_en, d.due::text as due, d.owner_role_id, (d.due - current_date) as left
        from deadlines d where not d.done and ${over ? sql`d.due < current_date` : sql`d.due >= current_date and d.due - current_date <= d.notify_days_before`}`)
      for (const d of ds) {
        const left = Number(d.left)
        out.push({
          key: `${event}:${d.id}:${d.due}`,
          severity: over ? 'critical' : left <= 2 ? 'warn' : 'info',
          titleAr: over ? `تجاوز الموعد: ${d.title_ar}` : `موعد قريب: ${d.title_ar}`,
          titleEn: over ? `Missed: ${d.title_en}` : `Coming up: ${d.title_en}`,
          bodyAr: over ? `كان الموعد قبل ${-left} يوم` : left === 0 ? 'الموعد اليوم' : `يتبقى ${left} يوم`,
          bodyEn: over ? `It was due ${-left} days ago` : left === 0 ? 'Due today' : `${left} days left`,
          link: '/alerts/calendar',
          concerned: await usersForRole(db, str(d.owner_role_id)),
        })
      }
      break
    }
    case 'advance_overdue': {
      const as = await rows(db, sql`select a.id, a.no, a.office_id, a.holder_user_id, (current_date - a.due_at) as days from advances a where a.status = 'open' and a.due_at < current_date`)
      for (const a of as)
        out.push({
          key: `${event}:${a.id}`,
          severity: 'critical',
          titleAr: `عهدة متأخرة: ${a.no}`,
          titleEn: `Overdue advance: ${a.no}`,
          bodyAr: `تجاوزت موعد التسوية بـ ${a.days} يوم`,
          bodyEn: `${a.days} days past the settlement date`,
          link: '/finance/advances',
          concerned: a.holder_user_id ? [str(a.holder_user_id)] : await officeTeam(db, str(a.office_id)),
          officeId: str(a.office_id),
        })
      break
    }
    case 'report_overdue': {
      const as = await rows(db, sql`
        select a.id, a.code, a.title_ar, a.title_en, a.office_id, (current_date - a.planned_date) as days
        from activities a left join field_reports fr on fr.activity_id = a.id
        where fr.id is null and a.planned_date <= current_date - ${threshold ?? 5}::int`)
      for (const a of as)
        out.push({ key: `${event}:${a.id}`, severity: 'warn', titleAr: `تقرير فني متأخر: ${a.code}`, titleEn: `Field report overdue: ${a.code}`, bodyAr: `${a.title_ar} — منذ ${a.days} يوم`, bodyEn: `${a.title_en} — ${a.days} days ago`, link: `/activities/${a.id}`, concerned: await officeTeam(db, str(a.office_id)), officeId: str(a.office_id) })
      break
    }
    case 'line_threshold': {
      const limit = threshold ?? 85
      const ps = await rows(db, sql`select id, code from projects order by code`)
      for (const p of ps) {
        const u = await projectUsage(db, str(p.id))
        for (const l of u.lines.values()) {
          if (l.usage.ceiling <= 0) continue
          const usedPct = ((l.usage.ceiling - l.usage.available) * 100) / l.usage.ceiling
          if (usedPct < limit) continue
          const pct = Math.round(usedPct)
          out.push({
            key: `${event}:${l.id}:${limit}`,
            severity: usedPct >= 100 ? 'critical' : 'warn',
            titleAr: `البند ${l.code} بلغ ${pct}٪ من سقفه`,
            titleEn: `Line ${l.code} at ${pct}% of its ceiling`,
            bodyAr: `${p.code} — ${l.nameAr} (المتاح ${fromCents(l.usage.available)} دولار)`,
            bodyEn: `${p.code} — ${l.nameEn} (${fromCents(l.usage.available)} USD left)`,
            link: `/projects/${p.id}`,
            concerned: [],
          })
        }
      }
      break
    }
    case 'spend_no_report': {
      const xs = await rows(db, sql`
        select a.id, a.code, a.office_id, a.title_ar, a.title_en, sum(jl.debit - jl.credit)::text as spent, (current_date - min(je.date)) as days
        from journal_lines jl
          join journal_entries je on je.id = jl.entry_id and je.source <> 'stock'
          join accounts ac on ac.code = jl.account_code and ac.type = 'expense'
          join activities a on a.id = jl.activity_id
          left join field_reports fr on fr.activity_id = a.id
        where fr.id is null
        group by a.id
        having current_date - min(je.date) >= ${threshold ?? 10}::int and sum(jl.debit - jl.credit) > 0`)
      for (const x of xs)
        out.push({ key: `${event}:${x.id}`, severity: 'warn', titleAr: `صرف بلا تقرير فني منذ ${x.days} يوم`, titleEn: `Spending without a report for ${x.days} days`, bodyAr: `${x.code} — ${x.title_ar}`, bodyEn: `${x.code} — ${x.title_en}`, link: '/reconciliation', concerned: await officeTeam(db, str(x.office_id)), officeId: str(x.office_id) })
      break
    }
    case 'month_close': {
      const day = new Date().getUTCDate()
      if (day < (threshold ?? 5)) break
      const d = new Date()
      d.setUTCDate(1)
      d.setUTCMonth(d.getUTCMonth() - 1)
      const period = d.toISOString().slice(0, 7)
      const open = await rows(db, sql`select o.id, o.name_ar, o.name_en from offices o where o.active and not exists (select 1 from period_closes c where c.period = ${period} and c.office_id = o.id and c.closed_at is not null) order by o.id`)
      if (!open.length) break
      out.push({
        key: `${event}:${period}:${open.length}`,
        severity: 'warn',
        titleAr: `${open.length} مكاتب لم تُقفل شهر ${period}`,
        titleEn: `${open.length} offices haven’t closed ${period}`,
        bodyAr: open.map((o) => o.name_ar).join('، '),
        bodyEn: open.map((o) => o.name_en).join(', '),
        link: '/finance/close',
        concerned: [],
      })
      break
    }
    case 'project_report_due':
    case 'project_report_overdue': {
      const over = event === 'project_report_overdue'
      const rs = await rows(db, sql`
        select r.id, r.project_id, r.type::text as type, r.period, r.sector_id, r.due::text as due, p.code, (r.due - current_date) as left
        from project_reports r join projects p on p.id = r.project_id join reporting_schedules sc on sc.project_id = r.project_id
        where r.status in ('open', 'draft', 'returned') and ${over ? sql`r.due < current_date` : sql`r.due >= current_date and r.due - current_date <= sc.notify_days_before`}`)
      for (const r of rs) {
        const left = Number(r.left)
        const [kar, ken] = REPORT_NAME[str(r.type)] ?? ['تقرير', 'Report']
        out.push({
          key: `${event}:${r.id}:${r.due}`,
          severity: over ? 'critical' : left <= 2 ? 'warn' : 'info',
          titleAr: over ? `تقرير متأخر: ${kar} ${r.period} — ${r.code}` : `موعد تقرير قريب: ${kar} ${r.period} — ${r.code}`,
          titleEn: over ? `Overdue: ${ken} ${r.period} — ${r.code}` : `Report due soon: ${ken} ${r.period} — ${r.code}`,
          bodyAr: over ? `كان الموعد قبل ${-left} يوم` : left === 0 ? 'الموعد اليوم' : `يتبقى ${left} يوم`,
          bodyEn: over ? `It was due ${-left} days ago` : left === 0 ? 'Due today' : `${left} days left`,
          link: `/reports/project/${r.id}`,
          concerned: await reportOwners(db, str(r.project_id), str(r.type), r.sector_id ? str(r.sector_id) : null),
        })
      }
      break
    }
    case 'project_report_submitted': {
      const rs = await rows(db, sql`select r.id, r.type::text as type, r.period, r.submitted_by_id, r.submitted_at::text as at, p.code from project_reports r join projects p on p.id = r.project_id where r.status = 'submitted'`)
      const reviewers = await rows(db, sql`select u.id from users u join roles ro on ro.id = u.role_id where u.active and u.donor_id is null and ro.permissions->>'reports' = 'manage'`)
      for (const r of rs) {
        const [kar, ken] = REPORT_NAME[str(r.type)] ?? ['تقرير', 'Report']
        out.push({ key: `${event}:${r.id}:${r.at}`, severity: 'info', titleAr: `بانتظار مراجعتك: ${kar} ${r.period} — ${r.code}`, titleEn: `Waiting for your review: ${ken} ${r.period} — ${r.code}`, bodyAr: 'أُرسل إلى مكتب إدارة المشاريع', bodyEn: 'Submitted to the PMO', link: `/reports/project/${r.id}`, concerned: reviewers.map((x) => str(x.id)).filter((id) => id !== str(r.submitted_by_id)) })
      }
      break
    }
    case 'project_report_returned': {
      const rs = await rows(db, sql`select r.id, r.project_id, r.type::text as type, r.period, r.sector_id, r.submitted_by_id, r.review_note, r.reviewed_at::text as at, p.code from project_reports r join projects p on p.id = r.project_id where r.status = 'returned' and r.reviewed_at >= now() - interval '14 days'`)
      for (const r of rs) {
        const [kar, ken] = REPORT_NAME[str(r.type)] ?? ['تقرير', 'Report']
        const who = new Set(await reportOwners(db, str(r.project_id), str(r.type), r.sector_id ? str(r.sector_id) : null))
        if (r.submitted_by_id) who.add(str(r.submitted_by_id))
        out.push({ key: `${event}:${r.id}:${r.at}`, severity: 'warn', titleAr: `أُعيد للتعديل: ${kar} ${r.period} — ${r.code}`, titleEn: `Returned for changes: ${ken} ${r.period} — ${r.code}`, bodyAr: str(r.review_note), bodyEn: str(r.review_note), link: `/reports/project/${r.id}`, concerned: [...who] })
      }
      break
    }
    case 'milestone_due':
    case 'milestone_overdue': {
      const over = event === 'milestone_overdue'
      const ms = await rows(db, sql`
        select m.id, m.project_id, m.title_ar, m.title_en, m.due::text as due, m.owner_id, p.code, (m.due - current_date) as left
        from milestones m join projects p on p.id = m.project_id
        where m.status <> 'done' and ${over ? sql`m.due < current_date` : sql`m.due >= current_date and m.due - current_date <= m.notify_days_before`}`)
      for (const m of ms) {
        const left = Number(m.left)
        out.push({
          key: `${event}:${m.id}:${m.due}`,
          severity: over ? 'critical' : left <= 2 ? 'warn' : 'info',
          titleAr: over ? `معلم متأخر: ${m.title_ar} — ${m.code}` : `معلم قريب: ${m.title_ar} — ${m.code}`,
          titleEn: over ? `Milestone overdue: ${m.title_en} — ${m.code}` : `Milestone coming up: ${m.title_en} — ${m.code}`,
          bodyAr: over ? `كان الموعد قبل ${-left} يوم` : left === 0 ? 'الموعد اليوم' : `يتبقى ${left} يوم`,
          bodyEn: over ? `It was due ${-left} days ago` : left === 0 ? 'Due today' : `${left} days left`,
          link: '/programme/milestones',
          concerned: m.owner_id ? [str(m.owner_id)] : await teamOf(db, str(m.project_id), 'project_manager'),
        })
      }
      break
    }
    case 'low_stock': {
      const xs = await rows(db, sql`
        select sl.item_id, sl.office_id, sl.qty, i.min_qty, i.name_ar, i.name_en
        from stock_levels sl join items i on i.id = sl.item_id where i.active and sl.qty < i.min_qty`)
      const managers = await rows(db, sql`select u.id, u.office_id, r.permissions->>'supply' as lvl, r.scope from users u join roles r on r.id = u.role_id where u.active and r.permissions->>'supply' in ('edit', 'manage')`)
      for (const x of xs)
        out.push({
          key: `${event}:${x.item_id}:${x.office_id}:${x.qty}`,
          severity: Number(x.qty) === 0 ? 'critical' : 'warn',
          titleAr: `${x.name_ar} تحت الحد الأدنى`,
          titleEn: `${x.name_en} below minimum`,
          bodyAr: `الرصيد ${x.qty} والحد الأدنى ${x.min_qty}`,
          bodyEn: `${x.qty} in stock, minimum ${x.min_qty}`,
          link: '/supply',
          concerned: managers.filter((m) => m.lvl === 'manage' || m.scope === 'all' || m.office_id === x.office_id).map((m) => str(m.id)),
          officeId: str(x.office_id),
        })
      break
    }
  }
  return out
}
