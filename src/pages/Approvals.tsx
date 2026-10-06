import { Check, Shuffle, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, Panel, UsageBar } from '../components/ui'
import { roleNames } from '../data/seed'
import { findLine, lineUsage } from '../lib/budget'
import { date, money, relDays, usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { getOffices, usePerm, useStore, useUser } from '../lib/store'

export function Approvals() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const mine = (steps: { role: string; status: string }[]) => steps.some((st) => st.status === 'pending' && st.role === user.role)
  const { scopeOffice } = usePerm()
  const reqs = s.requests.filter((r) => r.status === 'pending' && mine(r.steps) && (!scopeOffice || r.officeId === scopeOffice))
  const ras = s.reallocations.filter((r) => r.status === 'pending' && mine(r.steps))
  const empty = reqs.length + ras.length === 0

  return (
    <div>
      <PageHeader
        title={ar ? 'بانتظار اعتمادي' : 'Awaiting my approval'}
        sub={
          ar
            ? `تعمل الآن بصفة ${roleNames[user.role].ar}. تظهر هنا الطلبات التي وصلت إلى دورك في مسار الاعتماد فقط.`
            : `You are acting as ${roleNames[user.role].en}. Only requests that have reached your step in the route appear here.`
        }
      />
      {empty && (
        <Panel className="p-8 text-center">
          <p className="font-medium">{ar ? 'لا توجد طلبات بانتظارك.' : 'Nothing is waiting for you.'}</p>
          <p className="mt-1 text-[14px] text-muted">
            {user.role === 'field_officer'
              ? ar
                ? 'المسؤول الميداني يُنشئ الطلبات ولا يعتمدها. بدّل الدور إلى المشرف من الأعلى.'
                : 'Field officers create requests but do not approve them. Switch to Supervisor at the top.'
              : ar
                ? 'بدّل الدور من الأعلى لرؤية صندوق معتمد آخر.'
                : 'Switch role at the top to see another approver’s queue.'}
          </p>
        </Panel>
      )}

      {ras.length > 0 && (
        <Panel className="mb-6" title={ar ? 'طلبات المناقلة' : 'Reallocation requests'}>
          <ul className="divide-y divide-line">
            {ras.map((r) => {
              const p = s.projects.find((x) => x.id === r.projectId)!
              const from = findLine([p], r.fromLineId)!
              const to = findLine([p], r.toLineId)!
              return (
                <li key={r.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="flex gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-nile-soft text-nile">
                      <Shuffle size={16} />
                    </span>
                    <div>
                      <div className="text-[13px] text-muted">
                        <span className="num">{r.code}</span>
                        {ar ? '، ' : ', '}
                        {p.code}
                      </div>
                      <div className="font-medium">
                        <span className="num">{usd(r.amountUSD)}</span> {ar ? 'من' : 'from'} {from.line.code} {from.line.name[lang]} {ar ? 'إلى' : 'to'} {to.line.code} {to.line.name[lang]}
                      </div>
                      <div className="text-[13.5px] text-muted">{r.reason[lang]}</div>
                    </div>
                  </div>
                  <Decide onApprove={(n) => s.decideReallocation(r.id, true, n)} onReject={(n) => s.decideReallocation(r.id, false, n)} />
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      {reqs.length > 0 && (
        <Panel title={ar ? 'طلبات الصرف' : 'Spend requests'}>
          <ul className="divide-y divide-line">
            {reqs.map((r) => {
              const f = findLine(s.projects, r.lineId)!
              const lu = lineUsage(f.line, s)
              const stepNo = r.steps.findIndex((x) => x.status === 'pending') + 1
              return (
                <li key={r.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="text-[13px] text-muted">
                      <Link to={`/requests/${r.id}`} className="num font-medium text-nile hover:underline">
                        {r.code}
                      </Link>
                      {ar ? '، ' : ', '}
                      {getOffices().find((o) => o.id === r.officeId)?.name[lang]}
                      {ar ? '، ' : ', '}
                      {relDays(r.createdAt, lang)}
                    </div>
                    <div className="font-medium">{r.purpose[lang]}</div>
                    <div className="num mt-0.5 text-[14px]">
                      <b>{money(r.amount, r.currency, lang)}</b>
                      {r.currency === 'SDG' && <span className="text-muted"> ≈ {usd(r.amountUSD)}</span>}
                      <span className="text-muted">
                        {' '}
                        — {ar ? 'الخطوة' : 'step'} {stepNo}/{r.steps.length}
                      </span>
                    </div>
                    {r.overCeiling && <div className="mt-1 text-[13px] text-amber">{ar ? 'تجاوز ضمن السماحية — يتطلب موافقتك' : 'Over within tolerance — needs your sign-off'}</div>}
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-[12.5px] text-muted">
                      <span className="truncate">
                        {f.line.code} {f.line.name[lang]}
                      </span>
                      <span className="num shrink-0">
                        {ar ? 'متاح' : 'avail.'} {usd(lu.available)}
                      </span>
                    </div>
                    <UsageBar u={lu} height={8} />
                  </div>
                  <Decide onApprove={(n) => s.decideRequest(r.id, true, n)} onReject={(n) => s.decideRequest(r.id, false, n)} />
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <RecentDecisions />
    </div>
  )
}

function Decide({ onApprove, onReject }: { onApprove: (note?: string) => void; onReject: (note: string) => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  if (rejecting)
    return (
      <div className="flex flex-col gap-2 md:w-64">
        <input
          autoFocus
          className="h-9 rounded-md border border-line px-2.5 text-[14px]"
          placeholder={ar ? 'سبب الرفض' : 'Reason for rejecting'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <Button variant="danger" className="h-9 flex-1" disabled={!note.trim()} onClick={() => onReject(note)}>
            {ar ? 'تأكيد الرفض' : 'Confirm reject'}
          </Button>
          <Button variant="quiet" className="h-9" onClick={() => setRejecting(false)}>
            {ar ? 'تراجع' : 'Back'}
          </Button>
        </div>
      </div>
    )
  return (
    <div className="flex gap-2">
      <Button variant="ok" className="h-9" onClick={() => onApprove()}>
        <Check size={16} /> {ar ? 'اعتماد' : 'Approve'}
      </Button>
      <Button variant="danger" className="h-9" onClick={() => setRejecting(true)}>
        <X size={16} /> {ar ? 'رفض' : 'Reject'}
      </Button>
    </div>
  )
}

function RecentDecisions() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const decided = s.requests
    .flatMap((r) => r.steps.filter((st) => st.by === user.id && st.status !== 'pending').map((st) => ({ r, st })))
    .sort((a, b) => +new Date(b.st.at ?? 0) - +new Date(a.st.at ?? 0))
    .slice(0, 6)
  if (!decided.length) return null
  return (
    <Panel className="mt-6" title={ar ? 'آخر قراراتك' : 'Your recent decisions'}>
      <ul className="divide-y divide-line text-[14px]">
        {decided.map(({ r, st }) => (
          <li key={r.id + st.role} className="flex flex-wrap items-center gap-x-3 px-5 py-2.5">
            <Link to={`/requests/${r.id}`} className="num text-nile hover:underline">
              {r.code}
            </Link>
            <span className="min-w-0 flex-1 truncate">{r.purpose[lang]}</span>
            <span className={st.status === 'approved' ? 'text-leaf' : 'text-crescent'}>{st.status === 'approved' ? (ar ? 'اعتمدته' : 'Approved') : ar ? 'رفضته' : 'Rejected'}</span>
            <span className="num text-muted">{st.at && date(st.at, lang)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
