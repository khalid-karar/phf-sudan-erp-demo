import { CheckCircle2, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, PageHeader, Panel, UsageBar } from '../../components/ui'
import { cashAccount, staff } from '../../data/finance'
import { lineUsage, pillarUsage, projectUsage } from '../../lib/budget'
import { num, usd } from '../../lib/format'
import { balances } from '../../lib/ledger'
import { useLang } from '../../lib/i18n'
import { getOffices, useStore } from '../../lib/store'
import { Tabs } from './common'

export function FinanceReports() {
  const lang = useLang()
  const ar = lang === 'ar'
  const [tab, setTab] = useState<'tb' | 'bva' | 'cash'>('tb')
  return (
    <div>
      <PageHeader
        title={ar ? 'التقارير المالية' : 'Financial reports'}
        actions={
          <Button variant="quiet" onClick={() => window.print()}>
            <Printer size={16} /> {ar ? 'طباعة' : 'Print'}
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['tb', ar ? 'ميزان المراجعة' : 'Trial balance'],
          ['bva', ar ? 'الميزانية مقابل الفعلي' : 'Budget vs actual'],
          ['cash', ar ? 'المركز النقدي للمكاتب' : 'Cash position by office'],
        ]}
      />
      {tab === 'tb' ? <TrialBalance /> : tab === 'bva' ? <BudgetVsActual /> : <CashPosition />}
    </div>
  )
}

