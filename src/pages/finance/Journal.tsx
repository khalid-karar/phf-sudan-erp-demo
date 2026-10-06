import { useMemo, useState } from 'react'
import { PageHeader, Panel } from '../../components/ui'
import type { JournalEntry, JournalSource } from '../../data/types'
import { date, usd } from '../../lib/format'
import { entryTotals } from '../../lib/ledger'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'
import { JournalEntryModal, sourceName, useAccountName } from './common'

export function Journal() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const accName = useAccountName()
  const [source, setSource] = useState<JournalSource | ''>('')
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [limit, setLimit] = useState(40)
  const list = useMemo(
    () => [...s.journal].filter((e) => !source || e.source === source).sort((a, b) => +new Date(b.date) - +new Date(a.date) || b.no.localeCompare(a.no)),
    [s.journal, source],
  )
  return (
    <div>
      <PageHeader
        title={ar ? 'قيود اليومية' : 'Journal entries'}
        sub={ar ? 'لا يُدخل المحاسب القيود يدوياً: كل سند صرف أو قبض أو عهدة أو تسوية يُرحّل قيده تلقائياً.' : 'Accountants don’t key entries by hand: every voucher, advance and settlement posts its own entry.'}
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['', 'payment', 'receipt', 'advance', 'settlement', 'transfer', 'fx', 'opening'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSource(k)}
            className={`h-9 rounded-md px-3 text-[13.5px] ${source === k ? 'bg-nile text-white' : 'border border-line bg-surface text-muted hover:text-ink'}`}
          >
            {k ? sourceName[k][lang] : ar ? 'الكل' : 'All'}
          </button>
        ))}
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'القيد' : 'Entry'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'التاريخ' : 'Date'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'المصدر' : 'Source'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'البيان والحسابات' : 'Memo & accounts'}</th>
              <th className="px-5 py-2.5 text-end font-medium">{ar ? 'المبلغ' : 'Amount'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.slice(0, limit).map((e) => {
              const t = entryTotals(e)
              const dr = e.lines.filter((l) => l.debit).map((l) => l.account)
              const cr = e.lines.filter((l) => l.credit).map((l) => l.account)
              return (
                <tr key={e.id} className="cursor-pointer hover:bg-paper" onClick={() => setEntry(e)}>
                  <td className="num px-5 py-2.5 font-medium text-nile">{e.no}</td>
                  <td className="num py-2.5 pe-3 whitespace-nowrap text-muted">{date(e.date, lang)}</td>
                  <td className="py-2.5 pe-3 whitespace-nowrap">
                    {sourceName[e.source][lang]} {e.ref && <span className="num text-[12.5px] text-muted">{e.ref}</span>}
                  </td>
                  <td className="py-2.5 pe-3">
                    <div className="max-w-[420px] truncate">{e.memo[lang]}</div>
                    <div className="max-w-[420px] truncate text-[12.5px] text-muted">
                      {ar ? 'من' : 'Dr'} {dr.map((c) => `${c} ${accName(c)}`).join(ar ? '، ' : ', ')} — {ar ? 'إلى' : 'Cr'} {cr.map((c) => `${c} ${accName(c)}`).join(ar ? '، ' : ', ')}
                    </div>
                  </td>
                  <td className="num px-5 py-2.5 text-end font-medium">{usd(t.debit)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length > limit && (
          <button className="w-full border-t border-line py-3 text-[14px] text-nile hover:bg-paper" onClick={() => setLimit((l) => l + 60)}>
            {ar ? `عرض المزيد (${list.length - limit})` : `Show more (${list.length - limit})`}
          </button>
        )}
      </Panel>
      <JournalEntryModal entry={entry} onClose={() => setEntry(null)} />
    </div>
  )
}
