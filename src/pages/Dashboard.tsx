import { AlertTriangle, CalendarClock, CheckCircle2, CircleAlert, FileWarning, Inbox, Gauge } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SudanMap, type SiteStatus } from '../components/SudanMap'
import { Panel, UsageBar, UsageLegend } from '../components/ui'
import { funds, offices } from '../data/seed'
import { lineUsage, pct, projectUsage } from '../lib/budget'
import { date, daysUntil, relDays, usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { useStore, useUser } from '../lib/store'

const statusLabel: Record<SiteStatus, { ar: string; en: string }> = {
  good: { ar: 'مطابق', en: 'Matched' },
  warning: { ar: 'فجوات بسيطة', en: 'Minor gaps' },
  critical: { ar: 'يحتاج متابعة', en: 'Needs follow-up' },
}
const StatusIcon = ({ s, size = 15 }: { s: SiteStatus; size?: number }) =>
  s === 'good' ? <CheckCircle2 size={size} className="text-leaf" /> : s === 'warning' ? <CircleAlert size={size} className="text-amber" /> : <AlertTriangle size={size} className="text-crescent" />

export function Dashboard() {
  const lang = useLang()
  const user = useUser()
  const s = useStore()
  const [selected, setSelected] = useState<string | null>('ksl')
  const ar = lang === 'ar'

  // --- per-office reconciliation status (field report vs money spent) ---
  const siteData = useMemo(() => {
    const out: Record<string, { status: SiteStatus; unmatched: number; unmatchedUSD: number; spentUSD: number; pending: number }> = {}
    for (const o of offices) {
      const ex = s.expenses.filter((e) => e.officeId === o.id)
      const recent = ex.filter((e) => daysUntil(e.date) > -60)
      const um = recent.filter((e) => !e.hasTechReport)
      const spentUSD = ex.reduce((a, e) => a + e.amountUSD, 0)
      const unmatchedUSD = um.reduce((a, e) => a + e.amountUSD, 0)
      const share = unmatchedUSD / Math.max(1, recent.reduce((a, e) => a + e.amountUSD, 0))
      const overdue = s.deadlines.some((d) => daysUntil(d.due) < 0 && d.title.en.includes(o.name.en))
      const status: SiteStatus = overdue || share > 0.2 ? 'critical' : um.length > 0 ? 'warning' : 'good'
      out[o.id] = { status, unmatched: um.length, unmatchedUSD, spentUSD, pending: s.requests.filter((r) => r.officeId === o.id && r.status === 'pending').length }
    }
    return out
  }, [s.expenses, s.requests, s.deadlines])

  const statusMap = Object.fromEntries(Object.entries(siteData).map(([k, v]) => [k, v.status]))
  const counts = { good: 0, warning: 0, critical: 0 } as Record<SiteStatus, number>
  Object.values(siteData).forEach((v) => counts[v.status]++)

  // --- attention items ---
  const myQueue = [
    ...s.requests.filter((r) => r.status === 'pending' && r.steps.some((st) => st.status === 'pending' && st.role === user.role)),
  ]
  const myReallocs = s.reallocations.filter((r) => r.status === 'pending' && r.steps.some((st) => st.status === 'pending' && st.role === user.role))
  const nearCeiling = s.projects.flatMap((p) =>
    p.pillars.flatMap((pl) =>
      pl.lines
        .map((l) => ({ p, l, u: lineUsage(l, s) }))
        .filter(({ u }) => u.ceiling > 0 && pct(u.ceiling - u.available, u.ceiling) >= 0.85),
    ),
  )
  const unmatchedTotal = Object.values(siteData).reduce((a, v) => a + v.unmatched, 0)
  const unmatchedUSD = Object.values(siteData).reduce((a, v) => a + v.unmatchedUSD, 0)
  const worstOffices = Object.entries(siteData)
    .filter(([, v]) => v.unmatched > 0)
    .sort((a, b) => b[1].unmatchedUSD - a[1].unmatchedUSD)
    .slice(0, 2)
    .map(([id]) => offices.find((o) => o.id === id)!.name[lang])
  const alerting = s.deadlines
    .filter((d) => daysUntil(d.due) <= d.notifyDaysBefore)
    .sort((a, b) => +new Date(a.due) - +new Date(b.due))

  // --- funds ---
  const cashSpent = s.expenses.reduce((a, e) => a + e.amountUSD, 0)
  const cashCommitted = s.requests.filter((r) => r.status === 'approved').reduce((a, r) => a + r.amountUSD, 0)
  const cash = funds[0]
  const inkind = funds[1]
  const inkindIssued = 121_300

  const hour = new Date().getHours()
  const greet = ar ? (hour < 12 ? 'صباح الخير' : 'مساء الخير') : hour < 12 ? 'Good morning' : 'Good afternoon'
  const nearest = alerting.find((d) => daysUntil(d.due) >= 0)

  const sel = selected ? offices.find((o) => o.id === selected)! : null
  const selData = selected ? siteData[selected] : null

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[13.5px] text-muted">{date(new Date().toISOString(), lang)}</div>
        <h1 className="mt-1 text-[28px] font-bold">
          {greet}{ar ? '، ' : ', '}{user.name[lang].split(' ')[0] === 'د.' ? user.name[lang] : user.name[lang].split(' ')[0]}
        </h1>
        <p className="mt-1.5 max-w-[75ch] text-[15.5px] text-muted">
          {ar ? (
            <>
              لديك <b className="text-ink">{myQueue.length + myReallocs.length}</b> طلبات بانتظار اعتمادك، و
              <b className="text-ink">{unmatchedTotal}</b> مصروفات بلا تقرير فني مرتبط بها
              {nearest && (
                <>
                  ، وأقرب موعد تسليم <b className="text-ink">{relDays(nearest.due, lang)}</b>
                </>
              )}
              .
            </>
          ) : (
            <>
              You have <b className="text-ink">{myQueue.length + myReallocs.length}</b> items awaiting your approval and{' '}
              <b className="text-ink">{unmatchedTotal}</b> expenses with no linked field report
              {nearest && (
                <>
                  ; the nearest deadline is <b className="text-ink">{relDays(nearest.due, lang)}</b>
                </>
              )}
              .
            </>
          )}
        </p>
      </header>

      {/* The two funding streams */}
      <Panel className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0 md:rtl:divide-x-reverse">
        <FundBlock
          title={cash.name[lang]}
          route={cash.donor[lang]}
          received={cash.receivedUSD}
          parts={[
            { v: cashSpent, label: ar ? 'مصروف' : 'Spent', cls: 'bg-nile' },
            { v: cashCommitted, label: ar ? 'محجوز' : 'Committed', cls: 'bg-amber' },
          ]}
        />
        <FundBlock
          title={inkind.name[lang]}
          route={inkind.donor[lang]}
          received={inkind.receivedUSD}
          parts={[{ v: inkindIssued, label: ar ? 'صُرف للمكاتب' : 'Issued to offices', cls: 'bg-nile' }]}
          note={ar ? 'القيمة التقديرية للمواد العينية' : 'Estimated value of in-kind goods'}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        {/* Map */}
        <Panel
          title={ar ? 'المكاتب ومطابقة التقارير' : 'Offices and report matching'}
          aside={
            <div className="flex gap-3 text-[12.5px] text-muted">
              {(['good', 'warning', 'critical'] as SiteStatus[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <StatusIcon s={k} size={13} /> {statusLabel[k][lang]} <span className="num text-ink">{counts[k]}</span>
                </span>
              ))}
            </div>
          }
        >
          <div className="grid gap-2 p-4 md:grid-cols-[1.3fr_1fr] md:items-center">
            <SudanMap offices={offices} status={statusMap} selected={selected} onSelect={setSelected} />
            {sel && selData && (
              <div className="rounded-md bg-paper p-4">
                <div className="text-[12.5px] text-muted">{sel.state[lang]}</div>
                <div className="font-kufi text-[19px] font-semibold">{sel.name[lang]}</div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[13.5px]">
                  <StatusIcon s={selData.status} /> {statusLabel[selData.status][lang]}
                </div>
                <dl className="mt-4 space-y-2.5 text-[14px]">
                  <Row k={ar ? 'إجمالي المصروف' : 'Total spent'} v={usd(selData.spentUSD)} />
                  <Row
                    k={ar ? 'مصروفات بلا تقرير فني' : 'Spent, no field report'}
                    v={
                      selData.unmatched ? (
                        <span className="text-crescent">
                          {selData.unmatched} ({usd(selData.unmatchedUSD)})
                        </span>
                      ) : (
                        <span className="text-leaf">{ar ? 'لا يوجد' : 'None'}</span>
                      )
                    }
                  />
                  <Row k={ar ? 'طلبات قيد الاعتماد' : 'Requests in approval'} v={selData.pending} />
                </dl>
                <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
                  {ar
                    ? 'الحالة تُحسب من المصروفات خلال آخر 60 يوماً التي لم يُرفع لها تقرير فني.'
                    : 'Status is based on expenses in the last 60 days that have no field report yet.'}
                </p>
              </div>
            )}
          </div>
        </Panel>

        {/* Attention list */}
        <Panel title={ar ? 'يحتاج إلى إجراء' : 'Needs action'}>
          <ul className="divide-y divide-line">
            <Attention
              icon={<Inbox size={18} />}
              to="/approvals"
              title={ar ? `${myQueue.length + myReallocs.length} بانتظار اعتمادك` : `${myQueue.length + myReallocs.length} awaiting your approval`}
              sub={
                myQueue[0]
                  ? `${myQueue[0].code} — ${myQueue[0].purpose[lang]}`
                  : ar
                    ? 'لا توجد طلبات لدورك الحالي — بدّل الدور من الأعلى'
                    : 'Nothing for your current role — switch role at the top'
              }
              tone={myQueue.length + myReallocs.length ? 'amber' : 'muted'}
            />
            <Attention
              icon={<FileWarning size={18} />}
              to="/reconciliation"
              title={ar ? `${unmatchedTotal} مصروفات بلا تقرير فني` : `${unmatchedTotal} expenses without a field report`}
              sub={
                unmatchedTotal
                  ? ar
                    ? `بقيمة ${usd(unmatchedUSD)} — أغلبها من ${worstOffices.join(' و')}`
                    : `Worth ${usd(unmatchedUSD)} — mostly ${worstOffices.join(' and ')}`
                  : ar
                    ? 'كل المصروفات لها تقارير فنية'
                    : 'Every expense has a field report'
              }
              tone="crescent"
            />
            <Attention
              icon={<Gauge size={18} />}
              to="/projects/pa"
              title={ar ? `${nearCeiling.length} بنود تجاوزت 85% من سقفها` : `${nearCeiling.length} lines past 85% of their ceiling`}
              sub={nearCeiling
                .slice(0, 3)
                .map(({ l }) => `${l.code} ${l.name[lang]}`)
                .join(ar ? '، ' : ', ')}
              tone="amber"
            />
            {alerting.slice(0, 3).map((d) => {
              const dd = daysUntil(d.due)
              return (
                <Attention
                  key={d.id}
                  icon={<CalendarClock size={18} />}
                  to="/alerts"
                  title={d.title[lang]}
                  sub={`${relDays(d.due, lang)} — ${date(d.due, lang)}`}
                  tone={dd < 0 ? 'crescent' : 'amber'}
                />
              )
            })}
          </ul>
        </Panel>
      </div>

      {/* Projects */}
      <Panel title={ar ? 'المشاريع — الصرف مقابل السقف' : 'Projects — spending against ceiling'} aside={<UsageLegend />}>
        <ul className="divide-y divide-line">
          {s.projects.map((p) => {
            const u = projectUsage(p, s)
            return (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="grid gap-3 px-5 py-4 hover:bg-paper md:grid-cols-[1.2fr_2fr_auto] md:items-center">
                  <div>
                    <div className="text-[12.5px] text-muted">
                      {p.code}{lang === 'ar' ? '، ' : ', '}{p.donor[lang]}
                    </div>
                    <div className="font-medium">{p.name[lang]}</div>
                  </div>
                  <UsageBar u={u} height={12} />
                  <div className="num text-[14px] md:text-end">
                    <span className="font-semibold">{usd(u.available)}</span>{' '}
                    <span className="text-muted">
                      {ar ? 'متاح من' : 'available of'} {usd(u.ceiling)}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="num font-medium">{v}</dd>
    </div>
  )
}

function FundBlock({
  title,
  route,
  received,
  parts,
  note,
}: {
  title: string
  route: string
  received: number
  parts: { v: number; label: string; cls: string }[]
  note?: string
}) {
  const lang = useLang()
  const used = parts.reduce((a, p) => a + p.v, 0)
  const bal = received - used
  return (
    <div className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <span className="text-[13px] text-muted">{route}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="num font-kufi text-[30px] font-bold leading-none">{usd(bal)}</span>
        <span className="text-[13.5px] text-muted">
          {lang === 'ar' ? 'رصيد متاح من' : 'available of'} <span className="num">{usd(received)}</span> {lang === 'ar' ? 'مستلم' : 'received'}
        </span>
      </div>
      <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-[3px] bg-paper ring-1 ring-inset ring-line">
        {parts.map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${(p.v / received) * 100}%` }} title={`${p.label} ${usd(p.v)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-[13px] text-muted">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-[2px] ${p.cls}`} />
            {p.label} <span className="num text-ink">{usd(p.v)}</span>
          </span>
        ))}
        {note && <span>{note}</span>}
      </div>
    </div>
  )
}

function Attention({ icon, title, sub, to, tone }: { icon: ReactNode; title: string; sub: string; to: string; tone: 'amber' | 'crescent' | 'muted' }) {
  const c = tone === 'amber' ? 'text-amber bg-amber-soft' : tone === 'crescent' ? 'text-crescent bg-crescent-soft' : 'text-muted bg-paper'
  return (
    <li>
      <Link to={to} className="flex items-start gap-3 px-5 py-3.5 hover:bg-paper">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${c}`}>{icon}</span>
        <span className="min-w-0">
          <span className="block text-[14.5px] font-medium">{title}</span>
          <span className="block truncate text-[13px] text-muted">{sub}</span>
        </span>
      </Link>
    </li>
  )
}
