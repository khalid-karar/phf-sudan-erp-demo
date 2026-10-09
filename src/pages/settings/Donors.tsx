import { Plus } from 'lucide-react'
import { useState } from 'react'
import { backend, useDo, useLoad } from '../../api/programme'
import type { Donor } from '../../api/programme'
import { Button, Field, PageHeader, Panel, inputCls } from '../../components/ui'
import { useLang } from '../../lib/i18n'
import { usePerm } from '../../lib/store'

const FIELDS: { key: string; ar: string; en: string; def: string }[] = [
  { key: 'id', ar: 'رمز النشاط', en: 'Activity code', def: 'Activity ID' },
  { key: 'title', ar: 'عنوان النشاط', en: 'Activity title', def: 'Activity Title' },
  { key: 'desc', ar: 'وصف النشاط', en: 'Activity description', def: 'Activity Description' },
  { key: 'item', ar: 'بند الميزانية', en: 'Budget item', def: 'Budget Item' },
  { key: 'state', ar: 'الولاية (اختياري)', en: 'State (optional)', def: 'State' },
  { key: 'nature', ar: 'طبيعة المعاملة', en: 'Nature of transaction', def: 'Nature' },
  { key: 'fund', ar: 'الصندوق', en: 'Fund', def: 'Fund' },
  { key: 'unit', ar: 'وحدة القياس', en: 'Unit of measure', def: 'Unit of Measure' },
  { key: 'qty', ar: 'الكمية', en: 'Quantity', def: 'Unit Quantity' },
  { key: 'dur', ar: 'المدة', en: 'Duration', def: 'Duration' },
  { key: 'cost', ar: 'تكلفة الوحدة', en: 'Unit cost', def: 'Unit Cost' },
]

