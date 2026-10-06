import { AlertTriangle, HeartPulse, Plus, Search, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { initialsOf } from '../../components/Layout'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import { serviceName } from '../../data/people'
import type { Beneficiary, ServiceType } from '../../data/types'
import { date, num } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

const THIS_YEAR = new Date().getFullYear()
const ageOf = (b: Beneficiary) => THIS_YEAR - b.birthYear
const selCls = 'h-10 rounded-md border border-line bg-surface px-2 text-[14px]'

/** Loose Arabic/English name normaliser for duplicate detection. */
const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()

function possibleDuplicates(all: Beneficiary[], b: Beneficiary) {
  const n = norm(b.name.ar || b.name.en)
  if (n.length < 5) return []
  const firstTwo = n.split(' ').slice(0, 2).join(' ')
  return all.filter((x) => {
    if (x.id === b.id) return false
    const xa = norm(x.name.ar)
    const xe = norm(x.name.en)
    const nameHit = xa === n || xe === n || xa.startsWith(firstTwo) || xe.startsWith(firstTwo)
    const phoneHit = !!b.phone && !!x.phone && x.phone.replace(/\D/g, '') === b.phone.replace(/\D/g, '')
    return phoneHit || (nameHit && Math.abs(x.birthYear - b.birthYear) <= 2)
  })
}

export function Beneficiaries() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, scopeOffice, user } = usePerm()
  const [q, setQ] = useState('')
  const [office, setOffice] = useState(scopeOffice ?? '')
  const [gender, setGender] = useState<'' | 'm' | 'f'>('')
  const [svc, setSvc] = useState<ServiceType | ''>('')
  const [open, setOpen] = useState<Beneficiary | null>(null)
  const [reg, setReg] = useState<Beneficiary | null>(null)
  const canEdit = can('patients', 'edit')

  const scoped = s.beneficiaries.filter((b) => !scopeOffice || b.officeId === scopeOffice)
  const list = scoped.filter(
    (b) =>
      (!office || b.officeId === office) &&
      (!gender || b.gender === gender) &&
      (!svc || b.services.some((x) => x.type === svc)) &&
      (!q || b.name.ar.includes(q) || b.name.en.toLowerCase().includes(q.toLowerCase()) || b.no.toLowerCase().includes(q.toLowerCase()) || (b.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')),
  )
  const month = new Date().toISOString().slice(0, 7)
  const servicesThisMonth = scoped.reduce((n, b) => n + b.services.filter((x) => x.date.slice(0, 7) === month).length, 0)

  const blank = (): Beneficiary => ({
    id: '',
    no: '',
    name: { ar: '', en: '' },
    gender: 'f',
    birthYear: THIS_YEAR - 30,
    officeId: scopeOffice ?? user?.officeId ?? 'khr',
    locality: '',
    displaced: false,
    registeredAt: new Date().toISOString(),
    registeredBy: user?.id,
    services: [],
  })

  return (
    <div>
      <PageHeader
        title={ar ? 'سجل المستفيدين' : 'Beneficiary register'}
        sub={
          ar
            ? 'سجل واحد لكل مريض أو مستفيد، يربط كل خدمة قُدمت له بالنشاط الميداني والمشروع الذي موّلها.'
            : 'One record per patient or beneficiary, linking every service they received to the field activity and project that funded it.'
        }
        actions={
          canEdit && (
            <Button onClick={() => setReg(blank())}>
              <UserPlus size={16} /> {ar ? 'تسجيل مستفيد' : 'Register beneficiary'}
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            [ar ? 'مستفيدون مسجّلون' : 'Registered beneficiaries', scoped.length],
            [ar ? 'خدمات هذا الشهر' : 'Services this month', servicesThisMonth],
            [ar ? 'نازحون' : 'Displaced', scoped.filter((b) => b.displaced).length],
            [ar ? 'أطفال دون 15' : 'Children under 15', scoped.filter((b) => ageOf(b) < 15).length],
          ] as [string, number][]
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-surface p-4">
            <div className="text-[13px] text-muted">{k}</div>
            <div className="num mt-1 font-kufi text-[24px] font-semibold">{num(v)}</div>
          </div>
        ))}
      </div>
      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} ps-9`} placeholder={ar ? 'ابحث بالاسم أو الرقم أو الهاتف' : 'Search by name, number or phone'} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!scopeOffice && (
            <select className={selCls} value={office} onChange={(e) => setOffice(e.target.value)} aria-label={ar ? 'المكتب' : 'Office'}>
              <option value="">{ar ? 'كل المكاتب' : 'All offices'}</option>
              {s.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name[lang]}
                </option>
              ))}
            </select>
          )}
          <select className={selCls} value={gender} onChange={(e) => setGender(e.target.value as '' | 'm' | 'f')} aria-label={ar ? 'النوع' : 'Gender'}>
            <option value="">{ar ? 'الكل' : 'All genders'}</option>
            <option value="f">{ar ? 'إناث' : 'Female'}</option>
            <option value="m">{ar ? 'ذكور' : 'Male'}</option>
          </select>
          <select className={selCls} value={svc} onChange={(e) => setSvc(e.target.value as ServiceType | '')} aria-label={ar ? 'الخدمة' : 'Service'}>
            <option value="">{ar ? 'كل الخدمات' : 'All services'}</option>
            {Object.entries(serviceName).map(([k, v]) => (
              <option key={k} value={k}>
                {v[lang]}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'المستفيد' : 'Beneficiary'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'النوع والعمر' : 'Gender & age'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'المكتب والمحلية' : 'Office & locality'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'آخر خدمة' : 'Last service'}</th>
                <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الخدمات' : 'Services'}</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.slice(0, 200).map((b) => {
                const last = [...b.services].sort((x, y) => y.date.localeCompare(x.date))[0]
                return (
                  <tr key={b.id} className="cursor-pointer hover:bg-paper" onClick={() => setOpen(b)}>
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-3">
                        <span className={`grid size-8 shrink-0 place-items-center rounded font-kufi text-[12px] font-semibold ${b.gender === 'f' ? 'bg-crescent-soft text-crescent' : 'bg-nile-soft text-nile'}`}>{initialsOf(b.name[lang])}</span>
                        <span>
                          <span className="block font-medium">{b.name[lang]}</span>
                          <span className="num block text-[12.5px] text-muted">{b.no}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 pe-3">
                      {b.gender === 'f' ? (ar ? 'أنثى' : 'Female') : ar ? 'ذكر' : 'Male'} · <span className="num">{ageOf(b)}</span> {ar ? 'سنة' : 'yrs'}
                      {b.displaced && <span className="ms-2 rounded bg-amber-soft px-1.5 py-0.5 text-[11.5px] text-amber">{ar ? 'نازح' : 'Displaced'}</span>}
                    </td>
                    <td className="py-2.5 pe-3">
                      {s.offices.find((o) => o.id === b.officeId)?.name[lang]}
                      <span className="block text-[12.5px] text-muted">{b.locality || '—'}</span>
                    </td>
                    <td className="py-2.5 pe-3">
                      {last ? (
                        <>
                          {serviceName[last.type][lang]}
                          <span className="block text-[12.5px] text-muted">{date(last.date, lang)}</span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="num py-2.5 pe-3 text-end">{b.services.length}</td>
                    <td className="px-5 py-2.5 text-end text-[13px] text-nile">{ar ? 'فتح الملف' : 'Open file'}</td>
                  </tr>
                )
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted">
                    {ar ? 'لا يوجد مستفيدون يطابقون البحث.' : 'No beneficiaries match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-2.5 text-[12.5px] text-muted">
          {ar ? `يظهر ${num(Math.min(list.length, 200))} من ${num(list.length)}` : `Showing ${num(Math.min(list.length, 200))} of ${num(list.length)}`}
          {' · '}
          {ar ? 'أرقام الهواتف تظهر فقط لمن لديه صلاحية التعديل على السجل.' : 'Phone numbers are only shown to roles that can edit the register.'}
        </div>
      </Panel>
      {open && <BeneficiaryFile b={s.beneficiaries.find((x) => x.id === open.id) ?? open} onClose={() => setOpen(null)} onEdit={(b) => { setOpen(null); setReg(b) }} />}
      {reg && <RegisterModal initial={reg} onClose={() => setReg(null)} onOpen={(b) => { setReg(null); setOpen(b) }} />}
    </div>
  )
}

function BeneficiaryFile({ b, onClose, onEdit }: { b: Beneficiary; onClose: () => void; onEdit: (b: Beneficiary) => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can } = usePerm()
  const canEdit = can('patients', 'edit')
  const [adding, setAdding] = useState(false)
  const [sv, setSv] = useState<{ type: ServiceType; date: string; activityId: string; note: string }>({ type: 'consultation', date: new Date().toISOString().slice(0, 10), activityId: '', note: '' })
  const acts = s.activities.filter((a) => a.officeId === b.officeId).sort((x, y) => y.date.localeCompare(x.date))
  const services = [...b.services].sort((x, y) => y.date.localeCompare(x.date))
  return (
    <Modal open onClose={onClose} wide title={b.name[lang]}>
      <div className="mb-4 grid gap-3 text-[14px] sm:grid-cols-3">
        {(
          [
            [ar ? 'رقم الملف' : 'File no.', <span className="num">{b.no}</span>],
            [ar ? 'النوع والعمر' : 'Gender & age', `${b.gender === 'f' ? (ar ? 'أنثى' : 'Female') : ar ? 'ذكر' : 'Male'} · ${ageOf(b)} ${ar ? 'سنة' : 'yrs'}`],
            [ar ? 'المكتب' : 'Office', s.offices.find((o) => o.id === b.officeId)?.name[lang]],
            [ar ? 'المحلية / المعسكر' : 'Locality / camp', b.locality || '—'],
            [ar ? 'الهاتف' : 'Phone', canEdit ? <span className="num" dir="ltr">{b.phone ?? '—'}</span> : <span className="text-muted">{ar ? 'محجوب' : 'Hidden'}</span>],
            [ar ? 'تاريخ التسجيل' : 'Registered', date(b.registeredAt, lang)],
          ] as [string, React.ReactNode][]
        ).map(([k, v]) => (
          <div key={k} className="rounded-md bg-paper px-3 py-2">
            <div className="text-[12px] text-muted">{k}</div>
            <div className="font-medium">{v}</div>
          </div>
        ))}
      </div>
      {b.displaced && (
        <div className="mb-4 rounded-md bg-amber-soft px-3 py-2 text-[13.5px] text-amber">{ar ? 'نازح — يُحتسب ضمن فئة النازحين في تقرير المقر الشهري.' : 'Displaced — counted in the displaced group in the monthly HQ report.'}</div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-kufi text-[15px] font-semibold">{ar ? 'سجل الخدمات' : 'Service history'}</h3>
        {canEdit && !adding && (
          <Button variant="quiet" onClick={() => setAdding(true)}>
            <Plus size={15} /> {ar ? 'تسجيل خدمة' : 'Record a service'}
          </Button>
        )}
      </div>
      {adding && (
        <div className="mb-3 grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
          <Field label={ar ? 'الخدمة' : 'Service'}>
            <select className={inputCls} value={sv.type} onChange={(e) => setSv({ ...sv, type: e.target.value as ServiceType })}>
              {Object.entries(serviceName).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'التاريخ' : 'Date'}>
            <input type="date" className={inputCls} value={sv.date} onChange={(e) => setSv({ ...sv, date: e.target.value })} />
          </Field>
          <Field label={ar ? 'ضمن نشاط ميداني (اختياري)' : 'Part of a field activity (optional)'} hint={ar ? 'يربط الخدمة بالمشروع والبند الذي موّلها' : 'Links the service to the project line that funded it'}>
            <select className={inputCls} value={sv.activityId} onChange={(e) => setSv({ ...sv, activityId: e.target.value })}>
              <option value="">{ar ? '— خدمة في المكتب —' : '— Office visit —'}</option>
              {acts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.title[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'ملاحظة' : 'Note'}>
            <input className={inputCls} value={sv.note} onChange={(e) => setSv({ ...sv, note: e.target.value })} />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              onClick={() => {
                s.addService(b.id, { type: sv.type, date: new Date(sv.date).toISOString(), activityId: sv.activityId || undefined, officeId: b.officeId, note: sv.note || undefined })
                setAdding(false)
              }}
            >
              {ar ? 'حفظ الخدمة' : 'Save service'}
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-line rounded-md border border-line">
        {services.map((x) => {
          const a = x.activityId ? s.activities.find((y) => y.id === x.activityId) : undefined
          const p = a ? s.projects.find((y) => y.id === a.projectId) : undefined
          return (
            <li key={x.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-[14px]">
              <HeartPulse size={16} className="mt-0.5 text-crescent" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{serviceName[x.type][lang]}</div>
                {a ? (
                  <Link to={`/activities/${a.id}`} className="text-[12.5px] text-nile underline" onClick={onClose}>
                    {a.code} — {a.title[lang]}
                    {p ? ` · ${p.name[lang]}` : ''}
                  </Link>
                ) : (
                  <div className="text-[12.5px] text-muted">{ar ? 'زيارة للمكتب' : 'Office visit'}</div>
                )}
                {x.note && <div className="text-[12.5px] text-muted">{x.note}</div>}
              </div>
              <div className="text-[12.5px] text-muted">{date(x.date, lang)}</div>
            </li>
          )
        })}
        {services.length === 0 && <li className="px-3 py-6 text-center text-muted">{ar ? 'لم تُسجّل خدمات بعد.' : 'No services recorded yet.'}</li>}
      </ul>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button variant="quiet" onClick={() => onEdit(b)}>
            {ar ? 'تعديل البيانات' : 'Edit details'}
          </Button>
        </div>
      )}
    </Modal>
  )
}

function RegisterModal({ initial, onClose, onOpen }: { initial: Beneficiary; onClose: () => void; onOpen: (b: Beneficiary) => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { scopeOffice } = usePerm()
  const [b, setB] = useState<Beneficiary>(initial)
  const [firstService, setFirstService] = useState<ServiceType | ''>(initial.id ? '' : 'consultation')
  const dups = useMemo(() => possibleDuplicates(s.beneficiaries, b), [s.beneficiaries, b])
  const isNew = !initial.id
  const valid = (b.name.ar.trim() || b.name.en.trim()) && b.birthYear > 1900 && b.birthYear <= THIS_YEAR
  const save = () => {
    let out = b
    if (isNew) {
      const seq = s.beneficiaries.length + 1300
      out = {
        ...b,
        id: `b-${Date.now()}`,
        no: `BEN-${b.officeId.toUpperCase()}-${String(seq * 3).padStart(5, '0')}`,
        name: { ar: b.name.ar || b.name.en, en: b.name.en || b.name.ar },
        services: firstService ? [{ id: `sv-${Date.now()}`, date: new Date().toISOString(), type: firstService, officeId: b.officeId }] : [],
      }
    }
    s.saveBeneficiary(out)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={isNew ? (ar ? 'تسجيل مستفيد جديد' : 'Register a new beneficiary') : ar ? 'تعديل بيانات المستفيد' : 'Edit beneficiary'}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={ar ? 'الاسم بالعربية' : 'Name (Arabic)'}>
          <input className={inputCls} dir="rtl" value={b.name.ar} onChange={(e) => setB({ ...b, name: { ...b.name, ar: e.target.value } })} />
        </Field>
        <Field label={ar ? 'الاسم بالإنجليزية' : 'Name (English)'}>
          <input className={inputCls} dir="ltr" value={b.name.en} onChange={(e) => setB({ ...b, name: { ...b.name, en: e.target.value } })} />
        </Field>
        <Field label={ar ? 'النوع' : 'Gender'}>
          <select className={inputCls} value={b.gender} onChange={(e) => setB({ ...b, gender: e.target.value as 'm' | 'f' })}>
            <option value="f">{ar ? 'أنثى' : 'Female'}</option>
            <option value="m">{ar ? 'ذكر' : 'Male'}</option>
          </select>
        </Field>
        <Field label={ar ? 'سنة الميلاد (تقريبية مقبولة)' : 'Year of birth (approximate is fine)'}>
          <input type="number" className={`${inputCls} num`} value={b.birthYear} onChange={(e) => setB({ ...b, birthYear: +e.target.value })} />
        </Field>
        <Field label={ar ? 'المكتب' : 'Office'}>
          <select className={inputCls} value={b.officeId} disabled={!!scopeOffice} onChange={(e) => setB({ ...b, officeId: e.target.value })}>
            {s.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? 'المحلية / المعسكر' : 'Locality / camp'}>
          <input className={inputCls} value={b.locality} onChange={(e) => setB({ ...b, locality: e.target.value })} />
        </Field>
        <Field label={ar ? 'الهاتف (اختياري)' : 'Phone (optional)'}>
          <input className={`${inputCls} num`} dir="ltr" value={b.phone ?? ''} onChange={(e) => setB({ ...b, phone: e.target.value || undefined })} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[14px]">
          <input type="checkbox" className="size-4 accent-crescent" checked={b.displaced} onChange={(e) => setB({ ...b, displaced: e.target.checked })} />
          {ar ? 'نازح' : 'Displaced'}
        </label>
        {isNew && (
          <Field label={ar ? 'الخدمة المقدّمة اليوم' : 'Service given today'}>
            <select className={inputCls} value={firstService} onChange={(e) => setFirstService(e.target.value as ServiceType | '')}>
              <option value="">{ar ? '— تسجيل فقط —' : '— Register only —'}</option>
              {Object.entries(serviceName).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {dups.length > 0 && (
        <div className="mt-4 rounded-md bg-amber-soft px-3 py-2.5 text-[13.5px] text-amber" role="alert">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} />
            {ar ? 'قد يكون هذا الشخص مسجلاً من قبل:' : 'This person may already be registered:'}
          </div>
          <ul className="mt-1.5 space-y-1">
            {dups.slice(0, 4).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {d.name[lang]} · <span className="num">{d.birthYear}</span> · {s.offices.find((o) => o.id === d.officeId)?.name[lang]} · <span className="num">{d.no}</span>
                </span>
                <button className="font-medium underline" onClick={() => onOpen(d)}>
                  {ar ? 'فتح ملفه بدلاً من التسجيل' : 'Open their file instead'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button disabled={!valid} onClick={save}>
          {isNew ? (dups.length ? (ar ? 'تسجيل على أي حال' : 'Register anyway') : ar ? 'تسجيل' : 'Register') : ar ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}

function Bars({ rows, color = 'bg-nile' }: { rows: [string, number][]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  const total = rows.reduce((n, r) => n + r[1], 0) || 1
  return (
    <ul className="space-y-2.5 px-5 py-4">
      {rows.map(([k, v]) => (
        <li key={k} className="text-[13.5px]">
          <div className="mb-1 flex justify-between gap-2">
            <span>{k}</span>
            <span className="num text-muted">
              {num(v)} · {Math.round((v / total) * 100)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-paper">
            <div className={`h-2 rounded-full ${color}`} style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PatientStats() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { scopeOffice } = usePerm()
  const [office, setOffice] = useState(scopeOffice ?? '')
  const list = s.beneficiaries.filter((b) => !office || b.officeId === office)
  const services = list.flatMap((b) => b.services)

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setDate(15)
    d.setMonth(d.getMonth() - (5 - i))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const trend = months.map((m) => ({
    m,
    services: services.filter((x) => x.date.slice(0, 7) === m).length,
    newReg: list.filter((b) => b.registeredAt.slice(0, 7) === m).length,
  }))
  const tmax = Math.max(1, ...trend.map((t) => t.services))
  const ages: [string, (a: number) => boolean][] = [
    [ar ? 'أقل من 5 سنوات' : 'Under 5', (a) => a < 5],
    [ar ? '5 – 14' : '5 – 14', (a) => a >= 5 && a < 15],
    [ar ? '15 – 49' : '15 – 49', (a) => a >= 15 && a < 50],
    [ar ? '50 فأكثر' : '50 and over', (a) => a >= 50],
  ]
  const byOffice = s.offices
    .map((o) => [o.name[lang], s.beneficiaries.filter((b) => b.officeId === o.id).length] as [string, number])
    .filter((r) => r[1] > 0)
    .sort((a, b) => b[1] - a[1])
  const f = list.filter((b) => b.gender === 'f').length

  return (
    <div>
      <PageHeader
        title={ar ? 'إحصاءات المستفيدين' : 'Beneficiary statistics'}
        sub={ar ? 'الأرقام نفسها التي تدخل في تقرير المقر الشهري — مصنّفة حسب النوع والعمر والمكتب والخدمة.' : 'The same figures that go into the monthly HQ report — broken down by gender, age, office and service.'}
        actions={
          !scopeOffice && (
            <select className={selCls} value={office} onChange={(e) => setOffice(e.target.value)} aria-label={ar ? 'المكتب' : 'Office'}>
              <option value="">{ar ? 'كل المكاتب' : 'All offices'}</option>
              {s.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name[lang]}
                </option>
              ))}
            </select>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            [ar ? 'مستفيدون' : 'Beneficiaries', num(list.length)],
            [ar ? 'خدمات مقدّمة' : 'Services delivered', num(services.length)],
            [ar ? 'نسبة الإناث' : 'Female share', `${list.length ? Math.round((f / list.length) * 100) : 0}%`],
            [ar ? 'نسبة النازحين' : 'Displaced share', `${list.length ? Math.round((list.filter((b) => b.displaced).length / list.length) * 100) : 0}%`],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-surface p-4">
            <div className="text-[13px] text-muted">{k}</div>
            <div className="num mt-1 font-kufi text-[24px] font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={ar ? 'الخدمات خلال آخر 6 أشهر' : 'Services over the last 6 months'}>
          <div className="flex h-52 items-end gap-3 px-5 pt-6 pb-3">
            {trend.map((t) => (
              <div key={t.m} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="num text-[12px] text-muted">{t.services}</span>
                <div className="w-full max-w-12 rounded-t bg-crescent/85" style={{ height: `${(t.services / tmax) * 140}px`, minHeight: 2 }} title={`${t.services}`} />
                <span className="text-[12px] text-muted">{new Date(t.m + '-01').toLocaleDateString(ar ? 'ar' : 'en', { month: 'short' })}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-5 py-2.5 text-[12.5px] text-muted">
            {ar ? 'تسجيلات جديدة هذا الشهر:' : 'New registrations this month:'} <span className="num font-medium text-ink">{trend[5].newReg}</span>
          </div>
        </Panel>
        <Panel title={ar ? 'حسب نوع الخدمة' : 'By service type'}>
          <Bars rows={(Object.keys(serviceName) as ServiceType[]).map((k) => [serviceName[k][lang], services.filter((x) => x.type === k).length] as [string, number]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1])} color="bg-crescent" />
        </Panel>
        <Panel title={ar ? 'حسب الفئة العمرية' : 'By age group'}>
          <Bars rows={ages.map(([k, fn]) => [k, list.filter((b) => fn(ageOf(b))).length])} />
        </Panel>
        <Panel title={ar ? 'حسب النوع' : 'By gender'}>
          <Bars
            rows={[
              [ar ? 'إناث' : 'Female', f],
              [ar ? 'ذكور' : 'Male', list.length - f],
            ]}
            color="bg-leaf"
          />
        </Panel>
        {!office && (
          <Panel title={ar ? 'حسب المكتب' : 'By office'} className="lg:col-span-2">
            <Bars rows={byOffice} />
          </Panel>
        )}
      </div>
    </div>
  )
}
