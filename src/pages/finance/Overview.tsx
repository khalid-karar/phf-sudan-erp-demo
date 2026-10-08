import { AlertTriangle, ArrowLeftRight, BookOpen, CalendarCheck, FileSpreadsheet, HandCoins, Landmark, Receipt } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Panel } from '../../components/ui'
import { staff } from '../../data/finance'
import { date, daysUntil, num, relDays, usd } from '../../lib/format'
import { balances, revaluation } from '../../lib/ledger'
import { useLang } from '../../lib/i18n'
import { getOffices, usePerm, useStore } from '../../lib/store'
import { activityFor } from './Advances'
import { useCloseChecks } from './Close'

export function FinanceOverview() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const rate = s.rates[s.rates.length - 1].rate
  const { viewOffice } = usePerm()
  const bal = balances(s.accounts, s.journal, { officeId: viewOffice || undefined })
  const cashBoxes = s.accounts.filter((a) => a.postable && a.code.startsWith('1101-')).reduce((t, a) => t + bal.get(a.code)!.sdg / rate, 0)
  const banks = s.accounts.filter((a) => a.postable && a.code.startsWith('1102')).reduce((t, a) => t + (a.currency === 'SDG' ? bal.get(a.code)!.sdg / rate : bal.get(a.code)!.balance), 0)
  const openAdv = s.advances.filter((a) => a.status === 'open' && (!viewOffice || a.officeId === viewOffice))
  const overdue = openAdv.filter((a) => daysUntil(a.dueAt) < 0)
  const awaiting = s.requests.filter((r) => r.status === 'approved' && (!viewOffice || r.officeId === viewOffice))
  const fx = revaluation(s.accounts, viewOffice ? s.journal.map((e) => ({ ...e, lines: e.lines.filter((l) => l.officeId === viewOffice) })) : s.journal, rate).reduce((t, r) => t + r.diff, 0)
  const closeRows = useCloseChecks().filter((r) => !viewOffice || r.office.id === viewOffice)
  const closed = closeRows.filter((r) => r.close.closedAt).length

  const links: [string, ReactNode, string, string][] = [
    ['/finance/accounts', <BookOpen size={18} />, ar ? 'دليل الحسابات' : 'Chart of accounts', ar ? 'الشجرة والأرصدة وكشوف الحسابات' : 'Tree, balances, statements'],
    ['/finance/vouchers', <Receipt size={18} />, ar ? 'سندات الصرف والقبض' : 'Vouchers', ar ? 'صرف الطلبات المعتمدة واستلام المنح' : 'Pay approved requests, receive grants'],
    ['/finance/advances', <HandCoins size={18} />, ar ? 'العُهد وتسويتها' : 'Advances', ar ? 'التسوية مربوطة بالتقرير الفني' : 'Settlement tied to the field report'],
    ['/finance/journal', <FileSpreadsheet size={18} />, ar ? 'قيود اليومية' : 'Journal', ar ? 'قيود تلقائية من كل حركة' : 'Automatic entries from every transaction'],
    ['/finance/rates', <ArrowLeftRight size={18} />, ar ? 'أسعار الصرف' : 'Exchange rates', ar ? 'سجل الأسعار وفروق العملة' : 'Rate log and FX differences'],
    ['/finance/close', <CalendarCheck size={18} />, ar ? 'الإقفال الشهري' : 'Monthly close', ar ? 'قائمة تحقق لكل مكتب' : 'Checklist per office'],
    ['/finance/reports', <Landmark size={18} />, ar ? 'التقارير المالية' : 'Financial reports', ar ? 'ميزان المراجعة والميزانية مقابل الفعلي' : 'Trial balance, budget vs actual'],
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={ar ? 'المالية' : 'Finance'} sub={ar ? `كل الأرقام بالدولار بسعر اليوم ${num(rate)} ج.س.` : `All figures in USD at today’s rate of ${num(rate)} SDG.`} />

      <Panel className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x lg:rtl:divide-x-reverse">
        <Figure label={ar ? 'النقدية بالبنوك' : 'Cash at bank'} value={usd(banks)} to="/finance/reports" />
        <Figure label={ar ? 'النقدية بصناديق المكاتب' : 'Cash in office boxes'} value={usd(cashBoxes)} to="/finance/reports" />
        <Figure
          label={ar ? 'عهد لدى الموظفين' : 'Advances held by staff'}
          value={usd(openAdv.reduce((t, a) => t + a.amountUSD, 0))}
          note={overdue.length ? (ar ? `${overdue.length} متأخرة` : `${overdue.length} overdue`) : undefined}
          to="/finance/advances"
        />
        <Figure label={ar ? 'فروق عملة غير مرحّلة' : 'Unposted FX difference'} value={usd(fx)} tone={fx < -0.5 ? 'bad' : undefined} to="/finance/rates" />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={ar ? `بانتظار الصرف (${awaiting.length})` : `Awaiting payment (${awaiting.length})`} aside={<Link to="/finance/vouchers" className="text-[13.5px] text-nile hover:underline">{ar ? 'الكل' : 'All'}</Link>}>
          <ul className="divide-y divide-line">
            {awaiting.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[14px]">
                <span className="min-w-0">
                  <span className="num me-2 text-muted">{r.code}</span>
                  <span className="truncate">{r.purpose[lang]}</span>
                </span>
                <span className="num shrink-0 font-medium">{usd(r.amountUSD)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={ar ? 'العُهد التي تحتاج متابعة' : 'Advances needing attention'} aside={<Link to="/finance/advances" className="text-[13.5px] text-nile hover:underline">{ar ? 'الكل' : 'All'}</Link>}>
          <ul className="divide-y divide-line">
            {openAdv
              .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))
              .map((a) => {
                const late = daysUntil(a.dueAt) < 0
                const hasReport = !!activityFor(a.activityCode)?.report
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[14px]">
                    <span className="min-w-0">
                      <span className="num me-2 text-muted">{a.no}</span>
                      {a.holderName ?? staff.find((x) => x.id === a.staffId)?.name[lang]}
                      <span className="block text-[12.5px] text-muted">
                        {getOffices().find((o) => o.id === a.officeId)?.name[lang]}
                        {ar ? '، ' : ', '}
                        {hasReport ? (ar ? 'التقرير مستلم — جاهزة للتسوية' : 'report in — ready to settle') : ar ? 'بانتظار التقرير الفني' : 'waiting for field report'}
                      </span>
                    </span>
                    <span className={`shrink-0 text-end text-[13px] ${late ? 'text-crescent' : 'text-muted'}`}>
                      {late && <AlertTriangle size={14} className="me-1 inline" />}
                      {relDays(a.dueAt, lang)}
                      <span className="num block font-medium text-ink">{usd(a.amountUSD)}</span>
                    </span>
                  </li>
                )
              })}
          </ul>
        </Panel>
      </div>

      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15.5px] font-semibold">{ar ? 'الإقفال الشهري' : 'Monthly close'}</h2>
            <p className="num text-[13.5px] text-muted">
              {closed}/{closeRows.length} {ar ? 'مكاتب أُقفلت' : 'offices closed'}
              {ar ? ' — آخر قيد ' : ' — last entry '}
              {date(s.journal[s.journal.length - 1].date, lang)}
            </p>
          </div>
          <Link to="/finance/close" className="text-[14px] text-nile hover:underline">
            {ar ? 'فتح قائمة الإقفال' : 'Open close checklist'}
          </Link>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {links.map(([to, icon, t, d]) => (
          <Link key={to} to={to} className="flex gap-3 rounded-lg border border-line bg-surface p-4 hover:border-nile-2">
            <span className="mt-0.5 text-nile">{icon}</span>
            <span>
              <span className="block font-medium">{t}</span>
              <span className="block text-[13px] text-muted">{d}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Figure({ label, value, note, tone, to }: { label: string; value: string; note?: string; tone?: 'bad'; to: string }) {
  return (
    <Link to={to} className="block p-5 hover:bg-paper">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`num mt-1 font-kufi text-[24px] font-semibold ${tone === 'bad' ? 'text-crescent' : ''}`}>{value}</div>
      {note && <div className="text-[13px] text-crescent">{note}</div>}
    </Link>
  )
}