function ImportProfile({ donorId, canEdit }: { donorId: string; canEdit: boolean }) {
  const ar = useLang() === 'ar'
  const doIt = useDo()
  const prof = useLoad(() => backend.importProfile(donorId), [donorId], {} as Record<string, string[]>)
  const [edit, setEdit] = useState<Record<string, string> | null>(null)
  const cur = (k: string) => edit?.[k] ?? (prof.data[k] ?? []).join(', ')
  const save = async () => {
    const headers: Record<string, string[]> = {}
    for (const f of FIELDS) { const v = cur(f.key).split(',').map((x) => x.trim()).filter(Boolean); if (v.length) headers[f.key] = v }
    if (await doIt(() => backend.saveImportProfile(donorId, headers), { ar: 'حُفظ نموذج الاستيراد', en: 'Import layout saved' })) { setEdit(null); await prof.reload() }
  }
  return (
    <div className="border-t border-line p-5">
      <h3 className="mb-1 text-[14.5px] font-semibold">{ar ? 'نموذج استيراد الميزانية لهذه الجهة' : 'Budget import layout for this entity'}</h3>
      <p className="mb-3 text-[13px] text-muted">{ar ? 'اكتب أسماء الأعمدة كما تظهر في ملف الجهة (أو بدايتها، افصل البدائل بفاصلة). الحقل الفارغ يعني الاسم القياسي في نموذج ICE.' : 'Type the column names as they appear in this entity’s file (or their beginning; separate alternatives with a comma). An empty field means the standard ICE name.'}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key} label={ar ? f.ar : f.en}>
            <input className={inputCls} disabled={!canEdit} placeholder={f.def} value={cur(f.key)} onChange={(e) => setEdit({ ...(edit ?? {}), [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      {canEdit && <div className="mt-3"><Button onClick={() => void save()}>{ar ? 'حفظ' : 'Save'}</Button></div>}
    </div>
  )
}

export function Donors() {
  const ar = useLang() === 'ar'
  const { can } = usePerm()
  const canEdit = can('settings', 'edit')
  const doIt = useDo()
  const donors = useLoad(() => backend.donors(), [], [] as Donor[])
  const [sel, setSel] = useState<string | null>(null)
  const [f, setF] = useState({ code: '', nameAr: '', nameEn: '' })
  const users = useLoad(() => (sel ? backend.donorUsers(sel) : Promise.resolve([])), [sel], [])
  const [u, setU] = useState({ email: '', nameAr: '', nameEn: '' })
  const [pw, setPw] = useState<string | null>(null)
  const addDonor = async () => { if (f.code && f.nameAr && await doIt(() => backend.saveDonor(null, { ...f, nameEn: f.nameEn || f.nameAr, active: true }), { ar: 'أُضيف المانح', en: 'Donor added' })) { setF({ code: '', nameAr: '', nameEn: '' }); await donors.reload() } }
  const addUser = async () => {
    if (!sel || !u.email || !u.nameAr) return
    let temp: string | null | undefined
    if (await doIt(async () => { temp = (await backend.addDonorUser(sel, { ...u, nameEn: u.nameEn || u.nameAr })).temporaryPassword }, { ar: 'أُنشئ حساب المانح', en: 'Donor login created' })) { setPw(temp ?? null); setU({ email: '', nameAr: '', nameEn: '' }); await users.reload() }
  }
  return (
    <div>
      <PageHeader title={ar ? 'الجهات الممولة' : 'Funding entities'} sub={ar ? 'لكل جهة ممولة حسابات للعرض فقط ترى التقارير التي أُفرج عنها لها فقط. ربط المشروع بالجهة من «خطة المشروع».' : 'Each entity gets view-only logins that see only the reports released to it. Link a project to its entity in the project plan.'} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={ar ? 'الجهات' : 'Entities'}>
          {donors.data.map((d) => (
            <button key={d.id} onClick={() => { setSel(d.id); setPw(null) }} className={`flex w-full justify-between border-b border-line px-5 py-3 text-start hover:bg-paper ${sel === d.id ? 'bg-paper' : ''}`}>
              <span className="font-medium">{ar ? d.nameAr : d.nameEn}</span><span className="text-muted" dir="ltr">{d.code}</span>
            </button>
          ))}
          {canEdit && (
            <div className="grid items-end gap-2 p-4 md:grid-cols-[90px_1fr_1fr_auto]">
              <Field label={ar ? 'الرمز' : 'Code'}><input className={inputCls} dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
              <Field label={ar ? 'الاسم' : 'Name'}><input className={inputCls} value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
              <Field label="English"><input className={inputCls} dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
              <Button onClick={() => void addDonor()}><Plus size={16} /></Button>
            </div>
          )}
        </Panel>
        <Panel title={ar ? 'حسابات المانح (عرض فقط)' : 'Donor logins (view only)'}>
          {!sel ? <p className="p-5 text-muted">{ar ? 'اختر جهة.' : 'Pick an entity.'}</p> : (
            <div>
              {users.data.map((x) => (<div key={x.id} className="flex justify-between border-b border-line px-5 py-3"><span>{ar ? x.nameAr : x.nameEn}</span><span className="text-muted" dir="ltr">{x.email}</span></div>))}
              {pw && <p className="m-4 rounded-md bg-amber-soft p-3 text-[14px]">{ar ? 'كلمة المرور المؤقتة (تُعرض مرة واحدة): ' : 'Temporary password (shown once): '}<b dir="ltr">{pw}</b></p>}
              {canEdit && (
                <div className="grid items-end gap-2 p-4 md:grid-cols-[1fr_1fr_auto]">
                  <Field label="Email"><input className={inputCls} dir="ltr" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} /></Field>
                  <Field label={ar ? 'الاسم' : 'Name'}><input className={inputCls} value={u.nameAr} onChange={(e) => setU({ ...u, nameAr: e.target.value })} /></Field>
                  <Button onClick={() => void addUser()}><Plus size={16} /></Button>
                </div>
              )}
            </div>
          )}
        </Panel>
        {sel && <Panel title={ar ? 'نموذج استيراد الميزانية' : 'Budget import layout'} className="xl:col-span-2"><ImportProfile key={sel} donorId={sel} canEdit={canEdit} /></Panel>}
      </div>
    </div>
  )
}
