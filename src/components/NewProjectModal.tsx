import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ControlMode } from '../data/types'
import { usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Button, Field, inputCls, Modal } from './ui'

export interface NewProject {
  code: string
  name: { ar: string; en: string }
  donor: { ar: string; en: string }
  start: string
  end: string
  controlMode: ControlMode
  tolerancePct: number
  pillars: { code: string; name: { ar: string; en: string }; lines: { code: string; name: { ar: string; en: string }; ceilingUSD: number; account: string; detail?: { activityCode?: string; fundCode?: string; state?: string; nature?: string | null; donorAccount?: string | null } }[] }[]
}

const today = () => new Date().toISOString().slice(0, 10)
const yearAhead = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

/** Creates a project: its names and donor, dates, how the ceiling is enforced, then pillars and the lines under them. Ceilings of pillars and of the project are the sums of their lines. */
export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const ar = useLang() === 'ar'
  const s = useStore()
  const expense = useMemo(() => s.accounts.filter((a) => a.type === 'expense' && a.postable), [s.accounts])
  const firstAcc = expense[0]?.code ?? ''
  const newLine = (n: number) => ({ code: String(n), nameAr: '', nameEn: '', ceiling: '', account: firstAcc })
  const [f, setF] = useState({ code: '', nameAr: '', nameEn: '', donorAr: '', donorEn: '', start: today(), end: yearAhead(), controlMode: 'hard' as ControlMode, tolerancePct: 10 })
  const [pillars, setPillars] = useState([{ code: 'A', nameAr: '', nameEn: '', lines: [newLine(1)] }])
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const setPillar = (i: number, patch: Partial<(typeof pillars)[number]>) => setPillars((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setLine = (i: number, j: number, patch: Partial<ReturnType<typeof newLine>>) => setPillars((ps) => ps.map((p, a) => (a === i ? { ...p, lines: p.lines.map((l, b) => (b === j ? { ...l, ...patch } : l)) } : p)))
  const sumOf = (p: (typeof pillars)[number]) => p.lines.reduce((t, l) => t + (Number(l.ceiling) || 0), 0)
  const total = pillars.reduce((t, p) => t + sumOf(p), 0)
  const lineOk = (l: ReturnType<typeof newLine>) => l.code.trim() && l.nameAr.trim() && l.nameEn.trim() && Number(l.ceiling) > 0 && l.account
  const valid =
    f.code.trim() && f.nameAr.trim() && f.nameEn.trim() && f.donorAr.trim() && f.donorEn.trim() && f.start && f.end >= f.start &&
    pillars.every((p) => p.code.trim() && p.nameAr.trim() && p.nameEn.trim() && p.lines.length > 0 && p.lines.every(lineOk))

  const save = async () => {
    setBusy(true)
    const body: NewProject = {
      code: f.code.trim(),
      name: { ar: f.nameAr.trim(), en: f.nameEn.trim() },
      donor: { ar: f.donorAr.trim(), en: f.donorEn.trim() },
      start: f.start,
      end: f.end,
      controlMode: f.controlMode,
      tolerancePct: f.controlMode === 'soft' ? f.tolerancePct : 0,
      pillars: pillars.map((p) => ({ code: p.code.trim(), name: { ar: p.nameAr.trim(), en: p.nameEn.trim() }, lines: p.lines.map((l) => ({ code: l.code.trim(), name: { ar: l.nameAr.trim(), en: l.nameEn.trim() }, ceilingUSD: Number(l.ceiling), account: l.account })) })),
    }
    const ok = await s.addProject(body)
    setBusy(false)
    if (ok !== false) onClose()
  }

  return (
    <Modal open onClose={onClose} title={ar ? 'مشروع جديد' : 'New project'} wide>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={ar ? 'رمز المشروع' : 'Project code'}>
            <input className={inputCls} dir="ltr" value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="PRJ-C" />
          </Field>
          <span />
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
            <input type="date" className={inputCls} value={f.start} onChange={(e) => set('start', e.target.value)} />
          </Field>
          <Field label={ar ? 'تاريخ الانتهاء' : 'End date'}>
            <input type="date" className={inputCls} value={f.end} min={f.start} onChange={(e) => set('end', e.target.value)} />
          </Field>
          <Field label={ar ? 'عند بلوغ السقف' : 'When a ceiling is reached'}>
            <select className={inputCls} value={f.controlMode} onChange={(e) => set('controlMode', e.target.value as ControlMode)}>
              <option value="hard">{ar ? 'منع الصرف' : 'Hard stop'}</option>
              <option value="soft">{ar ? 'سماحية باعتماد إضافي' : 'Tolerance with extra approval'}</option>
            </select>
          </Field>
          {f.controlMode === 'soft' && (
            <Field label={ar ? 'نسبة السماحية ٪' : 'Tolerance %'}>
              <input type="number" min={1} max={50} className={inputCls} value={f.tolerancePct} onChange={(e) => set('tolerancePct', Math.min(50, Math.max(0, Number(e.target.value))))} />
            </Field>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">{ar ? 'المحاور والبنود' : 'Pillars and lines'}</h3>
            <span className="num text-[13.5px] text-muted">
              {ar ? 'سقف المشروع' : 'Project ceiling'}: <b className="text-ink">{usd(total)}</b>
            </span>
          </div>
          <p className="mb-3 text-[12.5px] text-muted">{ar ? 'تحدد سقف كل بند فقط؛ سقف المحور وسقف المشروع مجموع بنودهما. يُربط كل بند بحساب مصروفات ليُرحَّل عليه الصرف.' : 'You set a ceiling on each line only; a pillar’s and the project’s ceilings are the sums of their lines. Each line is tied to an expense account so spending posts to it.'}</p>
          <div className="space-y-4">
            {pillars.map((p, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="mb-2 grid gap-2 md:grid-cols-[80px_1fr_1fr_auto]">
                  <input className={inputCls} dir="ltr" value={p.code} onChange={(e) => setPillar(i, { code: e.target.value })} aria-label={ar ? 'رمز المحور' : 'Pillar code'} />
                  <input className={inputCls} dir="rtl" placeholder={ar ? 'اسم المحور بالعربية' : 'Pillar name (Arabic)'} value={p.nameAr} onChange={(e) => setPillar(i, { nameAr: e.target.value })} />
                  <input className={inputCls} dir="ltr" placeholder={ar ? 'اسم المحور بالإنجليزية' : 'Pillar name (English)'} value={p.nameEn} onChange={(e) => setPillar(i, { nameEn: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <span className="num text-[13.5px] font-semibold">{usd(sumOf(p))}</span>
                    {pillars.length > 1 && (
                      <button className="text-muted hover:text-crescent" aria-label={ar ? 'حذف المحور' : 'Remove pillar'} onClick={() => setPillars((ps) => ps.filter((_, j) => j !== i))}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 ps-3">
                  {p.lines.map((l, j) => (
                    <div key={j} className="grid items-center gap-2 md:grid-cols-[64px_1fr_1fr_110px_1fr_28px]">
                      <input className={inputCls} dir="ltr" value={l.code} onChange={(e) => setLine(i, j, { code: e.target.value })} aria-label={ar ? 'رمز البند' : 'Line code'} />
                      <input className={inputCls} dir="rtl" placeholder={ar ? 'البند بالعربية' : 'Line (Arabic)'} value={l.nameAr} onChange={(e) => setLine(i, j, { nameAr: e.target.value })} />
                      <input className={inputCls} dir="ltr" placeholder={ar ? 'البند بالإنجليزية' : 'Line (English)'} value={l.nameEn} onChange={(e) => setLine(i, j, { nameEn: e.target.value })} />
                      <input type="number" min={0} className={inputCls} placeholder="USD" value={l.ceiling} onChange={(e) => setLine(i, j, { ceiling: e.target.value })} aria-label={ar ? 'سقف البند' : 'Line ceiling'} />
                      <select className={inputCls} value={l.account} onChange={(e) => setLine(i, j, { account: e.target.value })} aria-label={ar ? 'حساب المصروفات' : 'Expense account'}>
                        {expense.map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.code} {a.name[ar ? 'ar' : 'en']}
                          </option>
                        ))}
                      </select>
                      {p.lines.length > 1 ? (
                        <button className="text-muted hover:text-crescent" aria-label={ar ? 'حذف البند' : 'Remove line'} onClick={() => setPillar(i, { lines: p.lines.filter((_, b) => b !== j) })}>
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                  <Button variant="quiet" className="!h-8 text-[13px]" onClick={() => setPillar(i, { lines: [...p.lines, newLine(p.lines.length + 1)] })}>
                    <Plus size={14} /> {ar ? 'بند' : 'Line'}
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="quiet" onClick={() => setPillars((ps) => [...ps, { code: String.fromCharCode(65 + ps.length), nameAr: '', nameEn: '', lines: [newLine(1)] }])}>
              <Plus size={16} /> {ar ? 'محور' : 'Pillar'}
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button disabled={!valid || busy} onClick={save}>
          {ar ? 'إنشاء المشروع' : 'Create project'}
        </Button>
      </div>
    </Modal>
  )
}
