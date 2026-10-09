import { useState } from 'react'
import type { ReportDetail, TField } from '../../api/programme'
import { inputCls } from '../../components/ui'
import { useLang } from '../../lib/i18n'

type C = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

/** The content of one report: editable for the preparer, plain text for reviewers and donors. */
export function ReportBody({ r, content, setContent, readOnly }: { r: ReportDetail; content: C; setContent: (c: C) => void; readOnly: boolean }) {
  const ar = useLang() === 'ar'
  const nm = (x: { nameAr: string; nameEn: string }) => (ar ? x.nameAr : x.nameEn)
  const set = (patch: C) => setContent({ ...content, ...patch })
  const area = (k: string, label: string, rows = 4) => (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium">{label}</span>
      {readOnly ? <p className="whitespace-pre-wrap rounded-md bg-paper p-3 text-[14.5px]">{content[k] || '—'}</p> : <textarea rows={rows} className={inputCls + ' h-auto py-2'} value={content[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} />}
    </label>
  )

  if (r.type === 'statistics') {
    const values: Record<string, number | null> = content.values ?? {}
    return (
      <div className="space-y-4">
        <table className="w-full text-[14px]">
          <thead className="text-muted"><tr className="border-b border-line text-start"><th className="py-2 text-start">{ar ? 'المؤشر' : 'Indicator'}</th><th className="text-start">{ar ? 'الهدف' : 'Target'}</th><th className="text-start">{ar ? 'هذه الفترة' : 'This period'}</th><th className="text-start">{ar ? 'التراكمي' : 'Cumulative'}</th></tr></thead>
          <tbody>
            {r.data.indicators.map((i) => (
              <tr key={i.id} className="border-b border-line">
                <td className="py-2"><span dir="ltr" className="me-2 font-medium">{i.code}</span>{nm(i)} <span className="text-muted">({i.unit})</span></td>
                <td>{i.target ?? '—'}</td>
                <td>
                  {i.source === 'manual' && !readOnly ? (
                    <input type="number" className={inputCls + ' w-28'} value={values[i.id] ?? ''} onChange={(e) => set({ values: { ...values, [i.id]: num(e.target.value) } })} />
                  ) : i.source === 'manual' ? (values[i.id] ?? '—') : (i.auto ?? '—')}
                </td>
                <td className="text-muted">{i.source === 'manual' ? '—' : (i.cumulative ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[13px] text-muted">{ar ? 'المؤشرات غير اليدوية تُحسب تلقائياً من سجلات النظام وتُجمَّد عند الإرسال.' : 'Non-manual indicators are counted from system records and frozen at submission.'}</p>
        {area('notes', ar ? 'ملاحظات' : 'Notes', 3)}
      </div>
    )
  }

  if (r.type === 'narrative') {
    const sections: { objectiveId: string; progress: string; challenges: string; nextSteps: string }[] = content.sections ?? []
    const get = (id: string) => sections.find((s) => s.objectiveId === id) ?? { objectiveId: id, progress: '', challenges: '', nextSteps: '' }
    const put = (id: string, patch: Partial<(typeof sections)[number]>) => set({ sections: [...sections.filter((s) => s.objectiveId !== id), { ...get(id), ...patch }] })
    return (
      <div className="space-y-5">
        {area('summary', ar ? 'الملخص' : 'Summary')}
        {r.objectives.filter((o) => !r.sectorId || !o.sectorId || o.sectorId === r.sectorId).map((o) => {
          const s = get(o.id)
          const f = (k: 'progress' | 'challenges' | 'nextSteps', label: string) => (
            <label className="block"><span className="mb-1 block text-[13px] text-muted">{label}</span>
              {readOnly ? <p className="whitespace-pre-wrap rounded-md bg-paper p-2.5 text-[14px]">{s[k] || '—'}</p> : <textarea rows={2} className={inputCls + ' h-auto py-2'} value={s[k]} onChange={(e) => put(o.id, { [k]: e.target.value })} />}
            </label>
          )
          return (
            <div key={o.id} className="space-y-2 rounded-md border border-line p-4">
              <div className="font-semibold"><span dir="ltr" className="me-2">{o.code}</span>{nm(o)}</div>
              {f('progress', ar ? 'التقدم المحرز' : 'Progress')}
              {f('challenges', ar ? 'التحديات' : 'Challenges')}
              {f('nextSteps', ar ? 'الخطوات القادمة' : 'Next steps')}
            </div>
          )
        })}
      </div>
    )
  }

  if (r.type === 'quarterly') {
    const d = r.data
    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label={ar ? 'تقارير ميدانية' : 'Field reports'} v={d.fieldReports.n} />
          <Stat label={ar ? 'مستفيدون' : 'People reached'} v={d.fieldReports.ben} />
          <Stat label={ar ? 'خدمات' : 'Services'} v={d.services.services} />
          <Stat label={ar ? 'خدمات للمرضى' : 'Patients served'} v={d.services.served} />
        </div>
        {d.finance && (
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label={ar ? 'السقف (USD)' : 'Ceiling (USD)'} v={d.finance.ceilingUsd} />
            <Stat label={ar ? 'المصروف' : 'Spent'} v={d.finance.spentUsd} />
            <Stat label={ar ? 'الملتزم به' : 'Committed'} v={d.finance.committedUsd} />
            <Stat label={ar ? 'المتاح' : 'Available'} v={d.finance.availableUsd} />
          </div>
        )}
        {d.monthly && <p className="text-[13.5px] text-muted">{ar ? 'التقارير الإحصائية الشهرية: ' : 'Monthly statistics: '}{d.monthly.map((m) => `${m.period} (${m.status})`).join(' · ') || '—'}</p>}
        {area('summary', ar ? 'الملخص' : 'Summary')}
        {area('challenges', ar ? 'التحديات' : 'Challenges', 3)}
        {area('nextQuarter', ar ? 'خطة الربع القادم' : 'Next quarter', 3)}
      </div>
    )
  }

  // custom: the fields come from the sector template
  const t = r.template
  const values: C = content.values ?? {}
  const put = (k: string, v: unknown) => set({ values: { ...values, [k]: v } })
  return (
    <div className="space-y-4">
      {!t && <p className="text-muted">{ar ? 'لا يوجد نموذج لهذا القطاع بعد. اطلب من مدير التقارير إنشاءه.' : 'No template for this sector yet. Ask the report manager to create one.'}</p>}
      {t?.fields.map((f) => (<FieldInput key={f.key} f={f} v={values[f.key]} set={(v) => put(f.key, v)} readOnly={readOnly} />))}
      {area('notes', ar ? 'ملاحظات' : 'Notes', 3)}
    </div>
  )
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return <div className="rounded-md bg-paper p-3"><div className="text-[12.5px] text-muted">{label}</div><div className="text-[20px] font-bold" dir="ltr">{v}</div></div>
}

function FieldInput({ f, v, set, readOnly }: { f: TField; v: unknown; set: (v: unknown) => void; readOnly: boolean }) {
  const ar = useLang() === 'ar'
  const [, force] = useState(0)
  const label = (f.label[ar ? 'ar' : 'en']) + (f.required ? ' *' : '')
  if (f.type === 'table') {
    const rows = (Array.isArray(v) ? v : []) as Record<string, unknown>[]
    const cols = f.columns ?? []
    return (
      <div>
        <span className="mb-1.5 block text-[13.5px] font-medium">{label}</span>
        <table className="w-full text-[14px]">
          <thead><tr>{cols.map((c) => (<th key={c.key} className="pb-1 text-start text-[13px] font-medium text-muted">{c.label[ar ? 'ar' : 'en']}</th>))}<th /></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className="pe-2 pb-1.5">
                    {readOnly ? String(row[c.key] ?? '—') : <input className={inputCls} type={c.type === 'number' ? 'number' : 'text'} value={String(row[c.key] ?? '')} onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, [c.key]: c.type === 'number' ? num(e.target.value) : e.target.value } : x)))} />}
                  </td>
                ))}
                <td>{!readOnly && <button className="text-muted hover:text-crescent" onClick={() => set(rows.filter((_, j) => j !== i))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && <button className="mt-1 text-[13.5px] text-nile hover:underline" onClick={() => { set([...rows, {}]); force((n) => n + 1) }}>{ar ? '+ صف' : '+ Row'}</button>}
      </div>
    )
  }
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium">{label}</span>
      {readOnly ? (
        <p className="rounded-md bg-paper p-2.5 text-[14.5px]">{v === null || v === undefined || v === '' ? '—' : String(v)}</p>
      ) : f.type === 'longtext' ? (
        <textarea rows={3} className={inputCls + ' h-auto py-2'} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />
      ) : f.type === 'choice' ? (
        <select className={inputCls} value={String(v ?? '')} onChange={(e) => set(e.target.value || null)}>
          <option value="">—</option>
          {f.options?.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
      ) : (
        <input className={inputCls} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={String(v ?? '')} onChange={(e) => set(f.type === 'number' ? num(e.target.value) : e.target.value || null)} />
      )}
    </label>
  )
}
