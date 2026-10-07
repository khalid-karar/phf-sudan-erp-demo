import { FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/http'
import { errorText, refreshData } from '../api/live'
import { useLang } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Button, Field, inputCls, Modal } from './ui'

interface Preview {
  sheet: string
  ipCode: string | null
  rate: number | null
  startDate: string | null
  endDate: string | null
  lineCount: number
  totalUsd: string
  totalSdg: string | null
  activities: { code: string; title: string; lines: number; usd: string; sdg: string | null }[]
  states: { key: string; usd: string; sdg: string | null }[]
  noNature: number
  warnings: { row: number; en: string; ar: string }[]
}

const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36)

/** Live mode: upload the donor's budget workbook; the project, its activities and budget lines are built from it. */
export function ImportBudgetModal({ onClose }: { onClose: () => void }) {
  const ar = useLang() === 'ar'
  const nav = useNavigate()
  const toast = useStore((s) => s.toast)
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [pv, setPv] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ id: '', code: '', nameAr: '', nameEn: '', donorAr: '', donorEn: '', startDate: '', endDate: '', rate: '', controlMode: 'hard', tolerancePct: '10' })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const pick = async (fl: File | null) => {
    setFile(fl)
    setPv(null)
    setErr('')
    if (!fl) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', fl)
      const p = await api.upload<Preview>('/projects/import/preview', fd)
      setPv(p)
      setF((x) => ({ ...x, id: x.id || slug(p.ipCode ?? fl.name.replace(/\.xlsx$/i, '')), code: p.ipCode ?? x.code, startDate: p.startDate ?? x.startDate, endDate: p.endDate ?? x.endDate, rate: p.rate ? String(p.rate) : x.rate }))
    } catch (e) {
      const t = errorText(e)
      setErr(ar ? t.ar : t.en)
    }
    setBusy(false)
  }

  const valid = pv && /^[a-z0-9-]{2,40}$/.test(f.id) && f.code.trim() && f.nameAr.trim() && f.nameEn.trim() && f.donorAr.trim() && f.donorEn.trim() && f.startDate && f.endDate >= f.startDate
  const go = async () => {
    if (!file || !valid) return
    setBusy(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      for (const [k, v] of Object.entries(f)) if (v !== '' && !(k === 'tolerancePct' && f.controlMode !== 'soft')) fd.append(k, v)
      const r = await api.upload<{ id: string; lines: number; activities: number }>('/projects/import', fd)
      await refreshData()
      toast({ ar: `أُنشئ المشروع من الملف: ${r.activities} نشاطاً و${r.lines} بنداً`, en: `Project created from the file: ${r.activities} activities, ${r.lines} lines` }, 'ok')
      onClose()
      nav(`/projects/${r.id}`)
    } catch (e) {
      const t = errorText(e)
      setErr(ar ? t.ar : t.en)
      if (e instanceof ApiError && e.status === 0) toast(t, 'warn')
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={ar ? 'استيراد ميزانية من ملف المانح' : 'Import a budget from the donor file'} wide>
      <div className="space-y-5">
        <p className="text-[13.5px] text-muted">
          {ar ? 'ارفع ملف الميزانية (Excel) الذي أرسله المانح. يُنشأ المشروع ومحاوره (الأنشطة) وبنوده وسقوفها تلقائياً بدل الإدخال اليدوي، ويُحفظ الملف الأصلي مع المشروع.' : 'Upload the budget workbook (Excel) from the donor. The project, its activities and budget lines with their ceilings are created automatically instead of typing them, and the original file is kept with the project.'}
        </p>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-line p-4 text-start hover:border-nile-2">
          {file ? <FileSpreadsheet className="text-leaf" /> : <Upload className="text-muted" />}
          <span className="text-[14.5px]">{file ? file.name : ar ? 'اختر ملف الميزانية (.xlsx)' : 'Choose the budget file (.xlsx)'}</span>
        </button>
        {err && <div className="rounded-md border border-crescent/40 bg-crescent-soft p-3 text-[13.5px] text-crescent">{err}</div>}

        {pv && (
          <>
            <div className="grid gap-3 rounded-lg border border-line p-4 md:grid-cols-4">
              <Stat l={ar ? 'رمز الشريك' : 'IP code'} v={pv.ipCode ?? '—'} />
              <Stat l={ar ? 'سعر الصرف' : 'Exchange rate'} v={pv.rate ? n0.format(pv.rate) : '—'} />
              <Stat l={ar ? 'البنود' : 'Lines'} v={`${pv.lineCount} / ${pv.activities.length} ${ar ? 'نشاط' : 'activities'}`} />
              <Stat l={ar ? 'الإجمالي' : 'Total'} v={`$${n0.format(Number(pv.totalUsd))}${pv.totalSdg ? ` · ${n0.format(Number(pv.totalSdg))} ${ar ? 'ج.س' : 'SDG'}` : ''}`} />
            </div>
            <div className="max-h-44 overflow-auto rounded-lg border border-line">
              <table className="w-full text-[13px]">
                <tbody>
                  {pv.activities.map((a) => (
                    <tr key={a.code} className="border-b border-line last:border-0">
                      <td className="num px-3 py-1.5 font-medium" dir="ltr">{a.code}</td>
                      <td className="px-3 py-1.5 text-muted">{a.title.slice(0, 70)}</td>
                      <td className="num px-3 py-1.5 text-end">{a.lines}</td>
                      <td className="num px-3 py-1.5 text-end">${n0.format(Number(a.usd))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              {pv.states.map((s) => (
                <span key={s.key} className="rounded-full bg-sand px-2.5 py-1">
                  {s.key}: <b className="num">${n0.format(Number(s.usd))}</b>
                </span>
              ))}
            </div>
            {pv.warnings.length > 0 && (
              <div className="rounded-md border border-line bg-sand p-3 text-[12.5px]">
                <b>{ar ? `${pv.warnings.length} سطر تم تجاهله:` : `${pv.warnings.length} row(s) skipped:`}</b>
                <ul className="mt-1 list-disc ps-5">
                  {pv.warnings.slice(0, 6).map((w) => (
                    <li key={w.row}>
                      {ar ? 'سطر' : 'Row'} {w.row}: {ar ? w.ar : w.en}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pv.noNature > 0 && <p className="text-[12.5px] text-muted">{ar ? `${pv.noNature} بنداً لم يُعرف نوع معاملته للمانح؛ يمكن تحديده لاحقاً من صفحة المشروع.` : `${pv.noNature} lines have no donor transaction type yet; set it later from the project page.`}</p>}

            <div className="grid gap-3 md:grid-cols-2">
              <Field label={ar ? 'رمز المشروع' : 'Project code'}>
                <input className={inputCls} dir="ltr" value={f.code} onChange={(e) => set('code', e.target.value)} />
              </Field>
              <Field label={ar ? 'المعرّف (حروف إنجليزية صغيرة وأرقام)' : 'ID (lowercase letters, digits, dashes)'}>
                <input className={inputCls} dir="ltr" value={f.id} onChange={(e) => set('id', e.target.value)} />
              </Field>
              <Field label={ar ? 'الاسم بالعربية' : 'Name (Arabic)'}>
                <input className={inputCls} dir="rtl" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
              </Field>
              <Field label={ar ? 'الاسم بالإنجليزية' : 'Name (English)'}>
                <input className={inputCls} dir="ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
              </Field>
              <Field label={ar ? 'الجهة المانحة بالعربية' : 'Donor (Arabic)'}>
                <input className={inputCls} dir="rtl" value={f.donorAr} onChange={(e) => set('donorAr', e.target.value)} />
              </Field>
              <Field label={ar ? 'الجهة المانحة بالإنجليزية' : 'Donor (English)'}>
                <input className={inputCls} dir="ltr" value={f.donorEn} onChange={(e) => set('donorEn', e.target.value)} />
              </Field>
              <Field label={ar ? 'تاريخ البدء' : 'Start date'}>
                <input type="date" className={inputCls} value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
              </Field>
              <Field label={ar ? 'تاريخ الانتهاء' : 'End date'}>
                <input type="date" className={inputCls} value={f.endDate} min={f.startDate} onChange={(e) => set('endDate', e.target.value)} />
              </Field>
              <Field label={ar ? 'عند بلوغ السقف' : 'When a ceiling is reached'}>
                <select className={inputCls} value={f.controlMode} onChange={(e) => set('controlMode', e.target.value)}>
                  <option value="hard">{ar ? 'منع الصرف' : 'Hard stop'}</option>
                  <option value="soft">{ar ? 'سماحية باعتماد إضافي' : 'Tolerance with extra approval'}</option>
                </select>
              </Field>
              {f.controlMode === 'soft' && (
                <Field label={ar ? 'نسبة السماحية ٪' : 'Tolerance %'}>
                  <input type="number" min={1} max={50} className={inputCls} value={f.tolerancePct} onChange={(e) => set('tolerancePct', e.target.value)} />
                </Field>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button disabled={!valid || busy} onClick={go}>
            {busy ? (ar ? 'جارٍ…' : 'Working…') : ar ? 'إنشاء المشروع من الملف' : 'Create project from file'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const Stat = ({ l, v }: { l: string; v: string }) => (
  <div>
    <div className="text-[12px] text-muted">{l}</div>
    <div className="num text-[14.5px] font-semibold">{v}</div>
  </div>
)
