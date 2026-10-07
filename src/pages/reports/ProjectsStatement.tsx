import { Download, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, LIVE } from '../../api/http'
import { errorText } from '../../api/live'
import { Button, Field, inputCls, PageHeader, Panel } from '../../components/ui'
import { useLang } from '../../lib/i18n'

interface Row {
  id: string; code: string; name: string; donor: string; start: string; end: string; rate: string | null; status: 'active' | 'ended'
  budgetUsd: string; budgetSdg: string; receivedUsd: string; receivedSdg: string; spentUsd: string; spentSdg: string; availableUsd: string; availableSdg: string
}
type Tot = Pick<Row, 'budgetUsd' | 'budgetSdg' | 'receivedUsd' | 'receivedSdg' | 'spentUsd' | 'spentSdg' | 'availableUsd' | 'availableSdg'>
interface Statement {
  asOf: string
  rows: Row[]
  donors: (Tot & { donor: string; projects: number })[]
  total: Tot
}
const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const f = (v: string) => n0.format(Number(v))

/** Account-statement style summary of every project in USD and SDG, with totals by donor. */
export function ProjectsStatement() {
  const ar = useLang() === 'ar'
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10))
  const [d, setD] = useState<Statement | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!LIVE) return
    let live = true
    setBusy(true)
    api
      .get<Statement>(`/reports/projects-statement?asOf=${asOf}`)
      .then((r) => live && (setD(r), setErr('')))
      .catch((e) => live && setErr((ar ? errorText(e).ar : errorText(e).en)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [asOf, ar])

  const download = async () => {
    setBusy(true)
    try {
      const b = await api.blob(`/reports/projects-statement.xlsx?asOf=${asOf}`)
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = `PHF-Projects-Statement-${asOf}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) {
      setErr(ar ? errorText(e).ar : errorText(e).en)
    }
    setBusy(false)
  }

  const th = 'px-2 py-2 text-end font-semibold'
  return (
    <div>
      <PageHeader
        title={ar ? 'كشف حساب المشاريع' : 'Projects statement'}
        sub={ar ? 'كل المشاريع بالميزانية والمستلم والمصروف والمتبقي، بالدولار وبالجنيه السوداني، مع إجمالي كل مانح.' : 'Every project with budget, received, spent and remaining, in USD and SDG, with totals by donor.'}
        actions={
          LIVE && (
            <Button onClick={download} disabled={busy || !d}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {ar ? 'تنزيل Excel' : 'Download Excel'}
            </Button>
          )
        }
      />
      {!LIVE ? (
        <Panel>
          <p className="text-muted">{ar ? 'هذا الكشف متاح عند ربط النظام بالخادم (الوضع الحي).' : 'This statement is available when the system is connected to the server (live mode).'}</p>
        </Panel>
      ) : (
        <>
          <div className="mb-5 max-w-[220px]">
            <Field label={ar ? 'حتى تاريخ' : 'As of'}>
              <input type="date" className={inputCls} value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
            </Field>
          </div>
          {err && <div className="mb-4 rounded-md border border-crescent/40 bg-crescent-soft p-3 text-[13.5px] text-crescent">{err}</div>}
          {d && (
            <>
              <div className="overflow-auto rounded-lg border border-line bg-surface" dir="ltr">
                <table className="w-full min-w-[1100px] text-[12.5px]">
                  <thead className="bg-sand">
                    <tr>
                      <th className="px-2 py-2 text-start font-semibold">Project</th>
                      <th className="px-2 py-2 text-start font-semibold">Donor</th>
                      <th className={th}>Rate</th>
                      <th className={th}>Budget USD</th>
                      <th className={th}>Budget SDG</th>
                      <th className={th}>Received USD</th>
                      <th className={th}>Received SDG</th>
                      <th className={th}>Spent USD</th>
                      <th className={th}>Spent SDG</th>
                      <th className={th}>Available USD</th>
                      <th className={th}>Available SDG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="px-2 py-1.5">
                          <b>{r.code}</b> {r.name}
                          <div className="text-[11.5px] text-muted">
                            {r.start} → {r.end} · {r.status}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">{r.donor}</td>
                        <td className="num px-2 py-1.5 text-end">{r.rate ? n0.format(Number(r.rate)) : '—'}</td>
                        {([r.budgetUsd, r.budgetSdg, r.receivedUsd, r.receivedSdg, r.spentUsd, r.spentSdg, r.availableUsd, r.availableSdg] as string[]).map((v, i) => (
                          <td key={i} className="num px-2 py-1.5 text-end">
                            {f(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-sand font-semibold">
                    <tr>
                      <td className="px-2 py-2" colSpan={3}>
                        Total
                      </td>
                      {([d.total.budgetUsd, d.total.budgetSdg, d.total.receivedUsd, d.total.receivedSdg, d.total.spentUsd, d.total.spentSdg, d.total.availableUsd, d.total.availableSdg] as string[]).map((v, i) => (
                        <td key={i} className="num px-2 py-2 text-end">
                          {f(v)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <h2 className="mb-2 mt-6 text-[17px] font-semibold">{ar ? 'حسب المانح' : 'By donor'}</h2>
              <div className="overflow-auto rounded-lg border border-line bg-surface" dir="ltr">
                <table className="w-full min-w-[800px] text-[12.5px]">
                  <thead className="bg-sand">
                    <tr>
                      <th className="px-2 py-2 text-start font-semibold">Donor</th>
                      <th className={th}>Projects</th>
                      <th className={th}>Budget USD</th>
                      <th className={th}>Budget SDG</th>
                      <th className={th}>Spent USD</th>
                      <th className={th}>Spent SDG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.donors.map((x) => (
                      <tr key={x.donor} className="border-t border-line">
                        <td className="px-2 py-1.5">{x.donor}</td>
                        <td className="num px-2 py-1.5 text-end">{x.projects}</td>
                        {([x.budgetUsd, x.budgetSdg, x.spentUsd, x.spentSdg] as string[]).map((v, i) => (
                          <td key={i} className="num px-2 py-1.5 text-end">
                            {f(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
