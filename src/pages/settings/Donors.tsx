import { Plus } from 'lucide-react'
import { useState } from 'react'
import { backend, useDo, useLoad } from '../../api/programme'
import type { Donor } from '../../api/programme'
import { Button, Field, PageHeader, Panel, inputCls } from '../../components/ui'
import { useLang } from '../../lib/i18n'
import { usePerm } from '../../lib/store'

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
      </div>
    </div>
  )
}
