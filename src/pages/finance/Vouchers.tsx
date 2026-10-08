import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PayModal } from '../../components/PayModal'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import { BANK_SDG, BANK_USD } from '../../data/finance'
import type { JournalEntry, SpendRequest } from '../../data/types'
import { findLine } from '../../lib/budget'
import { date, money, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { getOffices, usePerm, useStore, useUser } from '../../lib/store'
import { JournalEntryModal, methodName, Tabs, useAccountName } from './common'

export function Vouchers() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const accName = useAccountName()
  const [tab, setTab] = useState<'payment' | 'receipt'>('payment')
  const [paying, setPaying] = useState<SpendRequest | null>(null)
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [receipt, setReceipt] = useState(false)
  const { can, viewOffice } = usePerm()
  void user
  const isFM = can('finance', 'edit')
  const awaiting = s.requests.filter((r) => r.status === 'approved' && (!viewOffice || r.officeId === viewOffice)).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const list = s.vouchers.filter((v) => v.kind === tab && (!viewOffice || v.officeId === viewOffice)).sort((a, b) => +new Date(b.date) - +new Date(a.date))

  return (
    <div>
      <PageHeader
        title={ar ? 'سندات الصرف والقبض' : 'Payment & receipt vouchers'}
        sub={ar ? 'كل سند يُنشئ قيده المحاسبي تلقائياً بالمشروع والبند والمكتب.' : 'Every voucher creates its journal entry automatically, tagged with project, line and office.'}
        actions={
          isFM && (
            <Button variant="quiet" onClick={() => setReceipt(true)}>
              <Plus size={16} /> {ar ? 'سند قبض جديد' : 'New receipt voucher'}
            </Button>
          )
        }
      />

      <Panel className="mb-6" title={ar ? `طلبات معتمدة بانتظار الصرف (${awaiting.length})` : `Approved requests awaiting payment (${awaiting.length})`}>
        {!isFM && <p className="border-b border-line bg-amber-soft px-5 py-2 text-[13px] text-amber">{ar ? 'دورك يتيح العرض فقط. الصرف لمن لديه صلاحية إدخال في المالية.' : 'Your role is view-only here. Payments need enter access to Finance.'}</p>}
        <div className="max-h-[340px] overflow-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <tbody className="divide-y divide-line">
              {awaiting.map((r) => {
                const f = findLine(s.projects, r.lineId)!
                return (
                  <tr key={r.id}>
                    <td className="num px-5 py-2.5 whitespace-nowrap">
                      <Link to={`/requests/${r.id}`} className="font-medium text-nile hover:underline">
                        {r.code}
                      </Link>
                    </td>
                    <td className="py-2.5 pe-3">
                      <div className="max-w-[340px] truncate">{r.purpose[lang]}</div>
                      <div className="text-[12.5px] text-muted">
                        {getOffices().find((o) => o.id === r.officeId)?.name[lang]}
                        {ar ? '، ' : ', '}
                        {f.project.code} {f.line.code}
                        {r.activityCode && <span className="num">{ar ? '، ' : ', '}{r.activityCode}</span>}
                      </div>
                    </td>
                    <td className="num py-2.5 pe-3 text-end whitespace-nowrap">
                      {money(r.amount, r.currency, lang)}
                      {r.currency === 'SDG' && <span className="block text-[12px] text-muted">{usd(r.amountUSD)}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-end">
                      <Button className="h-9" disabled={!isFM} onClick={() => setPaying(r)}>
                        {ar ? 'صرف' : 'Pay'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['payment', ar ? 'سندات الصرف' : 'Payment vouchers'],
          ['receipt', ar ? 'سندات القبض' : 'Receipt vouchers'],
        ]}
      />
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'رقم السند' : 'Voucher'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'التاريخ' : 'Date'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'البيان' : 'Description'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{tab === 'payment' ? (ar ? 'الطريقة والحساب' : 'Method & account') : ar ? 'الحساب' : 'Account'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'المبلغ' : 'Amount'}</th>
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'القيد' : 'Entry'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((v) => {
              const je = s.journal.find((e) => e.id === v.journalId)
              return (
                <tr key={v.id}>
                  <td className="num px-5 py-2.5 font-medium whitespace-nowrap">{v.no}</td>
                  <td className="num py-2.5 pe-3 whitespace-nowrap text-muted">{date(v.date, lang)}</td>
                  <td className="py-2.5 pe-3">
                    <div className="max-w-[300px] truncate">{v.memo[lang]}</div>
                    <div className="text-[12.5px] text-muted">
                      {v.party[lang]}
                      {v.projectId && <>{ar ? '، ' : ', '}{s.projects.find((p) => p.id === v.projectId)?.code}</>}
                      {ar ? '، ' : ', '}
                      {getOffices().find((o) => o.id === v.officeId)?.name[lang]}
                    </div>
                  </td>
                  <td className="py-2.5 pe-3 text-[13px]">
                    {tab === 'payment' && <span className="me-1.5 rounded bg-paper px-1.5 py-0.5 ring-1 ring-line">{methodName[v.method][lang]}</span>}
                    <span className="text-muted">{accName(v.account)}</span>
                  </td>
                  <td className="num py-2.5 pe-3 text-end whitespace-nowrap">
                    {money(v.amount, v.currency, lang)}
                    {v.currency === 'SDG' && <span className="block text-[12px] text-muted">{usd(v.amountUSD)}</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    {je && (
                      <button className="num text-nile hover:underline" onClick={() => setEntry(je)}>
                        {je.no}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>

      {paying && <PayModal req={paying} open onClose={() => setPaying(null)} />}
      <JournalEntryModal entry={entry} onClose={() => setEntry(null)} />
      <ReceiptModal open={receipt} onClose={() => setReceipt(false)} />
    </div>
  )
}

function ReceiptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [projectId, setProjectId] = useState('pa')
  const [amount, setAmount] = useState(25000)
  const [account, setAccount] = useState(BANK_USD)
  const [party, setParty] = useState(ar ? 'مانح (أ)' : 'Donor A')
  const [memo, setMemo] = useState(ar ? 'الدفعة الثالثة — مشروع (أ)' : 'Third tranche — Project A')
  const revenue = projectId ? '4101' : '4102'
  const banks = s.accounts.filter((a) => a.postable && a.code.startsWith('1102'))
  return (
    <Modal open={open} onClose={onClose} title={ar ? 'سند قبض جديد' : 'New receipt voucher'}>
      <div className="space-y-4">
        <Field label={ar ? 'المشروع' : 'Project'} hint={ar ? 'المنح المقيدة تُربط بمشروعها؛ التبرعات العامة بلا مشروع.' : 'Restricted grants link to their project; general donations have none.'}>
          <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{ar ? 'تبرع عام غير مقيد' : 'General unrestricted donation'}</option>
            {s.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ar ? 'المبلغ (دولار)' : 'Amount (USD)'}>
            <input type="number" className={`${inputCls} num`} value={amount} onChange={(e) => setAmount(Math.max(0, +e.target.value))} />
          </Field>
          <Field label={ar ? 'يودع في' : 'Deposit to'}>
            <select className={inputCls} value={account} onChange={(e) => setAccount(e.target.value)}>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} {b.name[lang]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={ar ? 'الجهة الدافعة' : 'Received from'}>
          <input className={inputCls} value={party} onChange={(e) => setParty(e.target.value)} />
        </Field>
        <Field label={ar ? 'البيان' : 'Description'}>
          <input className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        <p className="rounded-md bg-paper px-3 py-2 text-[13px] text-muted">
          {ar ? 'القيد:' : 'Entry:'} {ar ? 'من ح/' : 'Dr'} <span className="num">{account}</span> {ar ? 'إلى ح/' : '/ Cr'} <span className="num">{revenue}</span>{' '}
          {revenue === '4101' ? (ar ? 'منح نقدية مقيدة' : 'Restricted grants') : ar ? 'تبرعات عامة' : 'Unrestricted donations'}
          {account === BANK_SDG && (ar ? ' — يُحوّل للجنيه بسعر اليوم' : ' — converted to SDG at today’s rate')}
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={amount <= 0}
          onClick={async () => {
            if ((await s.recordReceipt({ projectId: projectId || undefined, amountUSD: amount, account, revenueAccount: revenue, party, memo })) === false) return
            onClose()
          }}
        >
          {ar ? 'تسجيل السند' : 'Record voucher'}
        </Button>
      </div>
    </Modal>
  )
}
