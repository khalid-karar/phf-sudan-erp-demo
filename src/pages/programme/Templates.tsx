import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { backend, useDo, useLoad } from '../../api/programme'
import type { TField, Template } from '../../api/programme'
import { Button, Field, Modal, PageHeader, Panel, inputCls } from '../../components/ui'
import { useLang } from '../../lib/i18n'

const TYPES: TField['type'][] = ['text', 'longtext', 'number', 'date', 'choice', 'table']

export function TemplatesPage() {
  const ar = useLang() === 'ar'
  const doIt = useDo()
  const sectors = useLoad(() => backend.sectors(), [], [])
  const list = useLoad(() => backend.templates(), [], [] as Template[])
  const [edit, setEdit] = useState<(Omit<Template, 'id'> & { id: string | null }) | null>(null)
  const blank = { id: null, nameAr: '', nameEn: '', sectorId: sectors.data[0]?.id ?? null, fields: [] as TField[], active: true }
  const upd = (i: number, p: Partial<TField>) => setEdit((e) => e && { ...e, fields: e.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) })
  const save = async () => {
    if (!edit) return
    const { id, ...t } = edit
    if (await doIt(() => backend.saveTemplate(id, { ...t, nameEn: t.nameEn || t.nameAr }), { ar: 'حُفظ النموذج', en: 'Template saved' })) { setEdit(null); await list.reload() }
  }
  return (
    <div>
      <PageHeader title={ar ? 'نماذج التقارير المخصصة' : 'Custom report templates'} sub={ar ? 'نموذج لكل قطاع (تغذية، صحة…) يملؤه مكتب المشروع كل شهر.' : 'One template per sector (nutrition, health…) that the project office fills in each month.'} actions={<Button onClick={() => setEdit(blank)}><Plus size={16} />{ar ? 'نموذج جديد' : 'New template'}</Button>} />
      <Panel>
        {list.data.map((t) => (
          <button key={t.id} onClick={() => setEdit(t)} className="flex w-full items-center justify-between border-b border-line px-5 py-3 text-start hover:bg-paper">
            <span className="font-medium">{ar ? t.nameAr : t.nameEn}</span>
            <span className="text-[13px] text-muted">{sectors.data.find((s) => s.id === t.sectorId)?.[ar ? 'nameAr' : 'nameEn'] ?? '—'} · {t.fields.length} {ar ? 'حقل' : 'fields'}{!t.active && ` · ${ar ? 'متوقف' : 'inactive'}`}</span>
          </button>
        ))}
      </Panel>
      <Modal wide open={!!edit} onClose={() => setEdit(null)} title={ar ? 'نموذج تقرير' : 'Report template'}>
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={ar ? 'الاسم (عربي)' : 'Name (Arabic)'}><input className={inputCls} value={edit.nameAr} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} /></Field>
              <Field label={ar ? 'الاسم (إنجليزي)' : 'Name (English)'}><input className={inputCls} dir="ltr" value={edit.nameEn} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} /></Field>
              <Field label={ar ? 'القطاع' : 'Sector'}>
                <select className={inputCls} value={edit.sectorId ?? ''} onChange={(e) => setEdit({ ...edit, sectorId: e.target.value || null })}>
                  {sectors.data.map((s) => (<option key={s.id} value={s.id}>{ar ? s.nameAr : s.nameEn}</option>))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />{ar ? 'فعّال' : 'Active'}</label>
            {edit.fields.map((f, i) => (
              <div key={i} className="grid items-end gap-2 rounded-md bg-paper p-3 md:grid-cols-[110px_1fr_1fr_130px_auto_auto]">
                <Field label={ar ? 'المفتاح' : 'Key'}><input className={inputCls} dir="ltr" value={f.key} onChange={(e) => upd(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '_') })} /></Field>
                <Field label={ar ? 'العنوان (عربي)' : 'Label (Arabic)'}><input className={inputCls} value={f.label.ar} onChange={(e) => upd(i, { label: { ...f.label, ar: e.target.value } })} /></Field>
                <Field label={ar ? 'العنوان (إنجليزي)' : 'Label (English)'}><input className={inputCls} dir="ltr" value={f.label.en} onChange={(e) => upd(i, { label: { ...f.label, en: e.target.value } })} /></Field>
                <Field label={ar ? 'النوع' : 'Type'}>
                  <select className={inputCls} value={f.type} onChange={(e) => upd(i, { type: e.target.value as TField['type'], options: e.target.value === 'choice' ? f.options ?? [] : undefined, columns: e.target.value === 'table' ? f.columns ?? [{ key: 'name', label: { ar: 'البند', en: 'Item' }, type: 'text' }, { key: 'value', label: { ar: 'العدد', en: 'Count' }, type: 'number' }] : undefined })}>
                    {TYPES.map((t) => (<option key={t}>{t}</option>))}
                  </select>
                </Field>
                <label className="flex items-center gap-1 pb-2.5 text-[13px]"><input type="checkbox" checked={!!f.required} onChange={(e) => upd(i, { required: e.target.checked })} />{ar ? 'مطلوب' : 'Req.'}</label>
                <button className="pb-2.5 text-muted hover:text-crescent" onClick={() => setEdit({ ...edit, fields: edit.fields.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
                {f.type === 'choice' && <div className="md:col-span-6"><Field label={ar ? 'الخيارات (مفصولة بفاصلة)' : 'Options (comma separated)'}><input className={inputCls} value={(f.options ?? []).join(',')} onChange={(e) => upd(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field></div>}
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="quiet" onClick={() => setEdit({ ...edit, fields: [...edit.fields, { key: `f${edit.fields.length + 1}`, label: { ar: '', en: '' }, type: 'text' }] })}><Plus size={16} />{ar ? 'حقل' : 'Field'}</Button>
              <Button onClick={() => void save()}>{ar ? 'حفظ' : 'Save'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
