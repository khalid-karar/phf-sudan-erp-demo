import { LIVE } from '../api/http'
import { Check, Circle, Clock, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PayModal } from '../components/PayModal'
import { Button, PageHeader, Panel, StatusBadge, UsageBar } from '../components/ui'
import { roleNames } from '../data/seed'
import type { ApprovalStep, RequestStatus } from '../data/types'
import { findLine, lineUsage } from '../lib/budget'
import { date, money, usd } from '../lib/format'
import { useLang, useT } from '../lib/i18n'
import { getOffices, getUsers, usePerm, useStore, useUser } from '../lib/store'

export function RequestsList() {
  const lang = useLang()
  const t = useT()
  const ar = lang === 'ar'
  const s = useStore()
  const nav = useNavigate()
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all')
  const { viewOffice, can } = usePerm()
  const scoped = s.requests.filter((r) => !viewOffice || r.officeId === viewOffice)
  const rows = scoped.filter((r) => filter === 'all' || r.status === filter).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const counts = (st: RequestStatus) => scoped.filter((r) => r.status === st).length

  return (
    <div>
      <PageHeader
        title={ar ? 'طلبات الصرف' : 'Spend requests'}
        actions={
          can('projects', 'edit') && <Button onClick={() => nav('/requests/new')}>
            <Plus size={16} /> {t('newRequest')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', 'pending', 'approved', 'paid', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 rounded-md px-3 text-[13.5px] ${filter === f ? 'bg-nile text-white' : 'border border-line bg-surface text-muted hover:text-ink'}`}
          >
            {f === 'all' ? (ar ? 'الكل' : 'All') : t(`st_${f}`)} <span className="num opacity-70">{f === 'all' ? scoped.length : counts(f)}</span>
          </button>
        ))}
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الرقم' : 'No.'}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('purpose')}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('line')}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('office')}</th>
              <th className="px-3 py-2.5 text-end font-medium">{t('amount')}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('date')}</th>
              <th className="px-5 py-2.5 text-start font-medium">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const f = findLine(s.projects, r.lineId)
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-paper" onClick={() => nav(`/requests/${r.id}`)}>
                  <td className="num px-5 py-3 font-medium text-nile">
                    <Link to={`/requests/${r.id}`} onClick={(e) => e.stopPropagation()}>
                      {r.code}
                    </Link>
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-3">{r.purpose[lang]}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="num text-muted">{f?.project.code}</span> {f?.line.code}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{getOffices().find((o) => o.id === r.officeId)?.name[lang]}</td>
                  <td className="num px-3 py-3 text-end whitespace-nowrap">
                    {money(r.amount, r.currency, lang)}
                    {r.currency === 'SDG' && <span className="block text-[12px] text-muted">{usd(r.amountUSD)}</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted">{date(r.createdAt, lang)}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.status} />
                    {r.overCeiling && <span className="ms-1.5 text-[12px] text-amber">{ar ? 'تجاوز' : 'over'}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

export function ApprovalTimeline({ steps, createdAt, requesterId }: { steps: ApprovalStep[]; createdAt: string; requesterId: string }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const requester = getUsers().find((u) => u.id === requesterId)
  const items = [
    { key: 'created', icon: <Check size={14} />, cls: 'bg-nile text-white', title: ar ? 'أُنشئ الطلب' : 'Request created', who: requester?.name[lang], at: createdAt, note: undefined as string | undefined },
    ...steps.map((st, i) => ({
      key: `${i}`,
      icon: st.status === 'approved' ? <Check size={14} /> : st.status === 'rejected' ? <X size={14} /> : st.status === 'pending' ? <Clock size={14} /> : <Circle size={10} />,
      cls:
        st.status === 'approved'
          ? 'bg-leaf text-white'
          : st.status === 'rejected'
            ? 'bg-crescent text-white'
            : st.status === 'pending'
              ? 'bg-amber text-white'
              : 'bg-paper text-muted ring-1 ring-line',
      title: roleNames[st.role][lang],
      who: st.by ? getUsers().find((u) => u.id === st.by)?.name[lang] : st.status === 'pending' ? (ar ? 'بانتظار القرار' : 'Waiting for decision') : ar ? 'لم يصل بعد' : 'Not reached yet',
      at: st.at,
      note: st.note,
    })),
  ]
  return (
    <ol className="relative">
      {items.map((it, i) => (
        <li key={it.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 && <span className="absolute top-7 bottom-0 w-px bg-line" style={{ insetInlineStart: 13 }} />}
          <span className={`z-10 grid size-7 shrink-0 place-items-center rounded-full ${it.cls}`}>{it.icon}</span>
          <div className="min-w-0 pt-0.5">
            <div className="text-[14px] font-medium">{it.title}</div>
            <div className="text-[13px] text-muted">
              {it.who}
              {it.at && <span className="num">{ar ? '، ' : ', '}{date(it.at, lang)}</span>}
            </div>
            {it.note && <p className="mt-1 rounded bg-paper px-2.5 py-1.5 text-[13px]">{it.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function RequestDetail() {
  const { id } = useParams()
  const lang = useLang()
  const t = useT()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const [note, setNote] = useState('')
  const [paying, setPaying] = useState(false)
  const perm = usePerm()
  const r = s.requests.find((x) => x.id === id)
  if (!r) return <p>{ar ? 'الطلب غير موجود' : 'Request not found'}</p>
  const f = findLine(s.projects, r.lineId)!
  const lu = lineUsage(f.line, s)
  const myTurn = r.status === 'pending' && r.steps.some((st) => st.status === 'pending' && st.role === user.role)
  const canPay = r.status === 'approved' && perm.can('finance', 'edit')
  const office = getOffices().find((o) => o.id === r.officeId)!

  return (
    <div>
      <div className="mb-2 text-[13px]">
        <Link to="/requests" className="text-muted hover:text-nile">
          {ar ? 'طلبات الصرف' : 'Spend requests'}
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="num">{r.code}</span> <StatusBadge status={r.status} />
          </span>
        }
        sub={r.purpose[lang]}
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel className="p-5">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Item k={t('amount')} v={<span className="num font-kufi text-[22px] font-semibold">{money(r.amount, r.currency, lang)}</span>} sub={r.currency === 'SDG' ? `${usd(r.amountUSD)} — ${ar ? 'السعر' : 'rate'} ${r.rate}` : undefined} />
              <Item k={t('office')} v={office?.name[lang] ?? r.officeId} sub={office?.state[lang]} />
              <Item k={t('project')} v={f.project.name[lang]} sub={f.project.code} />
              <Item k={`${t('pillar')} / ${t('line')}`} v={`${f.line.code} ${f.line.name[lang]}`} sub={`${f.pillar.code}. ${f.pillar.name[lang]}`} />
              <Item k={ar ? 'رقم النشاط' : 'Activity'} v={<span className="num">{r.activityCode ?? '—'}</span>} sub={ar ? 'يُطابق مع التقرير الفني' : 'Matched to the field report'} />
              <Item k={ar ? 'مقدّم الطلب' : 'Requested by'} v={getUsers().find((u) => u.id === r.requesterId)?.name[lang]} sub={date(r.createdAt, lang)} />
            </dl>
            {r.overCeiling && (
              <p className="mt-4 rounded-md bg-amber-soft px-3 py-2 text-[13.5px] text-amber">
                {ar ? 'هذا الطلب يتجاوز المتاح ضمن نسبة السماحية، لذلك أُضيف المدير التنفيذي لمسار الاعتماد.' : 'This request is over the available amount within tolerance, so the Executive Director was added to the route.'}
              </p>
            )}
          </Panel>
          <Panel className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15.5px] font-semibold">
                {ar ? 'وضع البند الآن' : 'Line status now'} — {f.line.code}
              </h2>
              <span className="num text-[13.5px] text-muted">
                {ar ? 'المتاح' : 'Available'} <b className="text-ink">{usd(lu.available)}</b> / {usd(lu.ceiling)}
              </span>
            </div>
            <div className="mt-3">
              <UsageBar u={lu} height={12} />
            </div>
            <p className="mt-2 text-[12.5px] text-muted">
              {ar ? 'المبالغ قيد الاعتماد محجوزة على البند حتى لا يمرّ طلبان معاً فوق السقف.' : 'Amounts in approval are reserved so two requests cannot both pass over the ceiling.'}
            </p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={ar ? 'مسار الاعتماد' : 'Approval route'} className="pb-1">
            <div className="p-5">
              <ApprovalTimeline steps={r.steps} createdAt={r.createdAt} requesterId={r.requesterId} />
            </div>
          </Panel>
          {myTurn && (
            <Panel className="p-5">
              <h2 className="text-[15.5px] font-semibold">{ar ? 'قرارك' : 'Your decision'}</h2>
              <textarea
                className="mt-3 h-20 w-full rounded-md border border-line p-2.5 text-[14px]"
                placeholder={ar ? 'ملاحظة (اختيارية، مطلوبة عند الرفض)' : 'Note (optional; required to reject)'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-3 flex gap-2">
                <Button variant="ok" className="flex-1" onClick={() => s.decideRequest(r.id, true, note || undefined)}>
                  <Check size={16} /> {t('approve')}
                </Button>
                <Button variant="danger" className="flex-1" disabled={!note.trim()} onClick={() => s.decideRequest(r.id, false, note)}>
                  <X size={16} /> {t('reject')}
                </Button>
              </div>
            </Panel>
          )}
          {canPay && (
            <Panel className="p-5">
              <h2 className="text-[15.5px] font-semibold">{ar ? 'صرف الطلب' : 'Pay this request'}</h2>
              <p className="mt-1 text-[13.5px] text-muted">
                {ar ? 'نقداً أو بنكياً أو كعهدة لموظف. يصدر سند الصرف والقيد المحاسبي تلقائياً.' : 'In cash, by bank, or as a staff advance. The voucher and journal entry are created automatically.'}
              </p>
              <Button className="mt-3 w-full" onClick={() => setPaying(true)}>
                {ar ? 'صرف' : 'Pay'}
              </Button>
              <PayModal req={r} open={paying} onClose={() => setPaying(false)} />
            </Panel>
          )}
          {r.status === 'pending' && !myTurn && (
            <p className="rounded-md border border-dashed border-line p-4 text-[13.5px] text-muted">
              {ar
                ? `القرار الآن عند: ${roleNames[r.steps.find((x) => x.status === 'pending')!.role].ar}.${LIVE ? '' : ' بدّل الدور من الأعلى للمتابعة.'}`
                : `Waiting on: ${roleNames[r.steps.find((x) => x.status === 'pending')!.role].en}.${LIVE ? '' : ' Switch role at the top to continue.'}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Item({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-muted">{k}</dt>
      <dd className="mt-0.5 font-medium">{v}</dd>
      {sub && <dd className="num text-[12.5px] text-muted">{sub}</dd>}
    </div>
  )
}
