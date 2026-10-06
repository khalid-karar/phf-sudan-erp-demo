import { Banknote, Building2, HandCoins, Smartphone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ADVANCES, BANK_PTS, BANK_SDG, BANK_USD, cashAccount, staff } from '../data/finance'
import type { PayMethod, SpendRequest } from '../data/types'
import { money, usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Button, Modal } from './ui'

export function PayModal({ req, open, onClose }: { req: SpendRequest; open: boolean; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [method, setMethod] = useState<PayMethod>(req.activityCode ? 'advance' : 'bank')
  const officeStaff = staff.filter((x) => x.officeId === req.officeId)
  const [staffId, setStaffId] = useState(officeStaff[0]?.id ?? staff[0].id)

  const methods: { k: PayMethod; icon: ReactNode; t: string; d: string }[] = [
    {
      k: 'advance',
      icon: <HandCoins size={18} />,
      t: ar ? 'عهدة نقدية لموظف' : 'Cash advance to staff',
      d: ar ? 'للأنشطة الميدانية: يُسجّل المصروف عند التسوية بعد التقرير الفني.' : 'For field activities: the expense is recorded at settlement, after the field report.',
    },
    { k: 'cash', icon: <Banknote size={18} />, t: ar ? 'نقداً من صندوق المكتب' : 'Cash from the office box', d: ar ? 'دفع مباشر للمورد.' : 'Direct payment to the supplier.' },
    { k: 'bank', icon: <Building2 size={18} />, t: ar ? 'تحويل بنكي / شيك' : 'Bank transfer / cheque', d: ar ? 'من حساب البنك.' : 'From the bank account.' },
    { k: 'bankak', icon: <Smartphone size={18} />, t: ar ? 'تحويل عبر بنكك' : 'Bankak mobile transfer', d: ar ? 'من حساب بنك الخرطوم بالجنيه.' : 'From the Bank of Khartoum SDG account.' },
  ]

  const account =
    method === 'cash' || method === 'advance' ? cashAccount(req.officeId) : req.currency === 'USD' && method === 'bank' ? BANK_USD : req.officeId === 'pts' && method === 'bank' ? BANK_PTS : BANK_SDG
  const debitAcc = method === 'advance' ? ADVANCES : s.lineMap[req.lineId]
  const accName = (code: string) => s.accounts.find((a) => a.code === code)?.name[lang]

  return (
    <Modal open={open} onClose={onClose} title={ar ? `صرف الطلب ${req.code}` : `Pay request ${req.code}`} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2" role="radiogroup">
          {methods.map((m) => (
            <label key={m.k} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${method === m.k ? 'border-nile-2 bg-nile-soft/50' : 'border-line hover:border-nile-2/50'}`}>
              <input type="radio" name="pay" className="sr-only" checked={method === m.k} onChange={() => setMethod(m.k)} />
              <span className={`mt-0.5 ${method === m.k ? 'text-nile' : 'text-muted'}`}>{m.icon}</span>
              <span>
                <span className="block text-[14.5px] font-medium">{m.t}</span>
                <span className="block text-[12.5px] text-muted">{m.d}</span>
              </span>
            </label>
          ))}
          {method === 'advance' && (
            <label className="block pt-2 text-[13.5px]">
              {ar ? 'الموظف المستلم للعهدة' : 'Staff member receiving the advance'}
              <select className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-2" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {(officeStaff.length ? officeStaff : staff).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name[lang]} — {x.title[lang]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="space-y-4">
          <div className="rounded-md bg-paper p-4">
            <div className="text-[12.5px] text-muted">{ar ? 'المبلغ' : 'Amount'}</div>
            <div className="num font-kufi text-[22px] font-semibold">{money(req.amount, req.currency, lang)}</div>
            <div className="num text-[13px] text-muted">{usd(req.amountUSD)}</div>
          </div>
          <div>
            <div className="mb-2 text-[13px] text-muted">{ar ? 'القيد المحاسبي الذي سيُرحّل تلقائياً' : 'Journal entry that will be posted automatically'}</div>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-[12px] text-muted">
                  <th className="pb-1 text-start font-medium">{ar ? 'الحساب' : 'Account'}</th>
                  <th className="pb-1 text-end font-medium">{ar ? 'مدين' : 'Debit'}</th>
                  <th className="pb-1 text-end font-medium">{ar ? 'دائن' : 'Credit'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line border-y border-line">
                <tr>
                  <td className="py-2">
                    <span className="num text-muted">{debitAcc}</span> {accName(debitAcc)}
                  </td>
                  <td className="num py-2 text-end">{usd(req.amountUSD)}</td>
                  <td />
                </tr>
                <tr>
                  <td className="py-2 ps-4">
                    <span className="num text-muted">{account}</span> {accName(account)}
                  </td>
                  <td />
                  <td className="num py-2 text-end">{usd(req.amountUSD)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] text-muted">
              {ar ? 'يحمل القيد المشروع والبند والمكتب، فيظهر في تقرير المانح وفي الميزانية تلقائياً.' : 'The entry carries project, line and office, so it shows in the donor report and budget automatically.'}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          onClick={() => {
            s.issuePayment(req.id, method, staffId)
            onClose()
          }}
        >
          {method === 'advance' ? (ar ? 'صرف العهدة' : 'Issue advance') : ar ? 'إصدار سند الصرف' : 'Issue payment voucher'}
        </Button>
      </div>
    </Modal>
  )
}