function TrialBalance() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [office, setOffice] = useState('')
  const [project, setProject] = useState('')
  const bal = useMemo(() => balances(s.accounts, s.journal, { officeId: office || undefined, projectId: project || undefined }), [s.accounts, s.journal, office, project])
  const rows = s.accounts
    .filter((a) => a.postable)
    .map((a) => {
      const b = bal.get(a.code)!
      const net = b.debit - b.credit
      return { a, dr: net > 0 ? net : 0, cr: net < 0 ? -net : 0 }
    })
    .filter((r) => r.dr > 0.004 || r.cr > 0.004)
    .sort((x, y) => x.a.code.localeCompare(y.a.code))
  const dr = rows.reduce((t, r) => t + r.dr, 0)
  const cr = rows.reduce((t, r) => t + r.cr, 0)
  const filtered = !!(office || project)
  return (
    <Panel>
      <div className="flex flex-wrap gap-3 border-b border-line px-5 py-3">
        <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={office} onChange={(e) => setOffice(e.target.value)}>
          <option value="">{ar ? 'كل المكاتب' : 'All offices'}</option>
          {getOffices().map((o) => (
            <option key={o.id} value={o.id}>
              {o.name[lang]}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">{ar ? 'كل المشاريع' : 'All projects'}</option>
          {s.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name[lang]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الحساب' : 'Account'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'رصيد مدين' : 'Debit balance'}</th>
              <th className="px-5 py-2.5 text-end font-medium">{ar ? 'رصيد دائن' : 'Credit balance'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.a.code}>
                <td className="px-5 py-2">
                  <span className="num me-2 text-muted">{r.a.code}</span>
                  {r.a.name[lang]}
                </td>
                <td className="num py-2 pe-3 text-end">{r.dr ? usd(r.dr) : ''}</td>
                <td className="num px-5 py-2 text-end">{r.cr ? usd(r.cr) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/70 font-semibold">
              <td className="px-5 py-2.5">{ar ? 'الإجمالي' : 'Total'}</td>
              <td className="num py-2.5 pe-3 text-end">{usd(dr)}</td>
              <td className="num px-5 py-2.5 text-end">{usd(cr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={`flex items-center gap-1.5 border-t border-line px-5 py-3 text-[13.5px] ${Math.abs(dr - cr) < 1 ? 'text-leaf' : 'text-muted'}`}>
        <CheckCircle2 size={16} />
        {Math.abs(dr - cr) < 1
          ? ar
            ? 'الميزان متوازن.'
            : 'The trial balance balances.'
          : filtered
            ? ar
              ? 'عند التصفية بمكتب أو مشروع يظهر الجزء الخاص به فقط من كل قيد، لذلك قد لا يتساوى الطرفان.'
              : 'Filtered by office or project, only that part of each entry shows, so the sides may not match.'
            : ar
              ? 'الميزان غير متوازن.'
              : 'The trial balance does not balance.'}
      </p>
    </Panel>
  )
}

function BudgetVsActual() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [pid, setPid] = useState(s.projects[0].id)
  const p = s.projects.find((x) => x.id === pid)!
  const pu = projectUsage(p, s)
  const pctTxt = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={pid} onChange={(e) => setPid(e.target.value)}>
          {s.projects.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} — {x.name[lang]}
            </option>
          ))}
        </select>
        <span className="num text-[14px] text-muted">
          {ar ? 'نسبة الصرف الفعلي' : 'Actual spend rate'} <b className="text-ink">{pctTxt(pu.spent, pu.ceiling)}</b>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'البند' : 'Line'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الميزانية' : 'Budget'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الفعلي' : 'Actual'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الالتزامات' : 'Commitments'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'المتبقي' : 'Remaining'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'نسبة الصرف' : 'Spent %'}</th>
              <th className="w-[18%] px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {p.pillars.map((pl) => {
              const u = pillarUsage(pl, s)
              return [
                <tr key={pl.id} className="border-t border-line bg-paper/80 font-semibold">
                  <td className="px-5 py-2.5">
                    {pl.code}. {pl.name[lang]}
                  </td>
                  <td className="num py-2.5 pe-3 text-end">{usd(u.ceiling)}</td>
                  <td className="num py-2.5 pe-3 text-end">{usd(u.spent)}</td>
                  <td className="num py-2.5 pe-3 text-end">{usd(u.committed + u.pending)}</td>
                  <td className="num py-2.5 pe-3 text-end">{usd(u.available)}</td>
                  <td className="num py-2.5 pe-3 text-end">{pctTxt(u.spent, u.ceiling)}</td>
                  <td className="px-5 py-2.5">
                    <UsageBar u={u} height={8} />
                  </td>
                </tr>,
                ...pl.lines.map((l) => {
                  const lu = lineUsage(l, s)
                  return (
                    <tr key={l.id} className="border-t border-line">
                      <td className="px-5 py-2">
                        <span className="num me-2 text-muted">{l.code}</span>
                        {l.name[lang]}
                      </td>
                      <td className="num py-2 pe-3 text-end">{usd(lu.ceiling)}</td>
                      <td className="num py-2 pe-3 text-end">{usd(lu.spent)}</td>
                      <td className="num py-2 pe-3 text-end">{usd(lu.committed + lu.pending)}</td>
                      <td className={`num py-2 pe-3 text-end ${lu.available < lu.ceiling * 0.15 ? 'text-crescent' : ''}`}>{usd(lu.available)}</td>
                      <td className="num py-2 pe-3 text-end">{pctTxt(lu.spent, lu.ceiling)}</td>
                      <td className="px-5 py-2">
                        <UsageBar u={lu} height={6} />
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/70 font-semibold">
              <td className="px-5 py-2.5">{ar ? 'إجمالي المشروع' : 'Project total'}</td>
              <td className="num py-2.5 pe-3 text-end">{usd(pu.ceiling)}</td>
              <td className="num py-2.5 pe-3 text-end">{usd(pu.spent)}</td>
              <td className="num py-2.5 pe-3 text-end">{usd(pu.committed + pu.pending)}</td>
              <td className="num py-2.5 pe-3 text-end">{usd(pu.available)}</td>
              <td className="num py-2.5 pe-3 text-end">{pctTxt(pu.spent, pu.ceiling)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  )
}

function CashPosition() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const rate = s.rates[s.rates.length - 1].rate
  const bal = useMemo(() => balances(s.accounts, s.journal), [s.accounts, s.journal])
  const banks = s.accounts.filter((a) => a.postable && a.code.startsWith('1102'))
  const rows = getOffices().map((o) => {
    const box = bal.get(cashAccount(o.id, s.accounts)) ?? { sdg: 0, balance: 0, debit: 0, credit: 0 }
    const officeBanks = banks.filter((b) => b.officeId === o.id)
    const bankUSD = officeBanks.reduce((t, b) => {
      const v = bal.get(b.code)!
      return t + (b.currency === 'SDG' ? v.sdg / rate : v.balance)
    }, 0)
    const adv = s.advances.filter((a) => a.officeId === o.id && a.status === 'open').reduce((t, a) => t + a.amountUSD, 0)
    const holders = new Set(s.advances.filter((a) => a.officeId === o.id && a.status === 'open').map((a) => a.holderName ?? staff.find((x) => x.id === a.staffId)?.name[lang]))
    return { o, sdg: box.sdg, boxUSD: box.sdg / rate, bankUSD, adv, holders: [...holders].filter(Boolean).join(ar ? '، ' : ', ') }
  })
  const tot = rows.reduce((t, r) => ({ box: t.box + r.boxUSD, bank: t.bank + r.bankUSD, adv: t.adv + r.adv }), { box: 0, bank: 0, adv: 0 })
  return (
    <Panel>
      <p className="border-b border-line px-5 py-3 text-[13.5px] text-muted">
        {ar ? `أرصدة الجنيه مقوّمة بسعر اليوم ${num(rate)}.` : `SDG balances valued at today’s rate of ${num(rate)}.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'المكتب' : 'Office'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الصندوق (جنيه)' : 'Cash box (SDG)'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الصندوق (دولار)' : 'Cash box (USD)'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'البنوك' : 'Banks'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'عهد لدى الموظفين' : 'Held by staff'}</th>
              <th className="px-5 py-2.5 text-end font-medium">{ar ? 'الإجمالي' : 'Total'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.o.id}>
                <td className="px-5 py-2.5">{r.o.name[lang]}</td>
                <td className="num py-2.5 pe-3 text-end">{r.sdg ? num(r.sdg) : <span className="text-muted">—</span>}</td>
                <td className="num py-2.5 pe-3 text-end">{r.sdg ? usd(r.boxUSD) : <span className="text-muted">—</span>}</td>
                <td className="num py-2.5 pe-3 text-end">{r.bankUSD ? usd(r.bankUSD) : <span className="text-muted">—</span>}</td>
                <td className="num py-2.5 pe-3 text-end">
                  {r.adv ? usd(r.adv) : <span className="text-muted">—</span>}
                  {r.holders && <span className="block text-[11.5px] text-muted">{r.holders}</span>}
                </td>
                <td className="num px-5 py-2.5 text-end font-medium">{usd(r.boxUSD + r.bankUSD + r.adv)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/70 font-semibold">
              <td className="px-5 py-2.5">{ar ? 'الإجمالي' : 'Total'}</td>
              <td />
              <td className="num py-2.5 pe-3 text-end">{usd(tot.box)}</td>
              <td className="num py-2.5 pe-3 text-end">{usd(tot.bank)}</td>
              <td className="num py-2.5 pe-3 text-end">{usd(tot.adv)}</td>
              <td className="num px-5 py-2.5 text-end">{usd(tot.box + tot.bank + tot.adv)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  )
}

