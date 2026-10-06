import { AlertTriangle, CalendarPlus, Check, Pencil, Plus, Search, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { initialsOf } from '../../components/Layout'
import { Button, Field, inputCls, Modal, PageHeader, Panel, UsageBar } from '../../components/ui'
import { contractName, departmentName } from '../../data/people'
import type { Contract, Department, Employee, LeaveRequest } from '../../data/types'
import { findLine, lineUsage } from '../../lib/budget'
import { date, num, relDays, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { lastMonth, periodLabel, recentPeriods } from '../../lib/reportData'
import { usePerm, useStore } from '../../lib/store'

const leaveName = {
  annual: { ar: 'سنوية', en: 'Annual' },
  sick: { ar: 'مرضية', en: 'Sick' },
  emergency: { ar: 'اضطرارية', en: 'Emergency' },
  unpaid: { ar: 'بدون راتب', en: 'Unpaid' },
}
const statusName = {
  active: { ar: 'على رأس العمل', en: 'Working', cls: 'bg-leaf-soft text-leaf' },
  on_leave: { ar: 'في إجازة', en: 'On leave', cls: 'bg-amber-soft text-amber' },
  ended: { ar: 'انتهت الخدمة', en: 'Left', cls: 'bg-paper text-muted ring-1 ring-line' },
}

export function Staff() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, scopeOffice } = usePerm()
  const [q, setQ] = useState('')
  const [office, setOffice] = useState(scopeOffice ?? '')
  const [dept, setDept] = useState<Department | ''>('')
  const [edit, setEdit] = useState<Employee | null>(null)
  const list = s.employees.filter(
    (e) => (!office || e.officeId === office) && (!dept || e.department === dept) && (!q || e.name.ar.includes(q) || e.name.en.toLowerCase().includes(q.toLowerCase()) || e.no.toLowerCase().includes(q.toLowerCase())),
  )
  const ending = s.employees.filter((e) => e.status !== 'ended' && e.endDate && (+new Date(e.endDate) - Date.now()) / 86_400_000 <= 30)
  const active = s.employees.filter((e) => e.status !== 'ended')
  const blank = (): Employee => ({
    id: '',
    no: '',
    name: { ar: '', en: '' },
    officeId: scopeOffice ?? 'khr',
    position: { ar: '', en: '' },
    department: 'field',
    contract: 'fixed',
    startDate: new Date().toISOString(),
    salarySDG: 0,
    status: 'active',
    allocations: [],
    leaveBalance: 21,
  })
  return (
    <div>
      <PageHeader
        title={ar ? 'الموظفون' : 'Staff'}
        sub={ar ? 'ملف كل موظف: العقد والراتب والمكتب، والمشروع الذي يُحمّل عليه راتبه.' : 'Each staff member’s file: contract, salary, office, and the project their salary is charged to.'}
        actions={
          can('hr', 'edit') && (
            <Button onClick={() => setEdit(blank())}>
              <UserPlus size={16} /> {ar ? 'موظف جديد' : 'New staff member'}
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            [ar ? 'على رأس العمل' : 'Working', active.filter((e) => e.status === 'active').length],
            [ar ? 'في إجازة الآن' : 'On leave now', active.filter((e) => e.status === 'on_leave').length],
            [ar ? 'مكاتب' : 'Offices', new Set(active.map((e) => e.officeId)).size],
            [ar ? 'عقود تنتهي خلال 30 يوماً' : 'Contracts ending in 30 days', ending.length],
          ] as [string, number][]
        ).map(([k, v], i) => (
          <div key={k} className="rounded-lg border border-line bg-surface p-4">
            <div className="text-[13px] text-muted">{k}</div>
            <div className={`num mt-1 font-kufi text-[24px] font-semibold ${i === 3 && v ? 'text-amber' : ''}`}>{v}</div>
          </div>
        ))}
      </div>
      {ending.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-amber-soft px-4 py-2.5 text-[13.5px] text-amber">
          <AlertTriangle size={16} />
          {ar ? 'عقود تنتهي قريباً:' : 'Contracts ending soon:'}
          {ending.map((e) => (
            <button key={e.id} className="font-medium underline" onClick={() => setEdit(e)}>
              {e.name[lang]} ({relDays(e.endDate!, lang)})
            </button>
          ))}
        </div>
      )}
      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} ps-9`} placeholder={ar ? 'ابحث بالاسم أو الرقم الوظيفي' : 'Search by name or staff number'} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!scopeOffice && (
            <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={office} onChange={(e) => setOffice(e.target.value)}>
              <option value="">{ar ? 'كل المكاتب' : 'All offices'}</option>
              {s.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name[lang]}
                </option>
              ))}
            </select>
          )}
          <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={dept} onChange={(e) => setDept(e.target.value as Department | '')}>
            <option value="">{ar ? 'كل الأقسام' : 'All departments'}</option>
            {Object.entries(departmentName).map(([k, v]) => (
              <option key={k} value={k}>
                {v[lang]}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الموظف' : 'Staff member'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'المكتب والقسم' : 'Office & department'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'العقد' : 'Contract'}</th>
                <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الراتب الشهري' : 'Monthly salary'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'يُحمّل على' : 'Charged to'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الحالة' : 'Status'}</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((e) => (
                <tr key={e.id} className={e.status === 'ended' ? 'opacity-55' : ''}>
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded bg-nile-soft font-kufi text-[12px] font-semibold text-nile">{initialsOf(e.name[lang])}</span>
                      <span>
                        <span className="block font-medium">{e.name[lang]}</span>
                        <span className="block text-[12.5px] text-muted">
                          <span className="num">{e.no}</span> — {e.position[lang]}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 pe-3">
                    {s.offices.find((o) => o.id === e.officeId)?.name[lang]}
                    <span className="block text-[12.5px] text-muted">{departmentName[e.department][lang]}</span>
                  </td>
                  <td className="py-2.5 pe-3">
                    {contractName[e.contract][lang]}
                    {e.endDate && <span className="num block text-[12.5px] text-muted">{ar ? 'حتى' : 'until'} {date(e.endDate, lang)}</span>}
                  </td>
                  <td className="num py-2.5 pe-3 text-end">{e.salarySDG ? `${num(e.salarySDG)} ${ar ? 'ج.س' : 'SDG'}` : '—'}</td>
                  <td className="py-2.5 pe-3 text-[13px]">
                    {e.allocations.length ? (
                      e.allocations.map((a) => (
                        <div key={a.lineId} className="num">
                          {s.projects.find((p) => p.id === a.projectId)?.code} {findLine(s.projects, a.lineId)?.line.code} — {a.pct}%
                        </div>
                      ))
                    ) : (
                      <span className="text-muted">{ar ? 'المصاريف الإدارية' : 'Admin overhead'}</span>
                    )}
                  </td>
                  <td className="py-2.5 pe-3">
                    <span className={`rounded px-2 py-0.5 text-[12.5px] ${statusName[e.status].cls}`}>{statusName[e.status][lang]}</span>
                  </td>
                  <td className="px-5 py-2.5 text-end">
                    {can('hr', 'edit') && (
                      <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-nile hover:bg-nile-soft" onClick={() => setEdit(e)}>
                        <Pencil size={14} /> {ar ? 'فتح' : 'Open'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {edit && <EmployeeModal emp={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function EmployeeModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [d, setD] = useState(emp)
  const isNew = !emp.id
  const totalPct = d.allocations.reduce((t, a) => t + a.pct, 0)
  const valid = (d.name.ar || d.name.en).trim().length > 2 && totalPct <= 100
  const allLines = s.projects.flatMap((p) => p.pillars.flatMap((pl) => pl.lines.map((l) => ({ p, l }))))
  return (
    <Modal open onClose={onClose} title={isNew ? (ar ? 'موظف جديد' : 'New staff member') : `${d.name[lang]} — ${d.no}`} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? 'الاسم بالعربية' : 'Name (Arabic)'}>
              <input className={inputCls} dir="rtl" value={d.name.ar} onChange={(e) => setD({ ...d, name: { ...d.name, ar: e.target.value } })} />
            </Field>
            <Field label={ar ? 'الاسم بالإنجليزية' : 'Name (English)'}>
              <input className={inputCls} dir="ltr" value={d.name.en} onChange={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} />
            </Field>
          </div>
          <Field label={ar ? 'الوظيفة' : 'Position'}>
            <input className={inputCls} value={d.position[lang]} onChange={(e) => setD({ ...d, position: { ...d.position, [lang]: e.target.value } })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? 'المكتب' : 'Office'}>
              <select className={inputCls} value={d.officeId} onChange={(e) => setD({ ...d, officeId: e.target.value })}>
                {s.offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'القسم' : 'Department'}>
              <select className={inputCls} value={d.department} onChange={(e) => setD({ ...d, department: e.target.value as Department })}>
                {Object.entries(departmentName).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'نوع العقد' : 'Contract'}>
              <select className={inputCls} value={d.contract} onChange={(e) => setD({ ...d, contract: e.target.value as Contract })}>
                {Object.entries(contractName).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'الراتب الشهري (جنيه)' : 'Monthly salary (SDG)'}>
              <input type="number" min={0} className={`${inputCls} num`} value={d.salarySDG || ''} onChange={(e) => setD({ ...d, salarySDG: Math.max(0, +e.target.value) })} />
            </Field>
            <Field label={ar ? 'تاريخ البداية' : 'Start date'}>
              <input type="date" className={`${inputCls} num`} value={d.startDate.slice(0, 10)} onChange={(e) => e.target.value && setD({ ...d, startDate: new Date(e.target.value).toISOString() })} />
            </Field>
            <Field label={ar ? 'تاريخ انتهاء العقد' : 'Contract end'}>
              <input type="date" className={`${inputCls} num`} value={d.endDate?.slice(0, 10) ?? ''} onChange={(e) => setD({ ...d, endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
            </Field>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[13.5px] font-medium">{ar ? 'تحميل الراتب على المشاريع' : 'Salary charged to projects'}</div>
            <p className="mb-2 text-[12.5px] text-muted">{ar ? 'ما لا يُحمّل على مشروع يُسجّل مصروفاً إدارياً عاماً.' : 'Whatever isn’t charged to a project is booked as general admin cost.'}</p>
            <div className="space-y-2">
              {d.allocations.map((a, i) => {
                const lu = findLine(s.projects, a.lineId) ? lineUsage(findLine(s.projects, a.lineId)!.line, s) : null
                return (
                  <div key={i} className="rounded-md border border-line p-2.5">
                    <div className="flex gap-2">
                      <select
                        className={`${inputCls} h-9 text-[13px]`}
                        value={a.lineId}
                        onChange={(e) => {
                          const x = allLines.find((y) => y.l.id === e.target.value)!
                          setD({ ...d, allocations: d.allocations.map((y, k) => (k === i ? { ...y, lineId: x.l.id, projectId: x.p.id } : y)) })
                        }}
                      >
                        {allLines.map(({ p, l }) => (
                          <option key={l.id} value={l.id}>
                            {p.code} {l.code} {l.name[lang]}
                          </option>
                        ))}
                      </select>
                      <input type="number" min={1} max={100} className="num h-9 w-20 rounded-md border border-line px-2" value={a.pct} onChange={(e) => setD({ ...d, allocations: d.allocations.map((y, k) => (k === i ? { ...y, pct: Math.max(0, Math.min(100, +e.target.value)) } : y)) })} aria-label="%" />
                      <button className="text-muted hover:text-crescent" onClick={() => setD({ ...d, allocations: d.allocations.filter((_, k) => k !== i) })} aria-label={ar ? 'حذف' : 'Remove'}>
                        <X size={16} />
                      </button>
                    </div>
                    {lu && (
                      <div className="mt-2">
                        <UsageBar u={lu} height={6} />
                        <div className="num mt-0.5 text-[11.5px] text-muted">
                          {ar ? 'المتاح على البند' : 'Available on line'} {usd(lu.available)} — {ar ? 'الحصة الشهرية' : 'monthly share'} {usd((d.salarySDG / s.rates.at(-1)!.rate) * (a.pct / 100))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <button className="inline-flex items-center gap-1 text-[13.5px] text-nile hover:underline" onClick={() => setD({ ...d, allocations: [...d.allocations, { projectId: allLines[0].p.id, lineId: allLines[0].l.id, pct: Math.max(0, 100 - totalPct) }] })}>
                <Plus size={15} /> {ar ? 'إضافة مشروع' : 'Add a project'}
              </button>
              {totalPct > 100 && <p className="text-[12.5px] text-crescent">{ar ? 'مجموع النسب أكبر من 100٪.' : 'Shares add up to more than 100%.'}</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? 'رصيد الإجازة السنوية (يوم)' : 'Annual leave left (days)'}>
              <input type="number" min={0} className={`${inputCls} num`} value={d.leaveBalance} onChange={(e) => setD({ ...d, leaveBalance: Math.max(0, +e.target.value) })} />
            </Field>
            <Field label={ar ? 'الحالة' : 'Status'}>
              <select className={inputCls} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Employee['status'] })}>
                {Object.entries(statusName).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={ar ? 'حساب الدخول للنظام' : 'System sign-in account'}>
            <select className={inputCls} value={d.userId ?? ''} onChange={(e) => setD({ ...d, userId: e.target.value || undefined })}>
              <option value="">{ar ? '— لا يستخدم النظام —' : '— doesn’t use the system —'}</option>
              {s.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name[lang]} ({u.email})
                </option>
              ))}
            </select>
          </Field>
          {!d.userId && !isNew && (
            <Link to="/settings/users?new=1" className="text-[13px] text-nile hover:underline">
              {ar ? 'إنشاء حساب دخول لهذا الموظف' : 'Create a sign-in account for this person'}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!valid}
          onClick={() => {
            const n = s.employees.length + 101
            s.saveEmployee({ ...d, id: d.id || `e-${Date.now().toString(36)}`, no: d.no || `EMP-${String(n).padStart(4, '0')}`, name: { ar: d.name.ar || d.name.en, en: d.name.en || d.name.ar } })
            onClose()
          }}
        >
          {ar ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}

export function Leave() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, user, scopeOffice } = usePerm()
  const [open, setOpen] = useState(false)
  const me = s.employees.find((e) => e.userId === user.id)
  const list = s.leaves.filter((l) => !scopeOffice || s.employees.find((e) => e.id === l.employeeId)?.officeId === scopeOffice).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const away = s.leaves.filter((l) => l.status === 'approved' && +new Date(l.from) <= Date.now() + 7 * 86_400_000 && +new Date(l.to) >= Date.now())
  return (
    <div>
      <PageHeader
        title={ar ? 'الإجازات' : 'Leave'}
        sub={ar ? 'طلبات الإجازة واعتمادها، ورصيد كل موظف، ومن سيغيب هذا الأسبوع.' : 'Leave requests and approvals, everyone’s balance, and who is away this week.'}
        actions={
          <Button onClick={() => setOpen(true)}>
            <CalendarPlus size={16} /> {ar ? 'طلب إجازة' : 'Request leave'}
          </Button>
        }
      />
      {away.length > 0 && (
        <Panel className="mb-6 p-4">
          <div className="mb-2 text-[13.5px] font-medium">{ar ? 'غائبون هذا الأسبوع' : 'Away this week'}</div>
          <div className="flex flex-wrap gap-2">
            {away.map((l) => {
              const e = s.employees.find((x) => x.id === l.employeeId)!
              return (
                <span key={l.id} className="rounded-md bg-amber-soft px-3 py-1.5 text-[13px] text-amber">
                  {e.name[lang]} — <span className="num">{date(l.from, lang)} – {date(l.to, lang)}</span>
                </span>
              )
            })}
          </div>
        </Panel>
      )}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الموظف' : 'Staff member'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'النوع' : 'Type'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الفترة' : 'Dates'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الأيام' : 'Days'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الرصيد' : 'Balance'}</th>
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'القرار' : 'Decision'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((l) => {
              const e = s.employees.find((x) => x.id === l.employeeId)!
              const short = l.type === 'annual' && l.status === 'pending' && l.days > e.leaveBalance
              return (
                <tr key={l.id}>
                  <td className="px-5 py-2.5">
                    {e.name[lang]}
                    <span className="block text-[12.5px] text-muted">{s.offices.find((o) => o.id === e.officeId)?.name[lang]}</span>
                  </td>
                  <td className="py-2.5 pe-3">
                    {leaveName[l.type][lang]}
                    {l.note && <span className="block text-[12.5px] text-muted">{l.note}</span>}
                  </td>
                  <td className="num py-2.5 pe-3 whitespace-nowrap">
                    {date(l.from, lang)} – {date(l.to, lang)}
                  </td>
                  <td className="num py-2.5 pe-3 text-end">{l.days}</td>
                  <td className={`num py-2.5 pe-3 text-end ${short ? 'font-semibold text-crescent' : ''}`}>{e.leaveBalance}</td>
                  <td className="px-5 py-2.5">
                    {l.status === 'pending' ? (
                      can('hr', 'edit') ? (
                        <div className="flex gap-1.5">
                          <Button variant="ok" className="h-8 px-3 text-[13px]" onClick={() => s.decideLeave(l.id, true)}>
                            <Check size={14} /> {ar ? 'اعتماد' : 'Approve'}
                          </Button>
                          <Button variant="danger" className="h-8 px-3 text-[13px]" onClick={() => s.decideLeave(l.id, false)}>
                            <X size={14} /> {ar ? 'رفض' : 'Reject'}
                          </Button>
                        </div>
                      ) : (
                        <span className="rounded bg-amber-soft px-2 py-0.5 text-[12.5px] text-amber">{ar ? 'قيد المراجعة' : 'Pending'}</span>
                      )
                    ) : (
                      <span className={`rounded px-2 py-0.5 text-[12.5px] ${l.status === 'approved' ? 'bg-leaf-soft text-leaf' : 'bg-crescent-soft text-crescent'}`}>
                        {l.status === 'approved' ? (ar ? 'معتمدة' : 'Approved') : ar ? 'مرفوضة' : 'Rejected'}
                      </span>
                    )}
                    {short && <span className="block text-[12px] text-crescent">{ar ? 'تتجاوز الرصيد' : 'More than the balance'}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
      {open && <LeaveModal defaultEmp={me?.id} onClose={() => setOpen(false)} />}
    </div>
  )
}

function LeaveModal({ defaultEmp, onClose }: { defaultEmp?: string; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can } = usePerm()
  const [d, setD] = useState<Omit<LeaveRequest, 'id' | 'status' | 'createdAt'>>({
    employeeId: defaultEmp ?? s.employees[0].id,
    type: 'annual',
    from: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    to: new Date(Date.now() + 11 * 86_400_000).toISOString(),
    days: 5,
    note: '',
  })
  const days = Math.max(1, Math.round((+new Date(d.to) - +new Date(d.from)) / 86_400_000) + 1)
  const e = s.employees.find((x) => x.id === d.employeeId)!
  return (
    <Modal open onClose={onClose} title={ar ? 'طلب إجازة' : 'Request leave'}>
      <div className="space-y-4">
        <Field label={ar ? 'الموظف' : 'Staff member'}>
          <select className={inputCls} value={d.employeeId} disabled={!can('hr', 'edit') && !!defaultEmp} onChange={(x) => setD({ ...d, employeeId: x.target.value })}>
            {s.employees.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={ar ? 'النوع' : 'Type'}>
            <select className={inputCls} value={d.type} onChange={(x) => setD({ ...d, type: x.target.value as LeaveRequest['type'] })}>
              {Object.entries(leaveName).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'من' : 'From'}>
            <input type="date" className={`${inputCls} num`} value={d.from.slice(0, 10)} onChange={(x) => x.target.value && setD({ ...d, from: new Date(x.target.value).toISOString() })} />
          </Field>
          <Field label={ar ? 'إلى' : 'To'}>
            <input type="date" className={`${inputCls} num`} value={d.to.slice(0, 10)} onChange={(x) => x.target.value && setD({ ...d, to: new Date(x.target.value).toISOString() })} />
          </Field>
        </div>
        <p className={`text-[13px] ${d.type === 'annual' && days > e.leaveBalance ? 'text-crescent' : 'text-muted'}`}>
          <span className="num">{days}</span> {ar ? 'يوم' : 'days'} — {ar ? 'الرصيد المتاح' : 'balance'} <span className="num">{e.leaveBalance}</span>
        </p>
        <Field label={ar ? 'ملاحظة' : 'Note'}>
          <input className={inputCls} value={d.note} onChange={(x) => setD({ ...d, note: x.target.value })} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={+new Date(d.to) < +new Date(d.from)}
          onClick={() => {
            s.requestLeave({ ...d, days })
            onClose()
          }}
        >
          {ar ? 'إرسال الطلب' : 'Send request'}
        </Button>
      </div>
    </Modal>
  )
}

export function Payroll() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can } = usePerm()
  const [period, setPeriod] = useState(lastMonth())
  const rate = s.rates.at(-1)!.rate
  const run = s.payrolls.find((p) => p.period === period)
  const paid = s.employees.filter((e) => e.status !== 'ended' && e.salarySDG > 0)
  const total = paid.reduce((t, e) => t + e.salarySDG, 0)
  const byLine = useMemo(() => {
    const m = new Map<string, number>()
    let overhead = 0
    for (const e of paid) {
      let left = 1
      for (const a of e.allocations) {
        m.set(a.lineId, (m.get(a.lineId) ?? 0) + (e.salarySDG * a.pct) / 100 / rate)
        left -= a.pct / 100
      }
      overhead += (e.salarySDG * left) / rate
    }
    return { lines: [...m.entries()], overhead }
  }, [paid, rate])
  return (
    <div>
      <PageHeader
        title={ar ? 'الرواتب' : 'Payroll'}
        sub={ar ? 'يحسب النظام رواتب الشهر، ويحمّل حصة كل مشروع على بنده تلقائياً، ثم يُرحّل قيد الرواتب.' : 'The system works out the month’s salaries, charges each project its share on the right line, then posts the payroll entry.'}
        actions={
          !run &&
          can('finance', 'edit') && (
            <Button onClick={() => s.postPayroll(period)}>
              {ar ? `ترحيل رواتب ${periodLabel(period, true)}` : `Post ${periodLabel(period, false)} payroll`}
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Field label={ar ? 'الشهر' : 'Month'}>
          <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {recentPeriods(3).map((p) => (
              <option key={p} value={p}>
                {periodLabel(p, ar)}
              </option>
            ))}
          </select>
        </Field>
        {run ? (
          <span className="rounded-md bg-leaf-soft px-3 py-2 text-[13.5px] text-leaf">
            {ar ? 'رُحّلت في' : 'Posted on'} <span className="num">{date(run.postedAt, lang)}</span> — {s.journal.find((j) => j.id === run.journalId)?.no}
          </span>
        ) : (
          !can('finance', 'edit') && <span className="text-[13px] text-muted">{ar ? 'الترحيل يتم من المالية.' : 'Posting is done by Finance.'}</span>
        )}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الموظف' : 'Staff member'}</th>
                <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الإجمالي' : 'Gross'}</th>
                <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'تأمينات 8٪' : 'Insurance 8%'}</th>
                <th className="px-5 py-2.5 text-end font-medium">{ar ? 'الصافي' : 'Net'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {paid.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-2">
                    {e.name[lang]}
                    <span className="block text-[12px] text-muted">{e.position[lang]}</span>
                  </td>
                  <td className="num py-2 pe-3 text-end">{num(e.salarySDG)}</td>
                  <td className="num py-2 pe-3 text-end text-muted">{num(e.salarySDG * 0.08)}</td>
                  <td className="num px-5 py-2 text-end font-medium">{num(e.salarySDG * 0.92)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/70 font-semibold">
                <td className="px-5 py-2.5">
                  {ar ? 'الإجمالي (جنيه)' : 'Total (SDG)'} <span className="num text-[12.5px] font-normal text-muted">≈ {usd(total / rate)}</span>
                </td>
                <td className="num py-2.5 pe-3 text-end">{num(total)}</td>
                <td className="num py-2.5 pe-3 text-end">{num(total * 0.08)}</td>
                <td className="num px-5 py-2.5 text-end">{num(total * 0.92)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
        <Panel title={ar ? 'توزيع التكلفة على المشاريع' : 'Cost split across projects'}>
          <ul className="divide-y divide-line">
            {byLine.lines.map(([lineId, v]) => {
              const f = findLine(s.projects, lineId)!
              const lu = lineUsage(f.line, s)
              const over = !run && v > lu.available
              return (
                <li key={lineId} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-2 text-[14px]">
                    <span>
                      <span className="num text-muted">
                        {f.project.code} {f.line.code}
                      </span>{' '}
                      {f.line.name[lang]}
                    </span>
                    <span className="num font-medium">{usd(v)}</span>
                  </div>
                  <div className="mt-1.5">
                    <UsageBar u={lu} incoming={run ? 0 : v} height={7} />
                  </div>
                  {over && <p className="mt-1 text-[12px] text-crescent">{ar ? 'الحصة أكبر من المتاح على البند — راجع التحميل أو اطلب مناقلة.' : 'The share is more than the line has left — review the split or request a reallocation.'}</p>}
                </li>
              )
            })}
            <li className="flex items-baseline justify-between px-5 py-3 text-[14px]">
              <span>{ar ? 'مصاريف إدارية عامة (غير محمّلة على مشروع)' : 'General admin cost (not charged to a project)'}</span>
              <span className="num font-medium">{usd(byLine.overhead)}</span>
            </li>
          </ul>
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-muted">
            {ar ? 'القيد: من ح/ 5201 الرواتب (بأبعاد المشروع والبند) إلى ح/ البنك بالصافي و ح/ 2104 بالتأمينات المستقطعة.' : 'Entry: Dr 5201 salaries (with project and line) / Cr bank for net pay and 2104 for insurance withheld.'}
          </p>
        </Panel>
      </div>
    </div>
  )
}
