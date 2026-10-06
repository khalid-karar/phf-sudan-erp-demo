import { Copy, Info, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Field, inputCls, PageHeader, Panel } from '../../components/ui'
import type { Access, ModuleKey, Role } from '../../data/types'
import { modules } from '../../lib/nav'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'

const levels: Access[] = ['none', 'view', 'edit', 'manage']
export const levelName: Record<Access, { ar: string; en: string; d: { ar: string; en: string } }> = {
  none: { ar: 'مخفي', en: 'Hidden', d: { ar: 'لا يظهر القسم في القائمة إطلاقاً', en: 'The module does not appear at all' } },
  view: { ar: 'عرض', en: 'View', d: { ar: 'يرى البيانات والتقارير دون تعديل', en: 'Sees data and reports, no changes' } },
  edit: { ar: 'إدخال', en: 'Enter', d: { ar: 'ينشئ ويعدّل السجلات (طلبات، سندات، تقارير)', en: 'Creates and edits records (requests, vouchers, reports)' } },
  manage: { ar: 'إدارة', en: 'Manage', d: { ar: 'كل ما سبق إضافة إلى إعدادات القسم والإقفال', en: 'All of the above plus module settings and closing' } },
}

const blank = (): Role => ({
  id: '',
  name: { ar: 'دور جديد', en: 'New role' },
  description: { ar: '', en: '' },
  permissions: { dashboard: 'view', projects: 'none', activities: 'none', finance: 'none', supply: 'none', logistics: 'none', patients: 'none', hr: 'none', reports: 'none', alerts: 'view', settings: 'none' },
  scope: 'office',
  canApprove: false,
})

