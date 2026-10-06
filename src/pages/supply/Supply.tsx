import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, PackagePlus, Pencil, Plus, Search, Trash2, Truck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import { categoryName } from '../../data/supply'
import type { Item, ItemCategory } from '../../data/types'
import { date, num, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

export const kindName = {
  receipt: { ar: 'استلام', en: 'Receipt' },
  issue: { ar: 'صرف', en: 'Issue' },
  transfer_out: { ar: 'شحن إلى مكتب', en: 'Shipped out' },
  transfer_in: { ar: 'استلام من الرئاسة', en: 'Received from HQ' },
  loss: { ar: 'تالف / نقص', en: 'Loss' },
}

export function Stock() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, scopeOffice } = usePerm()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const stores = s.offices.filter((o) => s.stock.some((x) => x.officeId === o.id && x.qty !== 0) || o.isHQ).filter((o) => !scopeOffice || o.id === scopeOffice)
  const qty = (i: string, o: string) => s.stock.find((x) => x.itemId === i && x.officeId === o)?.qty
  const low = (it: Item, o: string) => {
    const v = qty(it.id, o)
    return v !== undefined && v < it.min
  }
  const rows = s.items.filter((it) => it.active !== false && (!q || it.name.ar.includes(q) || it.name.en.toLowerCase().includes(q.toLowerCase()) || it.code.toLowerCase().includes(q.toLowerCase())) && (!onlyLow || stores.some((o) => low(it, o.id))))
  const value = s.stock.filter((x) => !scopeOffice || x.officeId === scopeOffice).reduce((t, x) => t + x.qty * (s.items.find((i) => i.id === x.itemId)?.unitValueUSD ?? 0), 0)
  const transit = s.shipments.filter((x) => x.status === 'in_transit' && (!scopeOffice || x.toOfficeId === scopeOffice))
  const transitValue = transit.flatMap((x) => x.lines).reduce((t, l) => t + l.qty * (s.items.find((i) => i.id === l.itemId)?.unitValueUSD ?? 0), 0)
  const lowCount = s.items.reduce((t, it) => t + stores.filter((o) => low(it, o.id)).length, 0)
  const recent = s.stockMoves.filter((m) => !scopeOffice || m.officeId === scopeOffice).sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 12)

  return (
    <div>
      <PageHeader
        title={ar ? 'المخزون' : 'Stock'}
        sub={ar ? 'رصيد كل صنف في كل مخزن. التغذية العينية تصل إلى مخزن الرئاسة، ثم تُشحن إلى المكاتب وتُصرف على الأنشطة.' : 'Each item’s balance in every store. In-kind supplies arrive at the HQ store, are shipped to offices, and issued to activities.'}
        actions={
          can('supply', 'edit') && (
            <>
              <Button variant="quiet" onClick={() => nav('/supply/receipts?new=1')}>
                <ArrowDownToLine size={16} /> {ar ? 'استلام' : 'Receive'}
              </Button>
              <Button variant="quiet" onClick={() => nav('/supply/issues')}>
                <ArrowUpFromLine size={16} /> {ar ? 'صرف' : 'Issue'}
              </Button>
              {can('logistics', 'edit') && (
                <Button onClick={() => nav('/logistics?new=1')}>
                  <Truck size={16} /> {ar ? 'شحنة إلى مكتب' : 'Ship to an office'}
                </Button>
              )}
            </>
          )
        }
      />
      <Panel className="mb-6 grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x lg:rtl:divide-x-reverse">
        {(
          [
            [ar ? 'قيمة المخزون' : 'Stock value', usd(value), ''],
            [ar ? 'في الطريق إلى المكاتب' : 'In transit to offices', usd(transitValue), `${transit.length} ${ar ? 'شحنات' : 'shipments'}`],
            [ar ? 'أصناف تحت الحد الأدنى' : 'Below minimum', String(lowCount), ar ? 'صنف في مخزن' : 'item-store pairs'],
            [ar ? 'الأصناف' : 'Items', String(s.items.filter((i) => i.active !== false).length), ''],
          ] as [string, string, string][]
        ).map(([k, v, sub], i) => (
          <div key={k} className="p-5">
            <div className="text-[13px] text-muted">{k}</div>
            <div className={`num mt-1 font-kufi text-[24px] font-semibold ${i === 2 && lowCount ? 'text-crescent' : ''}`}>{v}</div>
            {sub && <div className="text-[12.5px] text-muted">{sub}</div>}
          </div>
        ))}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-52 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} ps-9`} placeholder={ar ? 'ابحث باسم الصنف أو رمزه' : 'Search by item name or code'} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="inline-flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" className="size-4" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
            {ar ? 'تحت الحد الأدنى فقط' : 'Below minimum only'}
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                <th className="sticky start-0 bg-surface px-5 py-2.5 text-start font-medium">{ar ? 'الصنف' : 'Item'}</th>
                {stores.map((o) => (
                  <th key={o.id} className="px-2 py-2.5 text-center font-medium whitespace-nowrap">
                    {o.isHQ ? (ar ? 'مخزن الرئاسة' : 'HQ store') : o.name[lang]}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-end font-medium">{ar ? 'الحد الأدنى' : 'Min'}</th>
                <th className="px-5 py-2.5 text-end font-medium">{ar ? 'القيمة' : 'Value'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((it) => {
                const total = stores.reduce((t, o) => t + (qty(it.id, o.id) ?? 0), 0)
                return (
                  <tr key={it.id}>
                    <td className="sticky start-0 bg-surface px-5 py-2">
                      <div className="font-medium">{it.name[lang]}</div>
                      <div className="text-[12px] text-muted">
                        <span className="num">{it.code}</span> — {it.unit[lang]}
                      </div>
                    </td>
                    {stores.map((o) => {
                      const v = qty(it.id, o.id)
                      const isLow = low(it, o.id)
                      return (
                        <td key={o.id} className="px-2 py-2 text-center">
                          {v === undefined ? (
                            <span className="text-muted/60">—</span>
                          ) : (
                            <span className={`num inline-flex min-w-12 items-center justify-center gap-1 rounded px-1.5 py-0.5 ${isLow ? 'bg-crescent-soft font-semibold text-crescent' : ''}`} title={isLow ? (ar ? 'تحت الحد الأدنى' : 'Below minimum') : undefined}>
                              {isLow && <AlertTriangle size={12} />}
                              {num(v)}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="num px-3 py-2 text-end text-muted">{it.min}</td>
                    <td className="num px-5 py-2 text-end">{usd(total * it.unitValueUSD)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="mt-6" title={ar ? 'آخر الحركات' : 'Latest movements'}>
        <MovesTable moves={recent} />
      </Panel>
    </div>
  )
}

export function MovesTable({ moves }: { moves: ReturnType<typeof useStore.getState>['stockMoves'] }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <tbody className="divide-y divide-line">
          {moves.map((m) => {
            const it = s.items.find((i) => i.id === m.itemId)
            const inbound = m.kind === 'receipt' || m.kind === 'transfer_in'
            const act = s.activities.find((a) => a.id === m.activityId)
            return (
              <tr key={m.id}>
                <td className="num px-5 py-2 whitespace-nowrap text-muted">{date(m.date, lang)}</td>
                <td className="py-2 pe-3">
                  <span className={`rounded px-1.5 py-0.5 text-[12px] ${inbound ? 'bg-leaf-soft text-leaf' : m.kind === 'loss' ? 'bg-crescent-soft text-crescent' : 'bg-nile-soft text-nile'}`}>{kindName[m.kind][lang]}</span>
                </td>
                <td className="py-2 pe-3">{it?.name[lang]}</td>
                <td className={`num py-2 pe-3 text-end font-medium ${inbound ? 'text-leaf' : ''}`}>
                  {inbound ? '+' : '−'}
                  {num(m.qty)}
                </td>
                <td className="py-2 pe-3">{s.offices.find((o) => o.id === m.officeId)?.name[lang]}</td>
                <td className="py-2 pe-5 text-[12.5px] text-muted">
                  {act ? (
                    <Link to={`/activities/${act.id}`} className="num text-nile hover:underline">
                      {act.code}
                    </Link>
                  ) : (
                    <span className="num">{m.ref}</span>
                  )}
                  {m.source && <span className="block">{m.source[lang]}</span>}
                </td>
              </tr>
            )
          })}
          {moves.length === 0 && (
            <tr>
              <td className="px-5 py-8 text-center text-muted">{ar ? 'لا حركات بعد.' : 'No movements yet.'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

type Line = { itemId: string; qty: number; expiry?: string }

export function LinesEditor({ lines, onChange, officeId, withExpiry, limitToStock }: { lines: Line[]; onChange: (l: Line[]) => void; officeId: string; withExpiry?: boolean; limitToStock?: boolean }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const avail = (i: string) => s.stock.find((x) => x.itemId === i && x.officeId === officeId)?.qty ?? 0
  const options = s.items.filter((it) => it.active !== false && (!limitToStock || avail(it.id) > 0))
  const up = (i: number, p: Partial<Line>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...p } : l)))
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const it = s.items.find((x) => x.id === l.itemId)
        const over = limitToStock && l.qty > avail(l.itemId)
        return (
          <div key={i} className="grid items-start gap-2 sm:grid-cols-[1fr_120px_auto_auto]">
            <select className={inputCls} value={l.itemId} onChange={(e) => up(i, { itemId: e.target.value })}>
              {options.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name[lang]} — {x.unit[lang]}
                </option>
              ))}
            </select>
            <div>
              <input type="number" min={1} className={`${inputCls} num ${over ? 'border-crescent' : ''}`} value={l.qty || ''} onChange={(e) => up(i, { qty: Math.max(0, Math.floor(+e.target.value)) })} placeholder={ar ? 'الكمية' : 'Qty'} aria-label={ar ? 'الكمية' : 'Quantity'} />
              {limitToStock && (
                <span className={`num mt-0.5 block text-[11.5px] ${over ? 'text-crescent' : 'text-muted'}`}>
                  {ar ? 'المتاح' : 'Available'} {num(avail(l.itemId))}
                </span>
              )}
              {!limitToStock && it && l.qty > 0 && <span className="num mt-0.5 block text-[11.5px] text-muted">{usd(l.qty * it.unitValueUSD)}</span>}
            </div>
            {withExpiry ? (
              <input type="date" className={`${inputCls} num`} value={l.expiry?.slice(0, 10) ?? ''} onChange={(e) => up(i, { expiry: e.target.value ? new Date(e.target.value).toISOString() : undefined })} title={ar ? 'تاريخ الانتهاء' : 'Expiry date'} aria-label={ar ? 'تاريخ الانتهاء' : 'Expiry date'} />
            ) : (
              <span />
            )}
            <button className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-crescent-soft hover:text-crescent" onClick={() => onChange(lines.filter((_, k) => k !== i))} aria-label={ar ? 'حذف السطر' : 'Remove line'}>
              <Trash2 size={16} />
            </button>
          </div>
        )
      })}
      <button className="inline-flex items-center gap-1 text-[13.5px] text-nile hover:underline" onClick={() => onChange([...lines, { itemId: options[0]?.id ?? '', qty: 0 }])} disabled={!options.length}>
        <Plus size={15} /> {ar ? 'إضافة صنف' : 'Add item'}
      </button>
    </div>
  )
}

export function Receipts() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can } = usePerm()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (params.get('new')) {
      setOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])
  const groups = useMemo(() => {
    const m = new Map<string, typeof s.stockMoves>()
    for (const x of s.stockMoves.filter((x) => x.kind === 'receipt')) m.set(x.ref ?? x.no, [...(m.get(x.ref ?? x.no) ?? []), x])
    return [...m.entries()].sort((a, b) => +new Date(b[1][0].date) - +new Date(a[1][0].date))
  }, [s.stockMoves])
  return (
    <div>
      <PageHeader
        title={ar ? 'استلام التغذية العينية' : 'In-kind supplies received'}
        sub={ar ? 'كل شحنة تغذية تصل من المقر أو المانحين تُسجّل هنا بقيمتها، فتدخل المخزون والحسابات معاً.' : 'Every in-kind shipment from headquarters or donors is recorded here with its value, entering stock and the accounts together.'}
        actions={
          can('supply', 'edit') && (
            <Button onClick={() => setOpen(true)}>
              <PackagePlus size={16} /> {ar ? 'تسجيل استلام' : 'Record a receipt'}
            </Button>
          )
        }
      />
      <div className="space-y-4">
        {groups.map(([ref, ms]) => (
          <Panel key={ref}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
              <div>
                <span className="num font-semibold">{ref}</span> — {ms[0].source?.[lang]}
              </div>
              <div className="num text-[13.5px] text-muted">
                {date(ms[0].date, lang)} — {s.offices.find((o) => o.id === ms[0].officeId)?.name[lang]} — <b className="text-ink">{usd(ms.reduce((t, m) => t + m.valueUSD, 0))}</b>
              </div>
            </div>
            <table className="w-full text-[13.5px]">
              <tbody className="divide-y divide-line">
                {ms.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-2">{s.items.find((i) => i.id === m.itemId)?.name[lang]}</td>
                    <td className="num py-2 pe-3 text-end">{num(m.qty)}</td>
                    <td className="num py-2 pe-3 text-end text-muted">{m.expiry ? `${ar ? 'ينتهي' : 'exp.'} ${date(m.expiry, lang)}` : ''}</td>
                    <td className="num px-5 py-2 text-end">{usd(m.valueUSD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
      {open && <ReceiveModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function ReceiveModal({ onClose }: { onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [officeId, setOfficeId] = useState('khr')
  const [source, setSource] = useState(ar ? 'الصندوق — الكويت' : 'PHF — Kuwait')
  const [lines, setLines] = useState<Line[]>([{ itemId: 'i2', qty: 200 }, { itemId: 'i7', qty: 150 }])
  const total = lines.reduce((t, l) => t + l.qty * (s.items.find((i) => i.id === l.itemId)?.unitValueUSD ?? 0), 0)
  const valid = lines.length > 0 && lines.every((l) => l.itemId && l.qty > 0) && source.trim()
  return (
    <Modal open onClose={onClose} title={ar ? 'تسجيل استلام تغذية عينية' : 'Record an in-kind receipt'} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ar ? 'المخزن المستلم' : 'Receiving store'}>
          <select className={inputCls} value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            {s.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.isHQ ? (ar ? 'مخزن الرئاسة — الخرطوم' : 'HQ store — Khartoum') : o.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? 'الجهة المرسلة' : 'Sent by'}>
          <input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 grid gap-2 text-[12.5px] text-muted sm:grid-cols-[1fr_120px_auto_auto]">
          <span>{ar ? 'الصنف' : 'Item'}</span>
          <span>{ar ? 'الكمية' : 'Quantity'}</span>
          <span>{ar ? 'تاريخ الانتهاء' : 'Expiry'}</span>
        </div>
        <LinesEditor lines={lines} onChange={setLines} officeId={officeId} withExpiry />
      </div>
      <p className="mt-4 rounded-md bg-paper px-3 py-2 text-[13px]">
        {ar ? 'القيمة' : 'Value'} <b className="num">{usd(total)}</b> —{' '}
        {ar ? 'يُرحّل قيد: من ح/ 1105 مخزون المواد إلى ح/ 4103 تبرعات عينية.' : 'Posts: Dr 1105 stock / Cr 4103 in-kind donations.'}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!valid}
          onClick={() => {
            s.receiveSupplies({ officeId, source, lines })
            onClose()
          }}
        >
          {ar ? 'تسجيل الاستلام' : 'Record receipt'}
        </Button>
      </div>
    </Modal>
  )
}

export function Issues() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { scopeOffice, user, can } = usePerm()
  const stores = s.offices.filter((o) => s.stock.some((x) => x.officeId === o.id && x.qty > 0)).filter((o) => !scopeOffice || o.id === scopeOffice)
  const [officeId, setOfficeId] = useState(scopeOffice ?? (stores.find((o) => o.id === user.officeId)?.id || stores[0]?.id || 'khr'))
  const acts = s.activities.filter((a) => a.officeId === officeId)
  const [activityId, setActivityId] = useState('')
  const firstItem = s.stock.find((x) => x.officeId === officeId && x.qty > 0)?.itemId ?? ''
  const [lines, setLines] = useState<Line[]>([{ itemId: firstItem, qty: 0 }])
  useEffect(() => {
    setLines([{ itemId: s.stock.find((x) => x.officeId === officeId && x.qty > 0)?.itemId ?? '', qty: 0 }])
    setActivityId('')
  }, [officeId]) // eslint-disable-line react-hooks/exhaustive-deps
  const avail = (i: string) => s.stock.find((x) => x.itemId === i && x.officeId === officeId)?.qty ?? 0
  const valid = lines.length > 0 && lines.every((l) => l.itemId && l.qty > 0 && l.qty <= avail(l.itemId))
  const recent = s.stockMoves.filter((m) => m.kind === 'issue' && (!scopeOffice || m.officeId === scopeOffice)).sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 15)
  return (
    <div>
      <PageHeader title={ar ? 'صرف المواد' : 'Issue stock'} sub={ar ? 'صرف المواد على نشاط يربطها بتقريره الفني، ويُحمّل قيمتها على بند المشروع.' : 'Issuing to an activity links the goods to its field report and charges their value to the project line.'} />
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={ar ? 'من مخزن' : 'From store'}>
              <select className={inputCls} value={officeId} onChange={(e) => setOfficeId(e.target.value)} disabled={!!scopeOffice}>
                {stores.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.isHQ ? (ar ? 'مخزن الرئاسة' : 'HQ store') : o.name[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'للنشاط' : 'For activity'} hint={ar ? 'اختياري، لكنه يربط المواد بالتقرير الفني' : 'Optional, but links the goods to the field report'}>
              <select className={inputCls} value={activityId} onChange={(e) => setActivityId(e.target.value)}>
                <option value="">{ar ? '— بدون نشاط —' : '— no activity —'}</option>
                {acts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.title[lang]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <LinesEditor lines={lines} onChange={setLines} officeId={officeId} limitToStock />
          <div className="flex justify-end">
            <Button
              disabled={!valid || !can('supply', 'edit')}
              onClick={() => {
                if (s.issueSupplies({ officeId, activityId: activityId || undefined, lines })) setLines([{ itemId: firstItem, qty: 0 }])
              }}
            >
              <ArrowUpFromLine size={16} /> {ar ? 'صرف المواد' : 'Issue stock'}
            </Button>
          </div>
        </Panel>
        <Panel title={ar ? 'آخر عمليات الصرف' : 'Latest issues'}>
          <MovesTable moves={recent} />
        </Panel>
      </div>
    </div>
  )
}

export function Items() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can } = usePerm()
  const [edit, setEdit] = useState<Item | null>(null)
  return (
    <div>
      <PageHeader
        title={ar ? 'الأصناف' : 'Items'}
        sub={ar ? 'قائمة المواد وقيمة الوحدة والحد الأدنى. ينبّه النظام عندما ينخفض رصيد صنف عن حده الأدنى في أي مخزن.' : 'The list of goods, unit values and minimum levels. You’re alerted when any store falls below an item’s minimum.'}
        actions={
          can('supply', 'manage') && (
            <Button onClick={() => setEdit({ id: '', code: '', name: { ar: '', en: '' }, unit: { ar: '', en: '' }, category: 'medicine', unitValueUSD: 0, min: 0, active: true })}>
              <Plus size={16} /> {ar ? 'صنف جديد' : 'New item'}
            </Button>
          )
        }
      />
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الرمز' : 'Code'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الصنف' : 'Item'}</th>
              <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الفئة' : 'Category'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'قيمة الوحدة' : 'Unit value'}</th>
              <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الحد الأدنى' : 'Minimum'}</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.items.map((it) => (
              <tr key={it.id} className={it.active === false ? 'opacity-55' : ''}>
                <td className="num px-5 py-2.5 text-muted">{it.code}</td>
                <td className="py-2.5 pe-3">
                  {it.name[lang]}
                  <span className="block text-[12.5px] text-muted">{it.unit[lang]}</span>
                </td>
                <td className="py-2.5 pe-3">{categoryName[it.category][lang]}</td>
                <td className="num py-2.5 pe-3 text-end">{usd(it.unitValueUSD)}</td>
                <td className="num py-2.5 pe-3 text-end">{it.min}</td>
                <td className="px-5 py-2.5 text-end">
                  {can('supply', 'manage') && (
                    <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-nile hover:bg-nile-soft" onClick={() => setEdit(it)}>
                      <Pencil size={14} /> {ar ? 'تعديل' : 'Edit'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {edit && <ItemModal item={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [d, setD] = useState(item)
  const valid = (d.name.ar || d.name.en).trim().length > 1
  return (
    <Modal open onClose={onClose} title={item.id ? (ar ? 'تعديل الصنف' : 'Edit item') : ar ? 'صنف جديد' : 'New item'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={ar ? 'الاسم بالعربية' : 'Name (Arabic)'}>
          <input className={inputCls} dir="rtl" value={d.name.ar} onChange={(e) => setD({ ...d, name: { ...d.name, ar: e.target.value } })} />
        </Field>
        <Field label={ar ? 'الاسم بالإنجليزية' : 'Name (English)'}>
          <input className={inputCls} dir="ltr" value={d.name.en} onChange={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} />
        </Field>
        <Field label={ar ? 'الوحدة' : 'Unit'}>
          <input className={inputCls} value={d.unit[lang]} onChange={(e) => setD({ ...d, unit: { ...d.unit, [lang]: e.target.value } })} placeholder={ar ? 'كرتونة، علبة…' : 'carton, box…'} />
        </Field>
        <Field label={ar ? 'الفئة' : 'Category'}>
          <select className={inputCls} value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as ItemCategory })}>
            {Object.entries(categoryName).map(([k, v]) => (
              <option key={k} value={k}>
                {v[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? 'قيمة الوحدة (دولار)' : 'Unit value (USD)'}>
          <input type="number" min={0} className={`${inputCls} num`} value={d.unitValueUSD || ''} onChange={(e) => setD({ ...d, unitValueUSD: Math.max(0, +e.target.value) })} />
        </Field>
        <Field label={ar ? 'الحد الأدنى لكل مخزن' : 'Minimum per store'}>
          <input type="number" min={0} className={`${inputCls} num`} value={d.min || ''} onChange={(e) => setD({ ...d, min: Math.max(0, Math.floor(+e.target.value)) })} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[14px]">
        <input type="checkbox" className="size-4" checked={d.active !== false} onChange={(e) => setD({ ...d, active: e.target.checked })} />
        {ar ? 'الصنف مستخدم' : 'Item in use'}
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!valid}
          onClick={() => {
            const n = s.items.length + 1
            s.saveItem({ ...d, id: d.id || `i-${Date.now().toString(36)}`, code: d.code || `ITM-${String(n).padStart(3, '0')}`, name: { ar: d.name.ar || d.name.en, en: d.name.en || d.name.ar } })
            onClose()
          }}
        >
          {ar ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
