import { CheckCircle2, Lock, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, Panel } from '../../components/ui'
import { date } from '../../lib/format'
import { closingPeriod } from '../../lib/ledger'
import { useLang } from '../../lib/i18n'
import { getOffices, getUsers, usePerm, useStore, useUser } from '../../lib/store'
import { activityFor } from './Advances'

export function useCloseChecks() {
  const s = useStore()
  const { start, end } = closingPeriod()
  return getOffices().map((o) => {
    const c = s.closes.find((x) => x.officeId === o.id) ?? { officeId: o.id, cashCounted: false, closedAt: undefined }
    const lateAdv = s.advances.filter((a) => a.officeId === o.id && a.status === 'open' && +new Date(a.dueAt) <= +new Date(end))
    const unmatched = s.expenses.filter((e) => e.officeId === o.id && !e.hasTechReport && +new Date(e.date) >= +new Date(start) && +new Date(e.date) <= +new Date(end))
    const pendingSettle = s.advances.filter((a) => a.officeId === o.id && a.status === 'open' && activityFor(a.activityCode)?.report)
    const checks = [
      { ok: lateAdv.length === 0, n: lateAdv.length },
      { ok: unmatched.length === 0, n: unmatched.length },
      { ok: pendingSettle.length === 0, n: pendingSettle.length },
      { ok: c.cashCounted, n: 0 },
    ]
    return { office: o, close: c, checks, ready: checks.every((x) => x.ok) }
  })
}

export function Close() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const { can } = usePerm()
  void user
  const isFM = can('finance', 'manage')
  const rows = useCloseChecks()
  const { start } = closingPeriod()
  const month = new Intl.DateTimeFormat(ar ? 'ar-SD-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(start))
  const closed = rows.filter((r) => r.close.closedAt).length
  const labels = ar
    ? ['العهد المستحقة مسوّاة', 'كل مصروف له تقرير فني', 'لا توجد تسويات معلّقة', 'جرد الصندوق']
    : ['Due advances settled', 'Every expense has a field report', 'No settlements waiting', 'Cash count done']

  return (
    <div>
      <PageHeader
        title={ar ? `الإقفال الشهري — ${month}` : `Monthly close — ${month}`}
        sub={
          ar
            ? 'لا يُقفل مكتب حتى تُسوّى عهده ويُطابق كل مصروف بتقريره الفني. بعد الإقفال لا يمكن الترحيل بتاريخ داخل الشهر.'
            : 'An office can’t close until its advances are settled and every expense is matched to a field report. After closing, nothing can be posted into that month.'
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2.5 max-w-sm flex-1 overflow-hidden rounded-[3px] bg-paper ring-1 ring-line">
          <div className="h-full bg-leaf" style={{ width: `${(closed / rows.length) * 100}%` }} />
        </div>
        <span className="num text-[14px]">
          {closed}/{rows.length} {ar ? 'مكاتب أُقفلت' : 'offices closed'}
        </span>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'المكتب' : 'Office'}</th>
              {labels.map((l) => (
                <th key={l} className="py-2.5 pe-3 text-start font-medium">
                  {l}
                </th>
              ))}
              <th className="px-5 py-2.5 text-end font-medium">{ar ? 'الحالة' : 'Status'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ office, close, checks, ready }) => (
              <tr key={office.id} className={close.closedAt ? 'bg-paper/60' : ''}>
                <td className="px-5 py-3 font-medium">{office.name[lang]}</td>
                {checks.map((c, i) => (
                  <td key={i} className="py-3 pe-3">
                    {i === 3 && !close.closedAt ? (
                      <label className={`inline-flex items-center gap-2 ${isFM ? 'cursor-pointer' : ''}`}>
                        <input type="checkbox" className="size-4 accent-[var(--color-leaf)]" checked={close.cashCounted} disabled={!isFM} onChange={(e) => s.setCashCounted(office.id, e.target.checked)} />
                        <span className={close.cashCounted ? 'text-leaf' : 'text-muted'}>{close.cashCounted ? (ar ? 'تم' : 'Done') : ar ? 'لم يتم' : 'Not yet'}</span>
                      </label>
                    ) : c.ok ? (
                      <CheckCircle2 size={18} className="text-leaf" aria-label="ok" />
                    ) : (
                      <Link to={i === 1 ? '/reconciliation' : '/finance/advances'} className="inline-flex items-center gap-1.5 text-crescent hover:underline">
                        <XCircle size={18} /> <span className="num">{c.n}</span>
                      </Link>
                    )}
                  </td>
                ))}
                <td className="px-5 py-3 text-end whitespace-nowrap">
                  {close.closedAt ? (
                    <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted">
                      <Lock size={15} /> {ar ? 'مُقفل' : 'Closed'} <span className="num">{date(close.closedAt, lang)}</span>
                      <span className="hidden xl:inline">— {getUsers().find((u) => u.id === close.closedBy)?.name[lang]}</span>
                    </span>
                  ) : (
                    <div className="inline-flex flex-col items-end gap-1">
                      <Button
                        className="h-9"
                        variant={ready ? 'primary' : 'quiet'}
                        disabled={!ready || !isFM}
                        title={blockReason(checks.map((c, i) => (c.ok ? null : labels[i])).filter(Boolean) as string[], isFM, ar)}
                        onClick={() => s.closeMonth(office.id)}
                      >
                        <Lock size={15} /> {ar ? 'إقفال الشهر' : 'Close month'}
                      </Button>
                      {!ready && (
                        <span className="text-[12px] text-muted">
                          {ar ? `متبقٍ ${checks.filter((c) => !c.ok).length} من ${checks.length} شروط` : `${checks.filter((c) => !c.ok).length} of ${checks.length} checks left`}
                        </span>
                      )}
                      {ready && !isFM && <span className="text-[12px] text-muted">{ar ? 'الإقفال لمدير الشؤون المالية' : 'Only the finance manager can close'}</span>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

/** Why the button is greyed out — shown on hover and read by screen readers. */
function blockReason(missing: string[], isFM: boolean, ar: boolean) {
  if (missing.length) return ar ? `لم يكتمل: ${missing.join('، ')}` : `Not complete yet: ${missing.join(', ')}`
  if (!isFM) return ar ? 'الإقفال لمدير الشؤون المالية فقط' : 'Only the finance manager can close the month'
  return undefined
}
