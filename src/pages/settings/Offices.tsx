import { Building2, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SudanMap } from '../../components/SudanMap'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import type { Office } from '../../data/types'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'

const typeName = {
  hq: { ar: 'الرئاسة', en: 'Headquarters' },
  office: { ar: 'مكتب ولائي', en: 'State office' },
  warehouse: { ar: 'مخزن', en: 'Warehouse' },
}

export function Offices() {
  const lang = useLang()
  const ar = lang === 'ar'
  const offices = useStore((s) => s.offices)
  const users = useStore((s) => s.users)
  const accounts = useStore((s) => s.accounts)
  const [params, setParams] = useSearchParams()
  const [edit, setEdit] = useState<Office | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (params.get('new')) {
      setEdit(blank())
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  return (
    <div>
      <PageHeader
        title={ar ? 'المكاتب والفروع' : 'Offices & branches'}
        sub={ar ? 'كل مكتب جديد يظهر فوراً في الخريطة والطلبات والتقارير، ويُنشأ له حساب صندوق في دليل الحسابات تلقائياً.' : 'A new office appears immediately on the map, in requests and reports, and gets its own cash box account automatically.'}
        actions={
          <Button onClick={() => setEdit(blank())}>
            <Plus size={16} /> {ar ? 'إضافة مكتب' : 'Add office'}
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'المكتب' : 'Office'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'النوع' : 'Type'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'المسؤول' : 'Manager'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'المستخدمون' : 'Users'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'حساب الصندوق' : 'Cash box'}</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {offices.map((o) => (
                <tr key={o.id} className={`${selected === o.id ? 'bg-nile-soft/50' : ''} ${o.active === false ? 'opacity-55' : ''}`} onMouseEnter={() => setSelected(o.id)}>
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{o.name[lang]}</div>
                    <div className="text-[12.5px] text-muted">{o.state[lang]}</div>
                  </td>
                  <td className="py-2.5 pe-3">{typeName[o.type ?? (o.isHQ ? 'hq' : 'office')][lang]}</td>
                  <td className="py-2.5 pe-3">{users.find((u) => u.id === o.managerId)?.name[lang] ?? <span className="text-muted">—</span>}</td>
                  <td className="num py-2.5 pe-3">{users.filter((u) => u.officeId === o.id).length}</td>
                  <td className="num py-2.5 pe-3 text-muted">{accounts.find((a) => a.parent === '1101' && a.officeId === o.id)?.code ?? '—'}</td>
                  <td className="px-5 py-2.5 text-end">
                    <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-nile hover:bg-nile-soft" onClick={() => setEdit(o)}>
                      <Pencil size={14} /> {ar ? 'تعديل' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel className="h-fit p-4">
          <SudanMap offices={offices.filter((o) => o.active !== false)} status={{}} selected={selected} onSelect={(id) => setEdit(offices.find((o) => o.id === id)!)} />
          <p className="mt-2 text-center text-[12.5px] text-muted">{ar ? 'اضغط على أي مكتب لتعديله.' : 'Click any office to edit it.'}</p>
        </Panel>
      </div>
      {edit && <OfficeModal office={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

const blank = (): Office => ({ id: '', name: { ar: '', en: '' }, state: { ar: '', en: '' }, lat: 15.6, lon: 32.5, type: 'office', active: true })

function OfficeModal({ office, onClose }: { office: Office; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const isNew = !office.id
  const [d, setD] = useState<Office>(office)
  const [picked, setPicked] = useState(!isNew)
  const valid = (d.name.ar || d.name.en).trim().length > 1 && picked
  const save = () => {
    const id = d.id || `of-${Date.now().toString(36)}`
    s.saveOffice({ ...d, id, name: { ar: d.name.ar || d.name.en, en: d.name.en || d.name.ar }, state: { ar: d.state.ar || d.state.en, en: d.state.en || d.state.ar } })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={isNew ? (ar ? 'إضافة مكتب' : 'Add office') : `${ar ? 'تعديل' : 'Edit'} — ${office.name[lang]}`} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? 'الاسم بالعربية' : 'Name (Arabic)'}>
              <input className={inputCls} dir="rtl" value={d.name.ar} onChange={(e) => setD({ ...d, name: { ...d.name, ar: e.target.value } })} />
            </Field>
            <Field label={ar ? 'الاسم بالإنجليزية' : 'Name (English)'}>
              <input className={inputCls} dir="ltr" value={d.name.en} onChange={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} />
            </Field>
            <Field label={ar ? 'الولاية' : 'State'}>
              <input className={inputCls} dir="rtl" value={d.state.ar} onChange={(e) => setD({ ...d, state: { ...d.state, ar: e.target.value } })} />
            </Field>
            <Field label={ar ? 'الولاية بالإنجليزية' : 'State (English)'}>
              <input className={inputCls} dir="ltr" value={d.state.en} onChange={(e) => setD({ ...d, state: { ...d.state, en: e.target.value } })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? 'النوع' : 'Type'}>
              <select className={inputCls} value={d.type ?? 'office'} onChange={(e) => setD({ ...d, type: e.target.value as Office['type'], isHQ: e.target.value === 'hq' })}>
                {Object.entries(typeName).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'مسؤول المكتب' : 'Office manager'}>
              <select className={inputCls} value={d.managerId ?? ''} onChange={(e) => setD({ ...d, managerId: e.target.value || undefined })}>
                <option value="">—</option>
                {s.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name[lang]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={ar ? 'الهاتف' : 'Phone'}>
            <input className={`${inputCls} num`} dir="ltr" value={d.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="+249 …" />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" className="size-4" checked={d.active !== false} onChange={(e) => setD({ ...d, active: e.target.checked })} />
            {ar ? 'المكتب نشط' : 'Office is active'}
          </label>
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-medium">
            <Building2 size={15} /> {ar ? 'موقع المكتب على الخريطة' : 'Office location on the map'}
          </div>
          <div className="rounded-md border border-line p-2">
            <SudanMap
              offices={s.offices.filter((o) => o.id !== d.id && o.active !== false)}
              status={{}}
              selected={null}
              onSelect={() => {}}
              onPick={(lon, lat) => {
                setD({ ...d, lon, lat })
                setPicked(true)
              }}
              pick={picked ? [d.lon, d.lat] : null}
            />
          </div>
          <p className={`mt-1.5 text-[12.5px] ${picked ? 'text-muted' : 'text-amber'}`}>
            {picked ? (
              <span className="num">
                {ar ? 'الإحداثيات:' : 'Coordinates:'} {d.lat}° N، {d.lon}° E
              </span>
            ) : ar ? (
              'اضغط على الخريطة لتحديد موقع المكتب.'
            ) : (
              'Click the map to place the office.'
            )}
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button disabled={!valid} onClick={save}>
          {isNew ? (ar ? 'إضافة المكتب' : 'Add office') : ar ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
