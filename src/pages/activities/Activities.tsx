import { CalendarDays, Camera, Check, Circle, ClipboardList, FilePlus2, MapPin, Plus, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Field, inputCls, Modal, PageHeader, Panel, StatusBadge, UsageBar } from '../../components/ui'
import { activityTypes } from '../../data/finance'
import type { FieldActivity } from '../../data/types'
import { activityMoney, activityStatus, statusName, statusTone, type ActivityStatus } from '../../lib/activities'
import { findLine, lineUsage } from '../../lib/budget'
import { date, num, relDays, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

export function StatusPill({ st }: { st: ActivityStatus }) {
  const lang = useLang()
  return <span className={`inline-flex rounded px-2 py-0.5 text-[12.5px] font-medium whitespace-nowrap ${statusTone[st]}`}>{statusName[st][lang]}</span>
}

export function Activities() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, scopeOffice } = usePerm()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [office, setOffice] = useState(scopeOffice ?? '')
  const [status, setStatus] = useState<ActivityStatus | ''>((params.get('status') as ActivityStatus) || '')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (params.get('new')) {
      setCreating(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const rows = useMemo(
    () =>
      s.activities
        .filter((a) => (!scopeOffice || a.officeId === scopeOffice) && (!office || a.officeId === office))
        .map((a) => ({ a, st: activityStatus(a, s) }))
        .sort((x, y) => +new Date(y.a.date) - +new Date(x.a.date)),
    [s, office, scopeOffice],
  )
  const counts = rows.reduce((m, r) => ((m[r.st] = (m[r.st] ?? 0) + 1), m), {} as Record<string, number>)
  const shown = rows.filter((r) => (!status || r.st === status) && (!q || r.a.code.toLowerCase().includes(q.toLowerCase()) || r.a.title[lang].includes(q)))
  const order: ActivityStatus[] = ['planned', 'awaiting_report', 'report_overdue', 'reported', 'unfunded', 'matched']

  return (
    <div>
      <PageHeader
        title={ar ? 'الأنشطة الميدانية' : 'Field activities'}
        sub={
          ar
            ? 'كل نشاط يُنشأ قبل التنفيذ ويأخذ رقماً. طلب الصرف والعهدة والتقرير الفني تحمل الرقم نفسه، فيلتقي الفني بالمالي تلقائياً مهما اختلف توقيت كل منهما.'
            : 'Every activity is created before the work and gets a number. The spend request, advance and field report all carry it, so the technical and financial sides meet automatically whatever their timing.'
        }
        actions={
          can('activities', 'edit') && (
            <>
              <Button variant="quiet" onClick={() => nav('/activities/report')}>
                <FilePlus2 size={16} /> {ar ? 'رفع تقرير فني' : 'Submit field report'}
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> {ar ? 'نشاط جديد' : 'New activity'}
              </Button>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip on={!status} onClick={() => setStatus('')} label={ar ? 'الكل' : 'All'} n={rows.length} />
        {order.map((k) => (
          <Chip key={k} on={status === k} onClick={() => setStatus(k)} label={statusName[k][lang]} n={counts[k] ?? 0} tone={k === 'report_overdue' || k === 'unfunded' ? 'bad' : undefined} />
        ))}
      </div>
      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} ps-9`} placeholder={ar ? 'ابحث برقم النشاط أو اسمه' : 'Search by number or name'} value={q} onChange={(e) => setQ(e.target.value)} />
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
        </div>
        {shown.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ClipboardList className="mx-auto text-muted" />
            <p className="mt-2 font-medium">{ar ? 'لا توجد أنشطة بهذه الحالة.' : 'No activities with this status.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12.5px] text-muted">
                  <th className="px-5 py-2.5 text-start font-medium">{ar ? 'النشاط' : 'Activity'}</th>
                  <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'المكتب' : 'Office'}</th>
                  <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'المخطط' : 'Planned'}</th>
                  <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'المستفيدون' : 'Beneficiaries'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map(({ a, st }) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-paper" onClick={() => nav(`/activities/${a.id}`)}>
                    <td className="px-5 py-2.5">
                      <div className="num text-[12.5px] text-muted">
                        {a.code}
                        {a.type && ` — ${activityTypes[a.type][lang]}`}
                      </div>
                      <Link to={`/activities/${a.id}`} className="font-medium hover:text-nile" onClick={(e) => e.stopPropagation()}>
                        {a.title[lang]}
                      </Link>
                    </td>
                    <td className="py-2.5 pe-3">{s.offices.find((o) => o.id === a.officeId)?.name[lang]}</td>
                    <td className="num py-2.5 pe-3 whitespace-nowrap">
                      {date(a.date, lang)}
                      <span className="block text-[12px] text-muted">{relDays(a.date, lang)}</span>
                    </td>
                    <td className="num py-2.5 pe-3 text-end">{a.plannedUSD ? usd(a.plannedUSD) : '—'}</td>
                    <td className="num py-2.5 pe-3 text-end">{a.report ? num(a.report.beneficiaries) : <span className="text-muted">—</span>}</td>
                    <td className="px-5 py-2.5">
                      <StatusPill st={st} />
                      {a.report?.via === 'offline' && <span className="ms-1.5 text-[11.5px] text-muted">{ar ? 'أُرسل دون اتصال' : 'sent offline'}</span>}
                      {a.report?.via === 'excel' && <span className="ms-1.5 text-[11.5px] text-muted">Excel</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {creating && <ActivityModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function Chip({ on, onClick, label, n, tone }: { on: boolean; onClick: () => void; label: string; n: number; tone?: 'bad' }) {
  return (
    <button onClick={onClick} className={`h-9 rounded-md px-3 text-[13.5px] ${on ? 'bg-nile text-white' : 'border border-line bg-surface text-muted hover:text-ink'}`}>
      {label} <span className={`num ${!on && tone === 'bad' && n ? 'font-semibold text-crescent' : 'opacity-70'}`}>{n}</span>
    </button>
  )
}

export function ActivityModal({ onClose, initial }: { onClose: () => void; initial?: FieldActivity }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { scopeOffice, user } = usePerm()
  const nav = useNavigate()
  const [d, setD] = useState<FieldActivity>(
    initial ?? {
      id: '',
      code: '',
      officeId: scopeOffice ?? user.officeId,
      projectId: s.projects[0].id,
      lineId: s.projects[0].pillars[0].lines[0].id,
      title: { ar: '', en: '' },
      date: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      type: 'medical_day',
      location: '',
      plannedUSD: 0,
    },
  )
  const project = s.projects.find((p) => p.id === d.projectId)!
  const lu = findLine(s.projects, d.lineId) ? lineUsage(findLine(s.projects, d.lineId)!.line, s) : null
  const valid = (d.title.ar || d.title.en).trim().length > 2
  const save = (andRequest: boolean) => {
    const office = s.offices.find((o) => o.id === d.officeId)!
    const prefix = office.id.toUpperCase().slice(0, 3)
    const n = s.activities.filter((a) => a.officeId === d.officeId).length + 140
    const code = d.code || `ACT-${prefix}-${String(n).padStart(4, '0')}`
    const a = { ...d, id: d.id || `act-${Date.now().toString(36)}`, code, title: { ar: d.title.ar || d.title.en, en: d.title.en || d.title.ar }, createdBy: s.userId }
    s.saveActivity(a)
    onClose()
    if (andRequest) nav(`/requests/new?project=${a.projectId}&line=${a.lineId}&activity=${a.code}&amount=${a.plannedUSD ?? ''}`)
    else nav(`/activities/${a.id}`)
  }
  return (
    <Modal open onClose={onClose} title={initial ? (ar ? 'تعديل النشاط' : 'Edit activity') : ar ? 'نشاط جديد' : 'New activity'} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Field label={ar ? 'عنوان النشاط' : 'Activity title'}>
            <input className={inputCls} value={d.title[lang]} onChange={(e) => setD({ ...d, title: { ...d.title, [lang]: e.target.value } })} placeholder={ar ? 'مثال: يوم علاجي متنقل — قرية ود شريفي' : 'e.g. Mobile medical day — Wad Sharifey'} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? 'النوع' : 'Type'}>
              <select className={inputCls} value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as FieldActivity['type'] })}>
                {Object.entries(activityTypes).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'التاريخ المخطط' : 'Planned date'}>
              <input type="date" className={`${inputCls} num`} value={d.date.slice(0, 10)} onChange={(e) => e.target.value && setD({ ...d, date: new Date(e.target.value).toISOString() })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={ar ? 'المكتب' : 'Office'}>
              <select className={inputCls} value={d.officeId} disabled={!!scopeOffice} onChange={(e) => setD({ ...d, officeId: e.target.value })}>
                {s.offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'المكان' : 'Location'}>
              <input className={inputCls} value={d.location ?? ''} onChange={(e) => setD({ ...d, location: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="space-y-4">
          <Field label={ar ? 'المشروع' : 'Project'}>
            <select
              className={inputCls}
              value={d.projectId}
              onChange={(e) => {
                const p = s.projects.find((x) => x.id === e.target.value)!
                setD({ ...d, projectId: p.id, lineId: p.pillars[0].lines[0].id })
              }}
            >
              {s.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'بند الميزانية' : 'Budget line'}>
            <select className={inputCls} value={d.lineId} onChange={(e) => setD({ ...d, lineId: e.target.value })}>
              {project.pillars.map((pl) => (
                <optgroup key={pl.id} label={`${pl.code}. ${pl.name[lang]}`}>
                  {pl.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} {l.name[lang]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          {lu && (
            <div>
              <UsageBar u={lu} incoming={d.plannedUSD ?? 0} height={8} />
              <div className="num mt-1 text-[12.5px] text-muted">
                {ar ? 'المتاح على البند' : 'Available on line'} {usd(lu.available)}
              </div>
            </div>
          )}
          <Field label={ar ? 'التكلفة المخططة (دولار)' : 'Planned cost (USD)'}>
            <input type="number" min={0} className={`${inputCls} num`} value={d.plannedUSD || ''} onChange={(e) => setD({ ...d, plannedUSD: Math.max(0, +e.target.value) })} />
          </Field>
          <label className="flex items-start gap-2 text-[13.5px]">
            <input type="checkbox" className="mt-1 size-4" checked={!!d.inKind} onChange={(e) => setD({ ...d, inKind: e.target.checked })} />
            <span>
              {ar ? 'يُنفذ بمواد عينية فقط (من المخزن)' : 'Done with in-kind supplies only (from stores)'}
              <span className="block text-[12px] text-muted">{ar ? 'لن يُنتظر له صرف نقدي في المطابقة.' : 'No cash spending will be expected for matching.'}</span>
            </span>
          </label>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        {!initial && !d.inKind && (
          <Button variant="quiet" disabled={!valid} onClick={() => save(true)}>
            {ar ? 'حفظ وإنشاء طلب صرف' : 'Save and create spend request'}
          </Button>
        )}
        <Button disabled={!valid} onClick={() => save(false)}>
          {ar ? 'حفظ النشاط' : 'Save activity'}
        </Button>
      </div>
    </Modal>
  )
}

export function ActivityDetail() {
  const { id } = useParams()
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can } = usePerm()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const a = s.activities.find((x) => x.id === id)
  if (!a) return <p>{ar ? 'النشاط غير موجود' : 'Activity not found'}</p>
  const st = activityStatus(a, s)
  const m = activityMoney(a, s)
  const f = findLine(s.projects, a.lineId)
  const lu = f ? lineUsage(f.line, s) : null
  const office = s.offices.find((o) => o.id === a.officeId)
  const settledAdv = m.advances.find((x) => x.status === 'settled')
  const actual = settledAdv?.settlement ? settledAdv.settlement.items.reduce((t, i) => t + i.amountUSD, 0) : m.spent || a.report?.actualUSD
  const variance = actual !== undefined && a.plannedUSD ? (actual - a.plannedUSD) / a.plannedUSD : null

  const steps: { done: boolean; title: string; body: ReactNode }[] = [
    {
      done: true,
      title: ar ? 'التخطيط' : 'Planned',
      body: (
        <>
          {f && (
            <span>
              {f.project.code} — {f.line.code} {f.line.name[lang]}
            </span>
          )}
          {a.plannedUSD ? <span className="num"> — {usd(a.plannedUSD)}</span> : null}
        </>
      ),
    },
    {
      done: m.funded || !!a.inKind,
      title: ar ? 'التمويل' : 'Funding',
      body: a.inKind ? (
        ar ? 'مواد عينية من المخزن' : 'In-kind supplies from stores'
      ) : m.funded ? (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {m.requests.map((r) => (
            <Link key={r.id} to={`/requests/${r.id}`} className="num inline-flex items-center gap-1.5 text-nile hover:underline">
              {r.code} <StatusBadge status={r.status} />
            </Link>
          ))}
          {m.advances.map((x) => (
            <Link key={x.id} to="/finance/advances" className="num text-nile hover:underline">
              {x.no} ({x.status === 'open' ? (ar ? 'عهدة مفتوحة' : 'open advance') : ar ? 'سُوّيت' : 'settled'}) {usd(x.amountUSD)}
            </Link>
          ))}
        </span>
      ) : (
        <span className="text-muted">{ar ? 'لم يُطلب صرف بعد' : 'No spend requested yet'}</span>
      ),
    },
    {
      done: +new Date(a.date) <= Date.now() || !!a.report,
      title: ar ? 'التنفيذ' : 'Carried out',
      body: (
        <span className="num">
          {date(a.report?.doneOn ?? a.date, lang)} — {a.location}
        </span>
      ),
    },
    {
      done: !!a.report,
      title: ar ? 'التقرير الفني' : 'Field report',
      body: a.report ? (
        <span>
          <span className="num">{a.report.no}</span> — {date(a.report.submittedAt, lang)}
        </span>
      ) : (
        <span className={st === 'report_overdue' ? 'text-crescent' : 'text-muted'}>{st === 'report_overdue' ? (ar ? 'متأخر — مرّت 5 أيام على التنفيذ' : 'Overdue — 5 days since the activity') : ar ? 'لم يُرفع بعد' : 'Not submitted yet'}</span>
      ),
    },
    {
      done: st === 'matched',
      title: ar ? 'المطابقة' : 'Matched',
      body:
        st === 'matched' ? (
          <span className="text-leaf">{ar ? 'التقرير الفني والمصروف مرتبطان' : 'Field report and spending are linked'}</span>
        ) : st === 'unfunded' ? (
          <Link to="/reconciliation" className="text-amber hover:underline">
            {ar ? 'تقرير بلا صرف مرتبط — افتح المطابقة' : 'Report with no linked spending — open matching'}
          </Link>
        ) : m.advances.some((x) => x.status === 'open') && a.report ? (
          <Link to="/finance/advances" className="text-nile hover:underline">
            {ar ? 'العهدة جاهزة للتسوية' : 'Advance ready to settle'}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ]

  return (
    <div>
      <div className="mb-2 text-[13px]">
        <Link to="/activities" className="text-muted hover:text-nile">
          {ar ? 'الأنشطة' : 'Activities'}
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a.title[lang]} <StatusPill st={st} />
          </span>
        }
        sub={
          <span className="num">
            {a.code}
            {ar ? '، ' : ', '}
            {office?.name[lang]}
            {a.type && (ar ? '، ' : ', ') + activityTypes[a.type][lang]}
          </span>
        }
        actions={
          can('activities', 'edit') && (
            <>
              <Button variant="quiet" onClick={() => setEditing(true)}>
                {ar ? 'تعديل' : 'Edit'}
              </Button>
              {!m.funded && !a.inKind && can('projects', 'edit') && (
                <Button variant="quiet" onClick={() => nav(`/requests/new?project=${a.projectId}&line=${a.lineId}&activity=${a.code}&amount=${a.plannedUSD ?? ''}`)}>
                  {ar ? 'طلب صرف لهذا النشاط' : 'Spend request for this activity'}
                </Button>
              )}
              {!a.report && (
                <Button onClick={() => nav(`/activities/report?activity=${a.id}`)}>
                  <FilePlus2 size={16} /> {ar ? 'رفع التقرير الفني' : 'Submit field report'}
                </Button>
              )}
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Panel title={ar ? 'مسار النشاط' : 'Activity path'}>
          <ol className="p-5">
            {steps.map((x, i) => (
              <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                {i < steps.length - 1 && <span className={`absolute top-7 bottom-0 w-px ${x.done ? 'bg-leaf/50' : 'bg-line'}`} style={{ insetInlineStart: 13 }} />}
                <span className={`z-10 grid size-7 shrink-0 place-items-center rounded-full ${x.done ? 'bg-leaf text-white' : 'bg-paper text-muted ring-1 ring-line'}`}>
                  {x.done ? <Check size={14} /> : <Circle size={9} />}
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="text-[14px] font-medium">{x.title}</div>
                  <div className="text-[13.5px]">{x.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="space-y-6">
          {a.report ? (
            <Panel title={`${ar ? 'التقرير الفني' : 'Field report'} ${a.report.no}`}>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  {(
                    [
                      [ar ? 'رجال' : 'Men', a.report.men],
                      [ar ? 'نساء' : 'Women', a.report.women],
                      [ar ? 'أطفال' : 'Children', a.report.children],
                    ] as [string, number | undefined][]
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-md bg-paper py-3">
                      <div className="num font-kufi text-[20px] font-semibold">{num(v ?? 0)}</div>
                      <div className="text-[12.5px] text-muted">{k}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4">{a.report.summary[lang]}</p>
                {a.report.issues && (
                  <p className="mt-2 rounded-md bg-amber-soft px-3 py-2 text-[13.5px]">
                    <b>{ar ? 'ملاحظات: ' : 'Issues: '}</b>
                    {a.report.issues}
                  </p>
                )}
                {!!a.report.photos?.length && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {a.report.photos.map((p, i) => (
                      <button key={i} onClick={() => setPhoto(p)} className="aspect-square overflow-hidden rounded-md ring-1 ring-line">
                        <img src={p} alt="" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="num mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={13} /> {date(a.report.submittedAt, lang)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={13} /> {s.users.find((u) => u.id === a.report!.submittedBy)?.name[lang] ?? '—'}
                  </span>
                  {a.report.lat && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={13} /> {a.report.lat.toFixed(3)}, {a.report.lon?.toFixed(3)}
                    </span>
                  )}
                  {!!a.report.photos?.length && (
                    <span className="inline-flex items-center gap-1">
                      <Camera size={13} /> {a.report.photos.length}
                    </span>
                  )}
                </div>
              </div>
            </Panel>
          ) : (
            <Panel className="p-6 text-center">
              <p className="font-medium">{ar ? 'لم يُرفع التقرير الفني بعد.' : 'No field report yet.'}</p>
              <p className="mt-1 text-[13.5px] text-muted">{ar ? 'التقرير مطلوب خلال 5 أيام من التنفيذ.' : 'A report is due within 5 days of the activity.'}</p>
            </Panel>
          )}

          <Panel title={ar ? 'المال المرتبط بالنشاط' : 'Money linked to this activity'}>
            <dl className="num grid grid-cols-3 gap-3 p-5 text-[14px]">
              <div>
                <dt className="text-[12.5px] text-muted">{ar ? 'المخطط' : 'Planned'}</dt>
                <dd className="font-semibold">{a.plannedUSD ? usd(a.plannedUSD) : '—'}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-muted">{ar ? 'الفعلي' : 'Actual'}</dt>
                <dd className="font-semibold">{actual !== undefined ? usd(actual) : '—'}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-muted">{ar ? 'الفرق' : 'Variance'}</dt>
                <dd className={`font-semibold ${variance !== null && Math.abs(variance) > 0.1 ? 'text-amber' : ''}`}>{variance !== null ? `${variance > 0 ? '+' : ''}${Math.round(variance * 100)}%` : '—'}</dd>
              </div>
            </dl>
            {lu && f && (
              <div className="border-t border-line px-5 py-4">
                <div className="mb-1.5 flex justify-between text-[12.5px] text-muted">
                  <span>
                    {f.line.code} {f.line.name[lang]}
                  </span>
                  <span className="num">
                    {ar ? 'متاح' : 'available'} {usd(lu.available)}
                  </span>
                </div>
                <UsageBar u={lu} height={8} />
              </div>
            )}
          </Panel>
        </div>
      </div>
      {editing && <ActivityModal initial={a} onClose={() => setEditing(false)} />}
      {photo && (
        <Modal open onClose={() => setPhoto(null)} title={ar ? 'صورة من الميدان' : 'Field photo'} wide>
          <img src={photo} alt="" className="mx-auto max-h-[70vh] rounded-md" />
        </Modal>
      )}
    </div>
  )
}
