import { CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, FileText, HandCoins, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GetStarted } from '../components/GetStarted'
import { PageHelpButton } from '../components/Help'
import { Panel, StatusBadge } from '../components/ui'
import { roleNames } from '../data/seed'
import { activityStatus, statusName, statusTone } from '../lib/activities'
import { date, daysUntil, relDays, usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { getOffices, usePerm, useStore, useUser } from '../lib/store'
import type { ReactNode } from 'react'

/**
 * The first screen for staff who work for one office and do not approve anything (field officers).
 * It answers "what do I need to do today?" with only their own office's records — no country map,
 * no project ceilings, no other offices' deadlines.
 */
export function FieldDashboard() {
  const lang = useLang()
  const ar = lang === 'ar'
  const user = useUser()
  const s = useStore()
  const { can } = usePerm()
  const office = getOffices().find((o) => o.id === user.officeId)
  const canRequest = can('projects', 'edit')
  const canReport = can('activities', 'edit')
  const Chevron = ar ? ChevronLeft : ChevronRight

  const mine = s.activities.filter((a) => a.officeId === user.officeId)
  const withStatus = mine.map((a) => ({ a, st: activityStatus(a, s) }))
  const overdue = withStatus.filter((x) => x.st === 'report_overdue')
  const waiting = withStatus.filter((x) => x.st === 'awaiting_report')
  const needReport = [...overdue, ...waiting].sort((x, y) => +new Date(x.a.date) - +new Date(y.a.date))
  const comingUp = withStatus
    .filter((x) => x.st === 'planned')
    .sort((x, y) => +new Date(x.a.date) - +new Date(y.a.date))
    .slice(0, 3)
  const openAdvances = s.advances.filter((a) => a.officeId === user.officeId && a.status === 'open').sort((x, y) => +new Date(x.dueAt) - +new Date(y.dueAt))
  const requests = s.requests
    .filter((r) => r.officeId === user.officeId)
    .sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))
  const myPending = requests.filter((r) => r.status === 'pending').length
  const approvedWaiting = requests.filter((r) => r.status === 'approved').length
  const rejected = requests.filter((r) => r.status === 'rejected')

  // Only deadlines that belong to this office or to nobody in particular.
  const otherOffices = getOffices().filter((o) => o.id !== user.officeId)
  const myDeadlines = s.deadlines
    .filter((d) => d.owner === user.role && !otherOffices.some((o) => d.title.en.includes(o.name.en) || d.title.ar.includes(o.name.ar)))
    .filter((d) => daysUntil(d.due) <= d.notifyDaysBefore)
    .sort((a, b) => +new Date(a.due) - +new Date(b.due))

  const hour = new Date().getHours()
  const greet = ar ? (hour < 12 ? 'صباح الخير' : 'مساء الخير') : hour < 12 ? 'Good morning' : 'Good afternoon'
  const first = user.name[lang].split(' ')[0]
  const todo = needReport.length + openAdvances.length + rejected.length + myDeadlines.length

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[13.5px] text-muted">
          {date(new Date().toISOString(), lang)}
          {office ? ` · ${ar ? 'مكتب' : 'Office:'} ${office.name[lang]}` : ''}
        </div>
        <h1 className="mt-1 flex items-center gap-2.5 text-[28px] font-bold">
          <span>
            {greet}
            {ar ? '، ' : ', '}
            {first}
          </span>
          <PageHelpButton />
        </h1>
        <p className="mt-1.5 max-w-[75ch] text-[15.5px] text-muted">
          {todo === 0
            ? ar
              ? 'لا شيء ينتظرك الآن. أحسنت!'
              : 'Nothing is waiting for you right now. Well done!'
            : ar
              ? `لديك ${todo} ${todo === 1 ? 'أمر ينتظرك' : 'أمور تنتظرك'} — ابدأ بالأقدم.`
              : `You have ${todo} ${todo === 1 ? 'thing' : 'things'} to do — start with the oldest.`}
        </p>
      </header>

      <GetStarted />

      {(canRequest || canReport) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {canRequest && (
            <BigAction to="/requests/new" icon={<Wallet size={26} />} title={ar ? 'اطلب صرف مبلغ' : 'Request money'} sub={ar ? 'اختر البند وأدخل المبلغ — يتحقق النظام من السقف' : 'Pick the budget line and amount — the ceiling is checked for you'} />
          )}
          {canReport && (
            <BigAction to="/activities/report" icon={<ClipboardCheck size={26} />} title={ar ? 'أرسل تقريراً ميدانياً' : 'Submit a field report'} sub={ar ? 'من الجوال، ويعمل دون إنترنت' : 'From your phone — works without internet'} />
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={ar ? 'ما ينتظرك' : 'Waiting for you'}>
          {todo === 0 ? (
            <p className="px-5 py-6 text-[14px] text-muted">{ar ? 'لا تقارير متأخرة ولا عُهد مفتوحة ولا طلبات مرفوضة.' : 'No late reports, open advances or rejected requests.'}</p>
          ) : (
            <ul className="divide-y divide-line">
              {needReport.map(({ a, st }) => (
                <Row
                  key={a.id}
                  to={`/activities/report?activity=${encodeURIComponent(a.id)}`}
                  icon={<ClipboardCheck size={18} />}
                  tone={st === 'report_overdue' ? 'crescent' : 'amber'}
                  title={ar ? `ارفع تقرير: ${a.title.ar}` : `Send the report: ${a.title.en}`}
                  sub={`${a.code} — ${relDays(a.date, lang)}`}
                  chevron={<Chevron size={16} className="text-muted" />}
                />
              ))}
              {openAdvances.map((a) => {
                const late = daysUntil(a.dueAt) < 0
                return (
                  <Row
                    key={a.id}
                    to="/finance/advances"
                    icon={<HandCoins size={18} />}
                    tone={late ? 'crescent' : 'amber'}
                    title={ar ? `عهدة مفتوحة ${usd(a.amountUSD)} — سوِّها بالفواتير` : `Open advance ${usd(a.amountUSD)} — settle it with receipts`}
                    sub={`${a.no} — ${late ? relDays(a.dueAt, lang) : ar ? `موعد التسوية ${relDays(a.dueAt, lang)}` : `settle ${relDays(a.dueAt, lang)}`}`}
                    chevron={<Chevron size={16} className="text-muted" />}
                  />
                )
              })}
              {rejected.slice(0, 3).map((r) => (
                <Row
                  key={r.id}
                  to={`/requests/${r.id}`}
                  icon={<FileText size={18} />}
                  tone="crescent"
                  title={ar ? `طلب مرفوض: ${r.purpose.ar}` : `Request rejected: ${r.purpose.en}`}
                  sub={`${r.code} — ${ar ? 'افتحه لتعرف السبب' : 'open it to see why'}`}
                  chevron={<Chevron size={16} className="text-muted" />}
                />
              ))}
              {myDeadlines.map((d) => (
                <Row
                  key={d.id}
                  to="/alerts/calendar"
                  icon={<CalendarClock size={18} />}
                  tone={daysUntil(d.due) < 0 ? 'crescent' : 'amber'}
                  title={d.title[lang]}
                  sub={`${relDays(d.due, lang)} — ${date(d.due, lang)}`}
                  chevron={<Chevron size={16} className="text-muted" />}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={ar ? 'طلبات الصرف في مكتبي' : 'Spend requests in my office'}
          aside={
            <Link to="/requests" className="text-[13px] text-nile hover:underline">
              {ar ? 'عرض الكل' : 'See all'}
            </Link>
          }
        >
          <p className="border-b border-line px-5 py-2.5 text-[13px] text-muted">
            {ar
              ? `${myPending} قيد الاعتماد · ${approvedWaiting} معتمد بانتظار الدفع من المالية`
              : `${myPending} in approval · ${approvedWaiting} approved, waiting for Finance to pay`}
          </p>
          {requests.length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-muted">{ar ? 'لم ترسل أي طلب بعد. اضغط «اطلب صرف مبلغ» للبدء.' : 'You have not sent a request yet. Press “Request money” to start.'}</p>
          ) : (
            <ul className="divide-y divide-line">
              {requests.slice(0, 5).map((r) => {
                const step = r.steps.find((x) => x.status === 'pending')
                return (
                  <li key={r.id}>
                    <Link to={`/requests/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium">{r.purpose[lang]}</span>
                        <span className="block text-[12.5px] text-muted">
                          <span className="num">{r.code}</span> · <span className="num">{usd(r.amountUSD)}</span>
                          {r.status === 'pending' && step ? ` · ${ar ? 'عند' : 'with'} ${stepRole(step.role, lang)}` : ''}
                        </span>
                      </span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {comingUp.length > 0 && (
        <Panel title={ar ? 'أنشطة قادمة' : 'Coming up'}>
          <ul className="divide-y divide-line">
            {comingUp.map(({ a, st }) => (
              <li key={a.id}>
                <Link to={`/activities/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{a.title[lang]}</span>
                    <span className="block text-[12.5px] text-muted">
                      <span className="num">{a.code}</span> · {date(a.date, lang)} · {relDays(a.date, lang)}
                    </span>
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[12.5px] font-medium ${statusTone[st]}`}>{statusName[st][lang]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

const stepRole = (role: string, lang: 'ar' | 'en') => roleNames[role][lang]

function BigAction({ to, icon, title, sub }: { to: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="flex min-h-[88px] items-center gap-4 rounded-lg bg-nile p-5 text-white transition-colors hover:bg-nile-2">
      <span className="grid size-12 shrink-0 place-items-center rounded-md bg-white/15">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold">{title}</span>
        <span className="block text-[13.5px] text-white/80">{sub}</span>
      </span>
    </Link>
  )
}

function Row({ to, icon, title, sub, tone, chevron }: { to: string; icon: ReactNode; title: string; sub: string; tone: 'amber' | 'crescent'; chevron: ReactNode }) {
  const c = tone === 'amber' ? 'text-amber bg-amber-soft' : 'text-crescent bg-crescent-soft'
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper">
        <span className={`grid size-8 shrink-0 place-items-center rounded-md ${c}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-medium">{title}</span>
          <span className="block truncate text-[13px] text-muted">{sub}</span>
        </span>
        {chevron}
      </Link>
    </li>
  )
}
