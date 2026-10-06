import { KeyRound, Mail, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { initialsOf } from '../../components/Layout'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import type { User } from '../../data/types'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'

export function Users() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [office, setOffice] = useState('')
  const [edit, setEdit] = useState<User | null>(null)
  useEffect(() => {
    if (params.get('new')) {
      setEdit({ id: '', name: { ar: '', en: '' }, role: 'field_officer', officeId: s.offices[0].id, email: '', phone: '', active: true })
      setParams({}, { replace: true })
    }
  }, [params, setParams, s.offices])
  const roleName = (id: string) => s.roles.find((r) => r.id === id)?.name[lang] ?? id
  const list = s.users.filter(
    (u) =>
      (!q || u.name.ar.includes(q) || u.name.en.toLowerCase().includes(q.toLowerCase()) || (u.email ?? '').includes(q.toLowerCase())) &&
      (!role || u.role === role) &&
      (!office || u.officeId === office),
  )
  return (
    <div>
      <PageHeader
        title={ar ? 'المستخدمون' : 'Users'}
        sub={ar ? 'أضف الموظفين الذين يستخدمون النظام وحدد دور كل منهم ومكتبه. الدور يحدد ما يراه المستخدم وما يستطيع فعله.' : 'Add the staff who use the system and set each one’s role and office. The role decides what they see and can do.'}
        actions={
          <Button onClick={() => setEdit({ id: '', name: { ar: '', en: '' }, role: 'field_officer', officeId: s.offices[0].id, email: '', phone: '', active: true })}>
            <Plus size={16} /> {ar ? 'إضافة مستخدم' : 'Add user'}
          </Button>
        }
      />
      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} ps-9`} placeholder={ar ? 'ابحث بالاسم أو البريد' : 'Search by name or email'} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{ar ? 'كل الأدوار' : 'All roles'}</option>
            {s.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name[lang]}
              </option>
            ))}
          </select>
          <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={office} onChange={(e) => setOffice(e.target.value)}>
            <option value="">{ar ? 'كل المكاتب' : 'All offices'}</option>
            {s.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name[lang]}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'المستخدم' : 'User'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الدور' : 'Role'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'المكتب' : 'Office'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'التواصل' : 'Contact'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الحالة' : 'Status'}</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((u) => (
                <tr key={u.id} className={u.active === false ? 'opacity-55' : ''}>
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded bg-nile-soft font-kufi text-[12px] font-semibold text-nile">{initialsOf(u.name[lang])}</span>
                      <span className="font-medium">{u.name[lang]}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pe-3">{roleName(u.role)}</td>
                  <td className="py-2.5 pe-3">{s.offices.find((o) => o.id === u.officeId)?.name[lang]}</td>
                  <td className="py-2.5 pe-3 text-[13px]" dir="ltr">
                    <div className="text-end">{u.email}</div>
                    <div className="num text-end text-muted">{u.phone}</div>
                  </td>
                  <td className="py-2.5 pe-3">
                    {u.active === false ? (
                      <span className="rounded bg-paper px-2 py-0.5 text-[12.5px] text-muted ring-1 ring-line">{ar ? 'موقوف' : 'Disabled'}</span>
                    ) : (
                      <span className="rounded bg-leaf-soft px-2 py-0.5 text-[12.5px] text-leaf">{ar ? 'نشط' : 'Active'}</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-end whitespace-nowrap">
                    <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-nile hover:bg-nile-soft" onClick={() => setEdit(u)}>
                      <Pencil size={14} /> {ar ? 'تعديل' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {edit && <UserModal user={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function UserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const isNew = !user.id
  const [d, setD] = useState<User>(user)
  const role = s.roles.find((r) => r.id === d.role)
  const emailOk = !d.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)
  const valid = (d.name.ar || d.name.en).trim().length > 1 && emailOk && !!d.email
  const save = () => {
    s.saveUser({ ...d, id: d.id || `u-${Date.now().toString(36)}`, name: { ar: d.name.ar || d.name.en, en: d.name.en || d.name.ar } })
    onClose()
  }
  const isSelf = d.id === s.userId
  return (
    <Modal open onClose={onClose} title={isNew ? (ar ? 'إضافة مستخدم' : 'Add user') : `${ar ? 'تعديل' : 'Edit'} — ${user.name[lang]}`} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Field label={ar ? 'الاسم بالعربية' : 'Name (Arabic)'}>
            <input className={inputCls} dir="rtl" value={d.name.ar} onChange={(e) => setD({ ...d, name: { ...d.name, ar: e.target.value } })} />
          </Field>
          <Field label={ar ? 'الاسم بالإنجليزية' : 'Name (English)'}>
            <input className={inputCls} dir="ltr" value={d.name.en} onChange={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} />
          </Field>
          <Field label={ar ? 'البريد الإلكتروني (اسم الدخول)' : 'Email (sign-in name)'} hint={!emailOk ? (ar ? 'صيغة البريد غير صحيحة' : 'Email format is not valid') : undefined}>
            <input className={`${inputCls} ${!emailOk ? 'border-crescent' : ''}`} dir="ltr" type="email" value={d.email ?? ''} onChange={(e) => setD({ ...d, email: e.target.value.trim() })} />
          </Field>
          <Field label={ar ? 'رقم الجوال (للرسائل وواتساب)' : 'Mobile (for SMS and WhatsApp)'}>
            <input className={`${inputCls} num`} dir="ltr" value={d.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="+249 …" />
          </Field>
        </div>
        <div className="space-y-4">
          <Field label={ar ? 'الدور' : 'Role'}>
            <select className={inputCls} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>
              {s.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name[lang]}
                </option>
              ))}
            </select>
          </Field>
          {role && (
            <div className="rounded-md bg-paper p-3 text-[13px]">
              <div className="text-muted">{role.description[lang]}</div>
              <div className="mt-1.5">
                {role.scope === 'office' ? (ar ? 'يرى بيانات مكتبه فقط.' : 'Sees only their office’s data.') : ar ? 'يرى بيانات كل المكاتب.' : 'Sees all offices’ data.'}{' '}
                {role.canApprove && (ar ? 'يمكن إضافته في مسارات الاعتماد.' : 'Can be an approver.')}
              </div>
            </div>
          )}
          <Field label={ar ? 'المكتب' : 'Office'}>
            <select className={inputCls} value={d.officeId} onChange={(e) => setD({ ...d, officeId: e.target.value })}>
              {s.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name[lang]}
                </option>
              ))}
            </select>
          </Field>
          {!isNew && (
            <div className="space-y-2 rounded-md border border-line p-3">
              <button
                className="flex w-full items-center gap-2 text-[13.5px] text-nile hover:underline"
                onClick={() => s.toast({ ar: `أُرسل رابط تعيين كلمة المرور إلى ${d.email}`, en: `Password reset link sent to ${d.email}` })}
              >
                <KeyRound size={15} /> {ar ? 'إرسال رابط تعيين كلمة المرور' : 'Send password reset link'}
              </button>
              <button
                className="flex w-full items-center gap-2 text-[13.5px] text-nile hover:underline"
                onClick={() => s.toast({ ar: `أُعيد إرسال الدعوة إلى ${d.email}`, en: `Invitation re-sent to ${d.email}` })}
              >
                <Mail size={15} /> {ar ? 'إعادة إرسال دعوة الدخول' : 'Re-send sign-in invitation'}
              </button>
              <button
                disabled={isSelf}
                className={`flex w-full items-center gap-2 text-[13.5px] ${d.active === false ? 'text-leaf' : 'text-crescent'} hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline`}
                onClick={() => setD({ ...d, active: d.active === false })}
              >
                {d.active === false ? <UserCheck size={15} /> : <UserX size={15} />}
                {d.active === false ? (ar ? 'إعادة تفعيل المستخدم' : 'Re-enable user') : ar ? 'إيقاف المستخدم' : 'Disable user'}
                {isSelf && <span className="text-[12px]">({ar ? 'لا يمكنك إيقاف نفسك' : 'you can’t disable yourself'})</span>}
              </button>
            </div>
          )}
          {isNew && <p className="text-[12.5px] text-muted">{ar ? 'ستُرسل دعوة دخول إلى البريد المدخل.' : 'A sign-in invitation is sent to this email.'}</p>}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button disabled={!valid} onClick={save}>
          {isNew ? (ar ? 'إضافة وإرسال الدعوة' : 'Add and send invitation') : ar ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
