import { AlertTriangle, BellRing, CheckCircle2, Clock, FileCheck2, FileX2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Modal, PageHeader, Panel } from '../../components/ui'
import { staff } from '../../data/finance'
import type { Advance, SettlementItem } from '../../data/types'
import { findLine } from '../../lib/budget'
import { date, daysUntil, relDays, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { getOffices, usePerm, useStore, useUser } from '../../lib/store'
import { useAccountName } from './common'

/** Live lookup of an activity by its code. */
export const activityFor = (code: string) => useStore.getState().activities.find((a) => a.code === code)

export function Advances() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const { can, scopeOffice } = usePerm()
  const [settling, setSettling] = useState<Advance | null>(null)
  const [filter, setFilter] = useState<'open' | 'settled' | 'all'>('open')
  const open = s.advances.filter((a) => a.status === 'open')
  const overdue = open.filter((a) => daysUntil(a.dueAt) < 0)
  const outstanding = open.reduce((t, a) => t + a.amountUSD, 0)
  const ready = open.filter((a) => activityFor(a.activityCode)?.report)
  const list = s.advances.filter((a) => (!scopeOffice || a.officeId === scopeOffice) && (filter === 'all' || a.status === filter)).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))
  void user
  const canSettle = can('finance', 'edit')

  return (
    <div>
      <PageHeader
        title={ar ? 'العُهد النقدية وتسويتها' : 'Cash advances & settlement'}
        sub={
          ar
            ? 'يستلم الموظف عهدة قبل النشاط، ولا تُسوّى إلا بعد رفع التقرير الفني للنشاط نفسه. هكذا يُطابق التقرير الفني مع المالي عند التسوية، لا بعدها.'
            : 'Staff receive an advance before the activity, and it can only be settled once that activity’s field report is in. The technical and financial reports are matched at settlement, not weeks later.'
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={ar ? 'عهد مفتوحة' : 'Open advances'} value={String(open.length)} sub={usd(outstanding)} />
        <Stat label={ar ? 'متأخرة عن موعد التسوية' : 'Past settlement date'} value={String(overdue.length)} sub={usd(overdue.reduce((t, a) => t + a.amountUSD, 0))} tone={overdue.length ? 'bad' : undefined} />
        <Stat label={ar ? 'جاهزة للتسوية' : 'Ready to settle'} value={String(ready.length)} sub={ar ? 'التقرير الفني مستلم' : 'Field report received'} tone={ready.length ? 'ok' : undefined} />
        <Stat label={ar ? 'بانتظار التقرير الفني' : 'Waiting for field report'} value={String(open.length - ready.length)} sub={ar ? 'لا يمكن تسويتها بعد' : 'Cannot be settled yet'} />
      </div>

      <div className="mb-3 flex gap-1.5">
        {(['open', 'settled', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 rounded-md px-3 text-[13.5px] ${filter === f ? 'bg-nile text-white' : 'border border-line bg-surface text-muted hover:text-ink'}`}
          >
            {f === 'open' ? (ar ? 'مفتوحة' : 'Open') : f === 'settled' ? (ar ? 'مسوّاة' : 'Settled') : ar ? 'الكل' : 'All'}
          </button>
        ))}
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'العهدة' : 'Advance'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الموظف والمكتب' : 'Staff & office'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'النشاط' : 'Activity'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'المبلغ' : 'Amount'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'موعد التسوية' : 'Settle by'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'التقرير الفني' : 'Field report'}</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((a) => {
              const act = activityFor(a.activityCode)
              const st = { name: { ar: a.holderName ?? staff.find((x) => x.id === a.staffId)?.name.ar, en: a.holderName ?? staff.find((x) => x.id === a.staffId)?.name.en } }
              const dd = daysUntil(a.dueAt)
              const late = a.status === 'open' && dd < 0
              return (
                <tr key={a.id} className={late ? 'bg-crescent-soft/40' : ''}>
                  <td className="num px-5 py-3 font-medium whitespace-nowrap">
                    {a.no}
                    <span className="block text-[12px] font-normal text-muted">{date(a.issuedAt, lang)}</span>
                  </td>
                  <td className="py-3 pe-3">
                    {st?.name[lang]}
                    <span className="block text-[12.5px] text-muted">{getOffices().find((o) => o.id === a.officeId)?.name[lang]}</span>
                  </td>
                  <td className="py-3 pe-3">
                    <span className="num text-[13px] text-muted">{a.activityCode}</span>
                    <span className="block max-w-[260px] truncate">{act?.title[lang] ?? (ar ? 'نشاط جديد' : 'New activity')}</span>
                  </td>
                  <td className="num py-3 pe-3 text-end font-medium">{usd(a.amountUSD)}</td>
                  <td className="py-3 pe-3 whitespace-nowrap">
                    {a.status === 'settled' ? (
                      <span className="inline-flex items-center gap-1 text-leaf">
                        <CheckCircle2 size={15} /> {ar ? 'سُوّيت' : 'Settled'} <span className="num text-muted">{date(a.settlement!.at, lang)}</span>
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 ${late ? 'font-medium text-crescent' : dd <= 3 ? 'text-amber' : 'text-muted'}`}>
                        {late ? <AlertTriangle size={15} /> : <Clock size={15} />} {relDays(a.dueAt, lang)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pe-3">
                    {act?.report ? (
                      <span className="inline-flex items-center gap-1 text-leaf">
                        <FileCheck2 size={15} /> <span className="num">{act.report.no}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <FileX2 size={15} /> {ar ? 'لم يُرفع بعد' : 'Not submitted'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-end whitespace-nowrap">
                    {a.status === 'open' &&
                      (act?.report ? (
                        <Button className="h-9" disabled={!canSettle} onClick={() => setSettling(a)}>
                          {ar ? 'تسوية' : 'Settle'}
                        </Button>
                      ) : (
                        <Button
                          variant="quiet"
                          className="h-9"
                          onClick={() =>
                            s.toast({
                              ar: `أُرسل تذكير إلى ${st?.name.ar} برفع التقرير الفني لـ ${a.activityCode}`,
                              en: `Reminder sent to ${st?.name.en} to submit the field report for ${a.activityCode}`,
                            })
                          }
                        >
                          <BellRing size={15} /> {ar ? 'تذكير' : 'Remind'}
                        </Button>
                      ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
      {!canSettle && <p className="mt-3 text-[13px] text-muted">{ar ? 'التسوية لمن لديه صلاحية إدخال في المالية.' : 'Settlement needs enter access to Finance.'}</p>}
      {settling && <SettleModal advance={settling} onClose={() => setSettling(null)} />}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`num mt-1 font-kufi text-[24px] font-semibold ${tone === 'bad' ? 'text-crescent' : tone === 'ok' ? 'text-leaf' : ''}`}>{value}</div>
      <div className="num text-[13px] text-muted">{sub}</div>
    </div>
  )
}

const demoItems: Record<string, SettlementItem[]> = {
  'ADV-0020': [
    { description: 'وقود سيارتين — رحلة أروما ذهاباً وإياباً', receiptNo: '1187', amountUSD: 310 },
    { description: 'أدوية مكمّلة من صيدلية كسلا', receiptNo: '5520', amountUSD: 540 },
    { description: 'حوافز الطاقم الطبي (6 أفراد)', receiptNo: 'كشف 12', amountUSD: 260 },
  ],
  'ADV-0019': [
    { description: 'نقل المضادات الحيوية من المخزن', receiptNo: '903', amountUSD: 120 },
    { description: 'مضادات حيوية إضافية', receiptNo: '2214', amountUSD: 705 },
  ],
}

function SettleModal({ advance: a, onClose }: { advance: Advance; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const accName = useAccountName()
  const act = activityFor(a.activityCode)!
  const [items, setItems] = useState<SettlementItem[]>(demoItems[a.no] ?? [{ description: '', receiptNo: '', amountUSD: 0 }])
  useEffect(() => setItems(demoItems[a.no] ?? [{ description: '', receiptNo: '', amountUSD: 0 }]), [a.no])
  const spent = items.reduce((t, i) => t + (i.amountUSD || 0), 0)
  const diff = a.amountUSD - spent
  const f = findLine(s.projects, a.lineId)!
  const expAcc = s.lineMap[a.lineId]
  const up = (i: number, patch: Partial<SettlementItem>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const valid = items.length > 0 && items.every((i) => i.description.trim() && i.amountUSD > 0)

  return (
    <Modal open onClose={onClose} title={`${ar ? 'تسوية العهدة' : 'Settle advance'} ${a.no}`} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md bg-leaf-soft p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-leaf">
            <FileCheck2 size={15} /> {ar ? 'التقرير الفني المرتبط' : 'Linked field report'} <span className="num">{act.report!.no}</span>
          </div>
          <div className="mt-1 font-medium">{act.title[lang]}</div>
          <div className="text-[13.5px] text-ink/80">{act.report!.summary[lang]}</div>
          <div className="num mt-1 text-[12.5px] text-muted">
            {ar ? 'رُفع' : 'Submitted'} {date(act.report!.submittedAt, lang)}
            {ar ? '، المستفيدون: ' : ', beneficiaries: '}
            {act.report!.beneficiaries}
          </div>
        </div>
        <div className="rounded-md bg-paper p-4 text-[14px]">
          <div className="text-[12.5px] text-muted">{ar ? 'البند' : 'Budget line'}</div>
          <div className="font-medium">
            {f.project.code} — {f.line.code} {f.line.name[lang]}
          </div>
          <div className="mt-2 text-[12.5px] text-muted">{ar ? 'حساب المصروف' : 'Expense account'}</div>
          <div>
            <span className="num text-muted">{expAcc}</span> {accName(expAcc)}
          </div>
        </div>
      </div>

      <h3 className="mt-5 mb-2 text-[14.5px] font-semibold">{ar ? 'المصروفات الفعلية من الفواتير' : 'Actual spending from receipts'}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[14px]">
          <thead>
            <tr className="text-[12.5px] text-muted">
              <th className="pb-1.5 text-start font-medium">{ar ? 'البيان' : 'Description'}</th>
              <th className="w-28 pb-1.5 text-start font-medium">{ar ? 'رقم الفاتورة' : 'Receipt no.'}</th>
              <th className="w-32 pb-1.5 text-end font-medium">{ar ? 'المبلغ (دولار)' : 'Amount (USD)'}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="py-1 pe-2">
                  <input className="h-9 w-full rounded-md border border-line px-2.5" value={it.description} onChange={(e) => up(i, { description: e.target.value })} />
                </td>
                <td className="py-1 pe-2">
                  <input className="num h-9 w-full rounded-md border border-line px-2.5" value={it.receiptNo} onChange={(e) => up(i, { receiptNo: e.target.value })} />
                </td>
                <td className="py-1 pe-2">
                  <input type="number" className="num h-9 w-full rounded-md border border-line px-2.5 text-end" value={it.amountUSD || ''} onChange={(e) => up(i, { amountUSD: Math.max(0, +e.target.value) })} />
                </td>
                <td className="py-1">
                  <button className="rounded p-1.5 text-muted hover:text-crescent" onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))} aria-label={ar ? 'حذف' : 'Remove'}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="mt-1 inline-flex items-center gap-1 text-[13.5px] text-nile hover:underline" onClick={() => setItems((xs) => [...xs, { description: '', receiptNo: '', amountUSD: 0 }])}>
        <Plus size={15} /> {ar ? 'إضافة فاتورة' : 'Add receipt'}
      </button>

      <dl className="num mt-4 grid gap-2 rounded-md border border-line p-4 text-[14px] sm:grid-cols-3">
        <div>
          <dt className="text-[12.5px] text-muted">{ar ? 'مبلغ العهدة' : 'Advance'}</dt>
          <dd className="font-semibold">{usd(a.amountUSD)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">{ar ? 'المصروف الفعلي' : 'Actually spent'}</dt>
          <dd className="font-semibold">{usd(spent)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">{diff >= 0 ? (ar ? 'يُرد إلى صندوق المكتب' : 'Returned to office cash') : ar ? 'يُعوّض للموظف' : 'Reimbursed to staff'}</dt>
          <dd className={`font-semibold ${diff >= 0 ? 'text-leaf' : 'text-amber'}`}>{usd(Math.abs(diff))}</dd>
        </div>
      </dl>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!valid}
          onClick={async () => {
            if ((await s.settleAdvance(a.id, items, act.report!.no)) === false) return
            onClose()
          }}
        >
          {ar ? 'اعتماد التسوية وترحيل القيد' : 'Approve settlement & post entry'}
        </Button>
      </div>
    </Modal>
  )
}
