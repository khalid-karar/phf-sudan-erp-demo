import { BellRing, Check, ChevronLeft, ChevronRight, Plus, Repeat, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import type { Deadline } from '../../data/types'
import { date, daysUntil, relDays } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

interface CalItem {
  id: string
  at: Date
  title: string
  kind: 'deadline' | 'activity' | 'advance'
  link: string
  deadline?: Deadline
  late?: boolean
}

const recurName = {
  none: { ar: 'مرة واحدة', en: 'Once' },
  monthly: { ar: 'شهرياً', en: 'Monthly' },
  quarterly: { ar: 'كل ربع سنة', en: 'Quarterly' },
  yearly: { ar: 'سنوياً', en: 'Yearly' },
}

function occurrences(d: Deadline, from: Date, to: Date) {
  const out: Date[] = []
  const step = d.recurrence === 'monthly' ? 1 : d.recurrence === 'quarterly' ? 3 : d.recurrence === 'yearly' ? 12 : 0
  const first = new Date(d.due)
  if (!step) return first >= from && first <= to ? [first] : []
  for (let i = 0; i < 60; i++) {
    const x = new Date(first.getFullYear(), first.getMonth() + i * step, first.getDate())
    if (x > to) break
    if (x >= from) out.push(x)
  }
  return out
}

export function Calendar() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, viewOffice } = usePerm()
  const canEdit = can('alerts', 'edit') || can('reports', 'edit')
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [edit, setEdit] = useState<Deadline | null>(null)
  const [show, setShow] = useState({ deadline: true, activity: true, advance: true })

  const monthStart = cursor
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59)
  const items = useMemo(() => {
    const out: CalItem[] = []
    for (const d of s.deadlines)
      for (const at of occurrences(d, monthStart, monthEnd))
        out.push({ id: `${d.id}-${+at}`, at, title: d.title[lang], kind: 'deadline', link: '/alerts/calendar', deadline: d, late: !d.done && +at < Date.now() })
    for (const a of s.activities) {
      if (viewOffice && a.officeId !== viewOffice) continue
      const at = new Date(a.date)
      if (at >= monthStart && at <= monthEnd) out.push({ id: a.id, at, title: `${a.code} ${a.title[lang]}`, kind: 'activity', link: `/activities/${a.id}` })
    }
    for (const x of s.advances) {
      if (x.status !== 'open' || (viewOffice && x.officeId !== viewOffice)) continue
      const at = new Date(x.dueAt)
      if (at >= monthStart && at <= monthEnd) out.push({ id: x.id, at, title: ar ? `تسوية ${x.no}` : `Settle ${x.no}`, kind: 'advance', link: '/finance/advances', late: +at < Date.now() })
    }
    return out.filter((i) => show[i.kind])
  }, [s.deadlines, s.activities, s.advances, monthStart, monthEnd, lang, ar, viewOffice, show])

  // Grid starts on the organisation's chosen week start.
  const ws = { sat: 6, sun: 0, mon: 1 }[s.org.weekStartsOn]
  const lead = (monthStart.getDay() - ws + 7) % 7
  const daysIn = monthEnd.getDate()
  const cells = Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, i) => {
    const day = i - lead + 1
    return day >= 1 && day <= daysIn ? day : null
  })
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(ar ? 'ar' : 'en-GB', { weekday: 'short' }).format(new Date(2024, 0, 7 + ((ws + i) % 7))))
  const monthLabel = new Intl.DateTimeFormat(ar ? 'ar-SD-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(cursor)
  const today = new Date()
  const tone = { deadline: 'bg-nile text-white', activity: 'bg-leaf-soft text-leaf', advance: 'bg-amber-soft text-amber' }

  const upcoming = s.deadlines
    .filter((d) => !d.done)
    .map((d) => ({ d, next: occurrences(d, new Date(Date.now() - 60 * 86_400_000), new Date(Date.now() + 400 * 86_400_000))[0] ?? new Date(d.due) }))
    .sort((a, b) => +a.next - +b.next)

  return (
    <div>
      <PageHeader
        title={ar ? 'تقويم المواعيد' : 'Deadline calendar'}
        sub={ar ? 'مواعيد تقارير المانحين والمقر والإقفال. يُنبَّه المسؤول قبل كل موعد بعدد الأيام الذي تحدده.' : 'Donor, headquarters and closing deadlines. The owner is reminded the number of days you set before each one.'}
        actions={
          canEdit && (
            <Button onClick={() => setEdit({ id: '', title: { ar: '', en: '' }, due: new Date(Date.now() + 14 * 86_400_000).toISOString(), notifyDaysBefore: 7, owner: 'finance_manager', recurrence: 'none' })}>
              <Plus size={16} /> {ar ? 'موعد جديد' : 'New deadline'}
            </Button>
          )
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-1">
              <button className="grid size-9 place-items-center rounded-md hover:bg-paper" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label={ar ? 'الشهر السابق' : 'Previous month'}>
                {ar ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
              <span className="min-w-36 text-center font-kufi text-[16px] font-semibold">{monthLabel}</span>
              <button className="grid size-9 place-items-center rounded-md hover:bg-paper" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label={ar ? 'الشهر التالي' : 'Next month'}>
                {ar ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>
              <button className="ms-1 h-8 rounded-md border border-line px-2.5 text-[12.5px] hover:border-nile-2" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
                {ar ? 'اليوم' : 'Today'}
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-[12.5px]">
              {(
                [
                  ['deadline', ar ? 'مواعيد التقارير' : 'Report deadlines'],
                  ['activity', ar ? 'الأنشطة' : 'Activities'],
                  ['advance', ar ? 'تسوية العهد' : 'Advance settlements'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="inline-flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} className="size-3.5" />
                  <span className={`inline-block size-2.5 rounded-[2px] ${tone[k].split(' ')[0]}`} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 border-b border-line text-center text-[12px] text-muted">
            {weekdays.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const isToday = day && today.getFullYear() === cursor.getFullYear() && today.getMonth() === cursor.getMonth() && today.getDate() === day
              const its = day ? items.filter((it) => it.at.getDate() === day) : []
              return (
                <div key={i} className={`min-h-[96px] border-b border-line p-1.5 ${i % 7 !== 6 ? 'border-e' : ''} ${day ? '' : 'bg-paper/60'}`}>
                  {day && (
                    <>
                      <div className={`num mb-1 grid size-6 place-items-center rounded-full text-[12px] ${isToday ? 'bg-crescent font-semibold text-white' : 'text-muted'}`}>{day}</div>
                      <div className="space-y-1">
                        {its.slice(0, 3).map((it) => (
                          <Link
                            key={it.id}
                            to={it.link}
                            onClick={(e) => {
                              if (it.deadline && canEdit) {
                                e.preventDefault()
                                setEdit(it.deadline)
                              }
                            }}
                            title={it.title}
                            className={`block truncate rounded px-1.5 py-0.5 text-[11.5px] leading-tight ${tone[it.kind]} ${it.late ? 'ring-2 ring-crescent' : ''}`}
                          >
                            {it.title}
                          </Link>
                        ))}
                        {its.length > 3 && <div className="px-1 text-[11px] text-muted">+{its.length - 3}</div>}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel title={ar ? 'المواعيد القادمة' : 'Upcoming deadlines'}>
          <ul className="divide-y divide-line">
            {upcoming.map(({ d, next }) => {
              const left = daysUntil(next.toISOString())
              const alerting = left <= d.notifyDaysBefore
              return (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <button className="text-start text-[14px] font-medium hover:text-nile" onClick={() => canEdit && setEdit(d)}>
                      {d.title[lang]}
                    </button>
                    {canEdit && (
                      <button
                        className="shrink-0 rounded p-1 text-muted hover:bg-leaf-soft hover:text-leaf"
                        title={ar ? 'تعليم كمنجز' : 'Mark done'}
                        onClick={() => {
                          if (d.recurrence && d.recurrence !== 'none') {
                            const step = d.recurrence === 'monthly' ? 1 : d.recurrence === 'quarterly' ? 3 : 12
                            const nx = new Date(next.getFullYear(), next.getMonth() + step, next.getDate())
                            s.saveDeadline({ ...d, due: nx.toISOString() })
                          } else s.saveDeadline({ ...d, done: true })
                        }}
                      >
                        <Check size={16} />
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                    <span className={`num ${left < 0 ? 'font-medium text-crescent' : left <= 3 ? 'text-amber' : ''}`}>
                      {date(next.toISOString(), lang)} — {relDays(next.toISOString(), lang)}
                    </span>
                    {d.recurrence && d.recurrence !== 'none' && (
                      <span className="inline-flex items-center gap-1">
                        <Repeat size={12} /> {recurName[d.recurrence][lang]}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 ${alerting ? 'text-nile' : ''}`}>
                      <BellRing size={12} /> {ar ? `تنبيه قبل ${d.notifyDaysBefore} يوم` : `Remind ${d.notifyDaysBefore} days before`}
                    </span>
                  </div>
                  <div className="text-[12px] text-muted">{s.roles.find((r) => r.id === d.owner)?.name[lang]}</div>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
      {edit && <DeadlineModal d={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function DeadlineModal({ d: init, onClose }: { d: Deadline; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [d, setD] = useState<Deadline>(init)
  const isNew = !init.id
  const valid = (d.title.ar || d.title.en).trim().length > 2
  return (
    <Modal open onClose={onClose} title={isNew ? (ar ? 'موعد جديد' : 'New deadline') : ar ? 'تعديل الموعد' : 'Edit deadline'}>
      <div className="space-y-4">
        <Field label={ar ? 'العنوان' : 'Title'}>
          <input className={inputCls} value={d.title[lang]} onChange={(e) => setD({ ...d, title: { ...d.title, [lang]: e.target.value } })} placeholder={ar ? 'مثال: التقرير الربعي للمانح' : 'e.g. Quarterly donor report'} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={ar ? 'التاريخ' : 'Date'}>
            <input type="date" className={`${inputCls} num`} value={d.due.slice(0, 10)} onChange={(e) => e.target.value && setD({ ...d, due: new Date(e.target.value).toISOString() })} />
          </Field>
          <Field label={ar ? 'يتكرر' : 'Repeats'}>
            <select className={inputCls} value={d.recurrence ?? 'none'} onChange={(e) => setD({ ...d, recurrence: e.target.value as Deadline['recurrence'] })}>
              {Object.entries(recurName).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'نبّه قبل (أيام)' : 'Remind before (days)'}>
            <input type="number" min={0} max={90} className={`${inputCls} num`} value={d.notifyDaysBefore} onChange={(e) => setD({ ...d, notifyDaysBefore: Math.max(0, Math.min(90, +e.target.value)) })} />
          </Field>
          <Field label={ar ? 'المسؤول' : 'Owner'}>
            <select className={inputCls} value={d.owner} onChange={(e) => setD({ ...d, owner: e.target.value })}>
              {s.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name[lang]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={ar ? 'المشروع (اختياري)' : 'Project (optional)'}>
          <select className={inputCls} value={d.projectId ?? ''} onChange={(e) => setD({ ...d, projectId: e.target.value || undefined })}>
            <option value="">—</option>
            {s.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <p className="rounded-md bg-paper px-3 py-2 text-[13px] text-muted">
          {ar
            ? `سيصل تنبيه إلى «${s.roles.find((r) => r.id === d.owner)?.name.ar}» قبل الموعد بـ ${d.notifyDaysBefore} يوم، عبر القنوات المحددة في قاعدة «اقتراب موعد تسليم تقرير».`
            : `“${s.roles.find((r) => r.id === d.owner)?.name.en}” will be reminded ${d.notifyDaysBefore} days before, through the channels set in the “report deadline is coming” rule.`}
        </p>
      </div>
      <div className="mt-5 flex justify-between gap-2">
        {!isNew ? (
          <Button
            variant="danger"
            onClick={() => {
              s.deleteDeadline(d.id)
              onClose()
            }}
          >
            <Trash2 size={15} /> {ar ? 'حذف' : 'Delete'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="quiet" onClick={onClose}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            disabled={!valid}
            onClick={async () => {
              if ((await s.saveDeadline({ ...d, id: d.id || `d-${Date.now().toString(36)}`, title: { ar: d.title.ar || d.title.en, en: d.title.en || d.title.ar } })) === false) return
              onClose()
            }}
          >
            {ar ? 'حفظ' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