export function Roles() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [params, setParams] = useSearchParams()
  const [selId, setSelId] = useState(s.roles[0].id)
  const [d, setD] = useState<Role>(s.roles[0])
  useEffect(() => {
    if (params.get('new')) {
      setSelId('')
      setD(blank())
      setParams({}, { replace: true })
    }
  }, [params, setParams])
  const pick = (r: Role) => {
    setSelId(r.id)
    setD(structuredClone(r))
  }
  const saved = s.roles.find((r) => r.id === selId)
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(d)
  const usersWith = (id: string) => s.users.filter((u) => u.role === id).length
  const setLevel = (m: ModuleKey, l: Access) => setD({ ...d, permissions: { ...d.permissions, [m]: l } })
  const save = () => {
    const id = d.id || `role-${Date.now().toString(36)}`
    const r = { ...d, id }
    s.saveRole(r)
    setSelId(id)
    setD(r)
    s.toast({ ar: `حُفظ الدور «${r.name.ar}» — يسري فوراً على ${usersWith(id)} مستخدم`, en: `Role “${r.name.en}” saved — applies now to ${usersWith(id)} users` })
  }
  const visible = modules.filter((m) => m.key !== 'help' && d.permissions[m.key as ModuleKey] !== 'none')

  return (
    <div>
      <PageHeader
        title={ar ? 'الأدوار والصلاحيات' : 'Roles & permissions'}
        sub={ar ? 'كل مستخدم يرى ما يحتاجه فقط. حدد لكل دور الأقسام الظاهرة ومستوى الصلاحية فيها، وهل يرى كل المكاتب أم مكتبه فقط.' : 'Everyone sees only what they need. For each role, choose which modules show, the access level, and whether they see all offices or only their own.'}
        actions={
          <Button
            onClick={() => {
              setSelId('')
              setD(blank())
            }}
          >
            <Plus size={16} /> {ar ? 'دور جديد' : 'New role'}
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[260px_1fr]">
        <Panel>
          <ul className="divide-y divide-line">
            {s.roles.map((r) => (
              <li key={r.id}>
                <button onClick={() => pick(r)} className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-start ${selId === r.id ? 'bg-nile-soft' : 'hover:bg-paper'}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{r.name[lang]}</span>
                    <span className="block text-[12px] text-muted">
                      {usersWith(r.id)} {ar ? 'مستخدم' : 'users'}
                      {r.scope === 'office' ? (ar ? '، مكتبه فقط' : ', own office') : ''}
                    </span>
                  </span>
                  {r.system && <ShieldCheck size={15} className="shrink-0 text-muted" aria-label={ar ? 'دور أساسي' : 'Core role'} />}
                </button>
              </li>
            ))}
            {!selId && (
              <li className="bg-nile-soft px-4 py-3 text-[14px] font-medium">
                {d.name[lang]} <span className="text-[12px] font-normal text-muted">({ar ? 'غير محفوظ' : 'unsaved'})</span>
              </li>
            )}
          </ul>
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={ar ? 'اسم الدور بالعربية' : 'Role name (Arabic)'}>
                <input className={inputCls} dir="rtl" value={d.name.ar} onChange={(e) => setD({ ...d, name: { ...d.name, ar: e.target.value } })} />
              </Field>
              <Field label={ar ? 'اسم الدور بالإنجليزية' : 'Role name (English)'}>
                <input className={inputCls} dir="ltr" value={d.name.en} onChange={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={ar ? 'الوصف' : 'Description'}>
                <input className={inputCls} value={d.description[lang]} onChange={(e) => setD({ ...d, description: { ...d.description, [lang]: e.target.value } })} />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[13.5px] font-medium">{ar ? 'نطاق البيانات' : 'Data scope'}</div>
                <div className="flex gap-2">
                  {(['office', 'all'] as const).map((sc) => (
                    <button
                      key={sc}
                      onClick={() => setD({ ...d, scope: sc })}
                      className={`h-10 flex-1 rounded-md border px-3 text-[13.5px] ${d.scope === sc ? 'border-nile bg-nile-soft text-nile' : 'border-line'}`}
                    >
                      {sc === 'office' ? (ar ? 'مكتبه فقط' : 'Own office only') : ar ? 'كل المكاتب' : 'All offices'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-line p-3">
                <input type="checkbox" className="mt-1 size-4" checked={d.canApprove} onChange={(e) => setD({ ...d, canApprove: e.target.checked })} />
                <span>
                  <span className="block text-[13.5px] font-medium">{ar ? 'يشارك في مسارات الاعتماد' : 'Takes part in approval routes'}</span>
                  <span className="block text-[12.5px] text-muted">{ar ? 'يظهر كخيار في قواعد الاعتماد' : 'Shows as an option in approval rules'}</span>
                </span>
              </label>
            </div>
          </Panel>

          <Panel title={ar ? 'الصلاحيات حسب القسم' : 'Access by module'}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[12.5px] text-muted">
                    <th className="px-5 py-2.5 text-start font-medium">{ar ? 'القسم' : 'Module'}</th>
                    {levels.map((l) => (
                      <th key={l} className="py-2.5 text-center font-medium" title={levelName[l].d[lang]}>
                        {levelName[l][lang]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {modules
                    .filter((m) => m.key !== 'help')
                    .map((m) => {
                      const k = m.key as ModuleKey
                      return (
                        <tr key={m.key}>
                          <td className="px-5 py-2">{m.label[lang]}</td>
                          {levels.map((l) => (
                            <td key={l} className="py-2 text-center">
                              <label className="inline-grid size-9 cursor-pointer place-items-center rounded-md hover:bg-paper">
                                <input
                                  type="radio"
                                  name={`p-${k}`}
                                  className="size-4 accent-[var(--color-nile)]"
                                  checked={d.permissions[k] === l}
                                  disabled={k === 'dashboard' && l === 'none'}
                                  onChange={() => setLevel(k, l)}
                                  aria-label={`${m.label[lang]} — ${levelName[l][lang]}`}
                                />
                              </label>
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 border-t border-line px-5 py-3 text-[12.5px] text-muted sm:grid-cols-2">
              {levels.map((l) => (
                <div key={l}>
                  <b className="text-ink">{levelName[l][lang]}:</b> {levelName[l].d[lang]}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium">
              <Info size={15} className="text-nile" /> {ar ? 'هكذا ستظهر القائمة لهذا الدور' : 'This is the menu this role will see'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {visible.map((m) => (
                <span key={m.key} className="rounded-md bg-nile px-3 py-1.5 text-[13px] text-white">
                  {m.label[lang]}
                </span>
              ))}
            </div>
          </Panel>

          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              {saved && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setSelId('')
                    setD({ ...structuredClone(saved), id: '', system: false, name: { ar: `${saved.name.ar} (نسخة)`, en: `${saved.name.en} (copy)` } })
                  }}
                >
                  <Copy size={15} /> {ar ? 'نسخ كدور جديد' : 'Duplicate'}
                </Button>
              )}
              {saved && !saved.system && (
                <Button
                  variant="danger"
                  disabled={usersWith(saved.id) > 0}
                  title={usersWith(saved.id) > 0 ? (ar ? 'انقل المستخدمين إلى دور آخر أولاً' : 'Move its users to another role first') : undefined}
                  onClick={() => {
                    s.deleteRole(saved.id)
                    pick(s.roles[0])
                  }}
                >
                  <Trash2 size={15} /> {ar ? 'حذف الدور' : 'Delete role'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="quiet" disabled={!dirty || !saved} onClick={() => saved && setD(structuredClone(saved))}>
                {ar ? 'تراجع' : 'Discard'}
              </Button>
              <Button disabled={!dirty || !d.name[lang].trim()} onClick={save}>
                {ar ? 'حفظ الدور' : 'Save role'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
