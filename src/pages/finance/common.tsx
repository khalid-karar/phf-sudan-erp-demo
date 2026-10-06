import { CheckCircle2 } from 'lucide-react'
import { Modal } from '../../components/ui'
import type { JournalEntry, JournalSource, PayMethod } from '../../data/types'
import { findLine } from '../../lib/budget'
import { date, usd } from '../../lib/format'
import { entryTotals } from '../../lib/ledger'
import { useLang } from '../../lib/i18n'
import { getOffices, useStore } from '../../lib/store'

export const sourceName: Record<JournalSource, { ar: string; en: string }> = {
  opening: { ar: 'افتتاحي', en: 'Opening' },
  payment: { ar: 'سند صرف', en: 'Payment' },
  receipt: { ar: 'سند قبض', en: 'Receipt' },
  advance: { ar: 'صرف عهدة', en: 'Advance' },
  settlement: { ar: 'تسوية عهدة', en: 'Settlement' },
  fx: { ar: 'فروق عملة', en: 'FX' },
  transfer: { ar: 'تحويل', en: 'Transfer' },
}

export const methodName: Record<PayMethod | 'transfer', { ar: string; en: string }> = {
  cash: { ar: 'نقداً', en: 'Cash' },
  bank: { ar: 'بنكي', en: 'Bank' },
  bankak: { ar: 'بنكك', en: 'Bankak' },
  advance: { ar: 'عهدة', en: 'Advance' },
  transfer: { ar: 'تحويل وارد', en: 'Incoming transfer' },
}

export function useAccountName() {
  const accounts = useStore((s) => s.accounts)
  const lang = useLang()
  return (code: string) => accounts.find((a) => a.code === code)?.name[lang] ?? code
}

export function JournalEntryModal({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const accName = useAccountName()
  if (!entry) return null
  const t = entryTotals(entry)
  const dims = (l: JournalEntry['lines'][number]) => {
    const parts: string[] = []
    if (l.projectId) parts.push(s.projects.find((p) => p.id === l.projectId)!.code)
    if (l.lineId) parts.push(`${ar ? 'بند' : 'line'} ${findLine(s.projects, l.lineId)?.line.code}`)
    if (l.officeId) parts.push(getOffices().find((o) => o.id === l.officeId)!.name[lang])
    return parts.join(ar ? '، ' : ', ')
  }
  return (
    <Modal open onClose={onClose} title={`${ar ? 'قيد يومية' : 'Journal entry'} ${entry.no}`} wide>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
        <span>
          <span className="text-muted">{ar ? 'التاريخ:' : 'Date:'}</span> <span className="num">{date(entry.date, lang)}</span>
        </span>
        <span>
          <span className="text-muted">{ar ? 'المصدر:' : 'Source:'}</span> {sourceName[entry.source][lang]} {entry.ref && <span className="num">{entry.ref}</span>}
        </span>
        <span>
          <span className="text-muted">{ar ? 'البيان:' : 'Memo:'}</span> {entry.memo[lang]}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="py-2 pe-3 text-start font-medium">{ar ? 'الحساب' : 'Account'}</th>
              <th className="py-2 pe-3 text-start font-medium">{ar ? 'الأبعاد' : 'Dimensions'}</th>
              <th className="py-2 pe-3 text-end font-medium">{ar ? 'مدين' : 'Debit'}</th>
              <th className="py-2 text-end font-medium">{ar ? 'دائن' : 'Credit'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entry.lines.map((l, i) => (
              <tr key={i}>
                <td className={`py-2 pe-3 ${l.credit ? 'ps-6' : ''}`}>
                  <span className="num me-2 text-muted">{l.account}</span>
                  {accName(l.account)}
                  {l.sdg ? (
                    <span className="num block text-[11.5px] text-muted">
                      {new Intl.NumberFormat('en-US').format(Math.abs(l.sdg))} {ar ? 'ج.س' : 'SDG'}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pe-3 text-[13px] text-muted">{dims(l)}</td>
                <td className="num py-2 pe-3 text-end">{l.debit ? usd(l.debit) : ''}</td>
                <td className="num py-2 text-end">{l.credit ? usd(l.credit) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/70 font-semibold">
              <td className="py-2 pe-3" colSpan={2}>
                <span className={`inline-flex items-center gap-1.5 text-[13px] ${t.balanced ? 'text-leaf' : 'text-crescent'}`}>
                  <CheckCircle2 size={15} /> {t.balanced ? (ar ? 'القيد متوازن' : 'Entry balances') : ar ? 'القيد غير متوازن' : 'Entry does not balance'}
                </span>
              </td>
              <td className="num py-2 pe-3 text-end">{usd(t.debit)}</td>
              <td className="num py-2 text-end">{usd(t.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {items.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[14px] font-medium ${value === k ? 'border-nile text-nile' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
