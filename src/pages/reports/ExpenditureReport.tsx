import { Download, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/http'
import { LIVE } from '../../api/http'
import { errorText } from '../../api/live'
import { Button, Field, inputCls, PageHeader } from '../../components/ui'
import { demoExpenditure, downloadExpenditureXlsx } from '../../lib/reports/donor'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'

interface Row {
  state: string; date: string; voucher: string; method: string; activityId: string; fundCode: string; activityTitle: string; input: string; category: string; account: string
  authorizedUsd: string; actualUsd: string; authorizedSdg: string; actualSdg: string; comment: string
}
interface Report {
  project: { code: string; ipCode: string; name: string; donor: string }
  ipName: string
  rows: Row[]
  totals: { authorizedUsd: string; actualUsd: string; authorizedSdg: string; actualSdg: string }
  signatures: { preparedBy: string; preparedTitle: string; approvedBy: string; approvedTitle: string }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** The calendar quarter that has just finished (or the current one, if it is already past its first month). */
function lastQuarter() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const start = new Date(now.getFullYear(), (q - 1) * 3, 1)
  return { from: iso(start), to: iso(new Date(start.getFullYear(), start.getMonth() + 3, 0)) }
}
const n2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The donor's quarterly Detailed Expenditure Report, built from the books. Preview here, download as Excel in the donor's layout. */
export function ExpenditureReport() {
  const ar = useLang() === 'ar'
  const store = useStore()
  const projects = store.projects
  const [pid, setPid] = useState(projects[0]?.id ?? '')
  const [{ from, to }, setRange] = useState(lastQuarter)
  const [cur, setCur] = useState<'SDG' | 'USD'>('SDG')
  const [sig, setSig] = useState({ preparedBy: '', preparedTitle: '', approvedBy: '', approvedTitle: '' })
  const [data, setData] = useState<Report | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const query = useMemo(() => {
    const q = new URLSearchParams({ projectId: pid, from, to, currency: cur })
    for (const [k, v] of Object.entries(sig)) if (v.trim()) q.set(k, v.trim())
    return q.toString()
  }, [pid, from, to, cur, sig])

  useEffect(() => {
    if (!pid || !from || !to || to < from) return
    if (!LIVE) {
      setData(demoExpenditure(store, pid, from, to, sig))
      return
    }
    let live = true
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await api.get<Report>(`/reports/expenditure?${query}`)
        if (live) {
          setData(r)
          setErr('')
        }
      } catch (e) {
        if (live) {
          const m = errorText(e)
          setErr(ar ? m.ar : m.en)
        }
      }
      if (live) setBusy(false)
    }, 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query, pid, from, to, ar]) // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setBusy(true)
    if (!LIVE) {
      if (data) await downloadExpenditureXlsx(data, from, to, cur)
      setBusy(false)
      return
    }
    try {
      const b = await api.blob(`/reports/expenditure.xlsx?${query}`)
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = `PHF-Expenditure-Report-${data?.project.ipCode ?? pid}-${from}_${to}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) {
      const m = errorText(e)
      setErr(ar ? m.ar : m.en)
    }
    setBusy(false)
  }

  const sdg = cur === 'SDG'
  const A = (r: Row) => Number(sdg ? r.authorizedSdg : r.authorizedUsd)
  const C = (r: Row) => Number(sdg ? r.actualSdg : r.actualUsd)
  const ta = data ? Number(sdg ? data.totals.authorizedSdg : data.totals.authorizedUsd) : 0
  const tc = data ? Number(sdg ? data.totals.actualSdg : data.totals.actualUsd) : 0

  return (
    <div>
      <PageHeader
        title={ar ? 'تقرير المصروفات التفصيلي (ربع سنوي)' : 'Detailed expenditure report (quarterly)'}
        sub={ar ? 'نفس نموذج المانح: كل معاملة صرف بنشاطها ورمز التمويل وفئة المصروف والحساب، المصرَّح به مقابل الفعلي. تُملأ من دفاتر النظام وتُنزَّل Excel.' : 'The donor’s own layout: every spending transaction with its activity, fund code, expense category and account, authorized against actual. Filled from the books and downloadable as Excel.'}
        actions={
          (
            <Button onClick={download} disabled={busy || !data}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {ar ? 'تنزيل Excel' : 'Download Excel'}
            </Button>
          )
        }
      />
      {(
        <>
          <div className="mb-5 grid gap-3 md:grid-cols-5">
            <Field label={ar ? 'المشروع' : 'Project'}>
              <select className={inputCls} value={pid} onChange={(e) => setPid(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'من' : 'From'}>
              <input type="date" className={inputCls} value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </Field>
            <Field label={ar ? 'إلى' : 'To'}>
              <input type="date" className={inputCls} value={to} min={from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </Field>
            <Field label={ar ? 'العملة' : 'Currency'}>
              <select className={inputCls} value={cur} onChange={(e) => setCur(e.target.value as 'SDG' | 'USD')}>
                <option value="SDG">SDG</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label={ar ? 'الربع' : 'Quarter'}>
              <select
                className={inputCls}
                value=""
                onChange={(e) => {
                  const [y, q] = e.target.value.split('-').map(Number)
                  if (!y) return
                  setRange({ from: iso(new Date(y, (q - 1) * 3, 1)), to: iso(new Date(y, q * 3, 0)) })
                }}
              >
                <option value="">{ar ? 'اختر…' : 'Pick…'}</option>
                {[0, 1, 2, 3, 4].map((i) => {
                  const d = new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3 - i * 3, 1)
                  const q = Math.floor(d.getMonth() / 3) + 1
                  return (
                    <option key={i} value={`${d.getFullYear()}-${q}`}>
                      Q{q} {d.getFullYear()}
                    </option>
                  )
                })}
              </select>
            </Field>
          </div>
          <div className="mb-5 grid gap-3 md:grid-cols-4">
            <Field label={ar ? 'أعدّه' : 'Prepared by'}>
              <input className={inputCls} value={sig.preparedBy} placeholder={data?.signatures.preparedBy} onChange={(e) => setSig({ ...sig, preparedBy: e.target.value })} />
            </Field>
            <Field label={ar ? 'صفته' : 'Title'}>
              <input className={inputCls} value={sig.preparedTitle} placeholder={data?.signatures.preparedTitle} onChange={(e) => setSig({ ...sig, preparedTitle: e.target.value })} />
            </Field>
            <Field label={ar ? 'اعتمده' : 'Approved by'}>
              <input className={inputCls} value={sig.approvedBy} onChange={(e) => setSig({ ...sig, approvedBy: e.target.value })} />
            </Field>
            <Field label={ar ? 'صفته' : 'Title'}>
              <input className={inputCls} value={sig.approvedTitle} placeholder={data?.signatures.approvedTitle} onChange={(e) => setSig({ ...sig, approvedTitle: e.target.value })} />
            </Field>
          </div>
          {err && <div className="mb-4 rounded-md border border-crescent/40 bg-crescent-soft p-3 text-[13.5px] text-crescent">{err}</div>}
          {data && (
            <div className="overflow-auto rounded-lg border border-line bg-surface" dir="ltr">
              <div className="border-b border-line p-4 text-[13.5px]">
                <b>IP Code:</b> {data.project.ipCode} &nbsp; <b>IP Name:</b> {data.ipName} &nbsp; <b>Period:</b> {from} → {to} &nbsp; <b>Currency:</b> {cur}
              </div>
              <table className="w-full min-w-[1200px] text-[12.5px]">
                <thead className="bg-sand text-start">
                  <tr>
                    {['State', 'Date', 'Voucher #', 'Method', 'Activity ID', 'Fund', 'Activity title', 'Input description', 'Expense category', 'Account', 'Authorized', 'Actual', 'Balance', 'Comment'].map((h) => (
                      <th key={h} className="px-2 py-2 text-start font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="px-2 py-1.5">{r.state}</td>
                      <td className="num px-2 py-1.5">{r.date}</td>
                      <td className="num px-2 py-1.5">{r.voucher}</td>
                      <td className="px-2 py-1.5">{r.method}</td>
                      <td className="px-2 py-1.5">{r.activityId}</td>
                      <td className="px-2 py-1.5">{r.fundCode}</td>
                      <td className="max-w-[220px] px-2 py-1.5">{r.activityTitle}</td>
                      <td className="max-w-[220px] px-2 py-1.5">{r.input}</td>
                      <td className="max-w-[200px] px-2 py-1.5">{r.category}</td>
                      <td className="num px-2 py-1.5">{r.account}</td>
                      <td className="num px-2 py-1.5 text-end">{n2.format(A(r))}</td>
                      <td className="num px-2 py-1.5 text-end">{n2.format(C(r))}</td>
                      <td className="num px-2 py-1.5 text-end">{n2.format(A(r) - C(r))}</td>
                      <td className="px-2 py-1.5">{r.comment}</td>
                    </tr>
                  ))}
                  {!data.rows.length && (
                    <tr>
                      <td colSpan={14} className="px-3 py-6 text-center text-muted" dir={ar ? 'rtl' : 'ltr'}>
                        {ar ? 'لا توجد معاملات صرف على هذا المشروع في الفترة.' : 'No spending on this project in the period.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="border-t-2 border-line bg-sand font-semibold">
                  <tr>
                    <td className="px-2 py-2" colSpan={10}>
                      Total
                    </td>
                    <td className="num px-2 py-2 text-end">{n2.format(ta)}</td>
                    <td className="num px-2 py-2 text-end">{n2.format(tc)}</td>
                    <td className="num px-2 py-2 text-end">{n2.format(ta - tc)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
