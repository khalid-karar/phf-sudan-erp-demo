import { ArrowLeft, ArrowRight, Fuel, PackageCheck, Plus, Truck, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import type { Shipment, Vehicle } from '../../data/types'
import { date, num, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'
import { LinesEditor } from './Supply'

const statusName = {
  preparing: { ar: 'قيد التجهيز', en: 'Preparing' },
  in_transit: { ar: 'في الطريق', en: 'In transit' },
  delivered: { ar: 'تم التسليم', en: 'Delivered' },
}

export function Shipments() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, scopeOffice } = usePerm()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [receiving, setReceiving] = useState<Shipment | null>(null)
  useEffect(() => {
    if (params.get('new')) {
      setCreating(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])
  const mine = s.shipments.filter((x) => !scopeOffice || x.toOfficeId === scopeOffice || x.fromOfficeId === scopeOffice)
  const office = (id: string) => s.offices.find((o) => o.id === id)
  const value = (sh: Shipment) => sh.lines.reduce((t, l) => t + l.qty * (s.items.find((i) => i.id === l.itemId)?.unitValueUSD ?? 0), 0)
  const Arrow = ar ? ArrowLeft : ArrowRight

  return (
    <div>
      <PageHeader
        title={ar ? 'الشحنات' : 'Shipments'}
        sub={ar ? 'نقل المواد من مخزن الرئاسة إلى المكاتب. المكتب المستلم يؤكد ما وصله فعلاً، ويُسجّل أي نقص تلقائياً.' : 'Moving goods from the HQ store to offices. The receiving office confirms what actually arrived, and any shortage is recorded automatically.'}
        actions={
          can('logistics', 'edit') && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> {ar ? 'شحنة جديدة' : 'New shipment'}
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {(['preparing', 'in_transit', 'delivered'] as const).map((st) => {
          const list = mine.filter((x) => x.status === st).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
          return (
            <section key={st} className="rounded-lg bg-[#e9eded] p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 text-[14.5px] font-semibold">
                {statusName[st][lang]}
                <span className="num rounded-full bg-surface px-2 text-[12.5px] text-muted">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {list.slice(0, st === 'delivered' ? 6 : 20).map((sh) => {
                  const v = s.vehicles.find((x) => x.id === sh.vehicleId)
                  const short = sh.lines.some((l) => l.received !== undefined && l.received < l.qty)
                  const canReceive = can('supply', 'edit') || can('logistics', 'edit') || scopeOffice === sh.toOfficeId
                  return (
                    <article key={sh.id} className="rounded-md border border-line bg-surface p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="num text-[13px] font-semibold">{sh.no}</span>
                        <span className="num text-[12.5px] text-muted">{usd(value(sh))}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[14px] font-medium">
                        {office(sh.fromOfficeId)?.isHQ ? (ar ? 'مخزن الرئاسة' : 'HQ store') : office(sh.fromOfficeId)?.name[lang]}
                        <Arrow size={14} className="text-muted" />
                        {office(sh.toOfficeId)?.name[lang]}
                      </div>
                      <ul className="mt-2 space-y-0.5 text-[12.5px] text-muted">
                        {sh.lines.map((l) => (
                          <li key={l.itemId} className="flex justify-between gap-2">
                            <span className="truncate">{s.items.find((i) => i.id === l.itemId)?.name[lang]}</span>
                            <span className={`num shrink-0 ${l.received !== undefined && l.received < l.qty ? 'font-medium text-crescent' : ''}`}>
                              {l.received !== undefined && l.received < l.qty ? `${num(l.received)}/` : ''}
                              {num(l.qty)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-[12px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Truck size={13} /> {v?.plate ?? '—'} — {sh.driver}
                        </span>
                        <span className="num">{sh.status === 'delivered' ? date(sh.deliveredAt!, lang) : sh.status === 'in_transit' ? (ar ? `انطلقت قبل ${Math.max(0, Math.round((Date.now() - +new Date(sh.departedAt!)) / 86_400_000))} يوم` : `left ${Math.max(0, Math.round((Date.now() - +new Date(sh.departedAt!)) / 86_400_000))} days ago`) : date(sh.createdAt, lang)}</span>
                      </div>
                      {short && <p className="mt-1.5 text-[12px] text-crescent">{ar ? 'وصلت ناقصة — سُجّل الفرق كتالف' : 'Arrived short — the difference was recorded as loss'}</p>}
                      {st === 'preparing' && can('logistics', 'edit') && (
                        <Button className="mt-3 h-9 w-full" onClick={() => s.dispatchShipment(sh.id)}>
                          <Truck size={15} /> {ar ? 'انطلاق الشحنة' : 'Dispatch'}
                        </Button>
                      )}
                      {st === 'in_transit' && canReceive && (
                        <Button variant="ok" className="mt-3 h-9 w-full" onClick={() => setReceiving(sh)}>
                          <PackageCheck size={15} /> {ar ? 'تأكيد الاستلام' : 'Confirm receipt'}
                        </Button>
                      )}
                    </article>
                  )
                })}
                {list.length === 0 && <p className="px-1 py-6 text-center text-[13px] text-muted">{ar ? 'لا شحنات' : 'No shipments'}</p>}
              </div>
            </section>
          )
        })}
      </div>
      {creating && <NewShipment onClose={() => setCreating(false)} />}
      {receiving && <ReceiveShipment sh={receiving} onClose={() => setReceiving(null)} />}
    </div>
  )
}

function NewShipment({ onClose }: { onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [from, setFrom] = useState('khr')
  const [to, setTo] = useState('fsh')
  const free = s.vehicles.filter((v) => v.status === 'available')
  const [vehicleId, setVehicleId] = useState(free[0]?.id ?? '')
  const [lines, setLines] = useState([{ itemId: 'i2', qty: 100 }])
  const avail = (i: string) => s.stock.find((x) => x.itemId === i && x.officeId === from)?.qty ?? 0
  const valid = from !== to && lines.length > 0 && lines.every((l) => l.qty > 0 && l.qty <= avail(l.itemId))
  // Suggest what the receiving office is short of.
  const short = s.items.filter((it) => (s.stock.find((x) => x.itemId === it.id && x.officeId === to)?.qty ?? Infinity) < it.min)
  return (
    <Modal open onClose={onClose} title={ar ? 'شحنة جديدة' : 'New shipment'} wide>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={ar ? 'من' : 'From'}>
          <select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}>
            {s.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.isHQ ? (ar ? 'مخزن الرئاسة' : 'HQ store') : o.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? 'إلى' : 'To'}>
          <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
            {s.offices
              .filter((o) => o.id !== from)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name[lang]}
                </option>
              ))}
          </select>
        </Field>
        <Field label={ar ? 'المركبة' : 'Vehicle'}>
          <select className={inputCls} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {free.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.model[lang]}
              </option>
            ))}
            {!free.length && <option value="">{ar ? 'لا توجد مركبة متاحة' : 'No vehicle available'}</option>}
          </select>
        </Field>
      </div>
      {short.length > 0 && (
        <div className="mt-4 rounded-md bg-amber-soft px-3 py-2 text-[13px] text-amber">
          {ar ? 'هذا المكتب تحت الحد الأدنى في: ' : 'This office is below minimum on: '}
          {short.map((it, i) => (
            <button key={it.id} className="font-medium underline" onClick={() => !lines.some((l) => l.itemId === it.id) && setLines([...lines, { itemId: it.id, qty: it.min * 2 }])}>
              {it.name[lang]}
              {i < short.length - 1 ? (ar ? '، ' : ', ') : ''}
            </button>
          ))}
          {ar ? ' — اضغط لإضافته.' : ' — click to add.'}
        </div>
      )}
      <div className="mt-4">
        <LinesEditor lines={lines} onChange={setLines} officeId={from} limitToStock />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!valid}
          onClick={() => {
            const v = s.vehicles.find((x) => x.id === vehicleId)
            s.createShipment({ fromOfficeId: from, toOfficeId: to, vehicleId: vehicleId || undefined, driver: v?.driver[lang], lines })
            onClose()
          }}
        >
          {ar ? 'إنشاء الشحنة' : 'Create shipment'}
        </Button>
      </div>
    </Modal>
  )
}

function ReceiveShipment({ sh, onClose }: { sh: Shipment; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [rec, setRec] = useState<Record<string, number>>(Object.fromEntries(sh.lines.map((l) => [l.itemId, l.qty])))
  const short = sh.lines.reduce((t, l) => t + (l.qty - (rec[l.itemId] ?? l.qty)) * (s.items.find((i) => i.id === l.itemId)?.unitValueUSD ?? 0), 0)
  return (
    <Modal open onClose={onClose} title={`${ar ? 'تأكيد استلام' : 'Confirm receipt of'} ${sh.no}`}>
      <p className="mb-3 text-[13.5px] text-muted">{ar ? 'عدّ ما وصل فعلاً. إذا وصل أقل من المرسل، عدّل الرقم ليُسجّل الفرق.' : 'Count what actually arrived. If it’s less than was sent, change the number so the difference is recorded.'}</p>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-[12.5px] text-muted">
            <th className="pb-1.5 text-start font-medium">{ar ? 'الصنف' : 'Item'}</th>
            <th className="pb-1.5 text-end font-medium">{ar ? 'المرسل' : 'Sent'}</th>
            <th className="w-28 pb-1.5 text-end font-medium">{ar ? 'الواصل' : 'Arrived'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sh.lines.map((l) => (
            <tr key={l.itemId}>
              <td className="py-2">{s.items.find((i) => i.id === l.itemId)?.name[lang]}</td>
              <td className="num py-2 text-end">{num(l.qty)}</td>
              <td className="py-2 ps-3">
                <input type="number" min={0} max={l.qty} className={`num h-9 w-full rounded-md border px-2 text-end ${(rec[l.itemId] ?? l.qty) < l.qty ? 'border-crescent' : 'border-line'}`} value={rec[l.itemId]} onChange={(e) => setRec({ ...rec, [l.itemId]: Math.max(0, Math.min(l.qty, Math.floor(+e.target.value))) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {short > 0 && <p className="mt-3 rounded-md bg-crescent-soft px-3 py-2 text-[13px] text-crescent">{ar ? `نقص بقيمة ${usd(short)} — سيُسجّل كتالف أثناء النقل.` : `Shortage worth ${usd(short)} — recorded as lost in transit.`}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          variant="ok"
          onClick={() => {
            s.receiveShipment(sh.id, rec)
            onClose()
          }}
        >
          <PackageCheck size={16} /> {ar ? 'تأكيد الاستلام' : 'Confirm receipt'}
        </Button>
      </div>
    </Modal>
  )
}

const kindName = { pickup: { ar: 'بيك أب', en: 'Pickup' }, suv: { ar: 'سيارة دفع رباعي', en: '4x4' }, truck: { ar: 'شاحنة', en: 'Truck' }, ambulance: { ar: 'إسعاف', en: 'Ambulance' } }
const vStatus = {
  available: { ar: 'متاحة', en: 'Available', cls: 'bg-leaf-soft text-leaf' },
  on_trip: { ar: 'في رحلة', en: 'On a trip', cls: 'bg-nile-soft text-nile' },
  maintenance: { ar: 'في الصيانة', en: 'In maintenance', cls: 'bg-amber-soft text-amber' },
}

export function Fleet() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, scopeOffice } = usePerm()
  const [fuel, setFuel] = useState<Vehicle | null>(null)
  const list = s.vehicles.filter((v) => !scopeOffice || v.officeId === scopeOffice)
  const rate = s.rates.at(-1)!.rate
  return (
    <div>
      <PageHeader title={ar ? 'المركبات والوقود' : 'Vehicles & fuel'} sub={ar ? 'حالة كل مركبة، واستهلاك الوقود، وموعد الصيانة القادم.' : 'Each vehicle’s status, fuel use and next service.'} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((v) => {
          const last30 = v.fuel.filter((f) => Date.now() - +new Date(f.date) < 30 * 86_400_000)
          const liters = last30.reduce((t, f) => t + f.liters, 0)
          const cost = last30.reduce((t, f) => t + f.costSDG, 0)
          const sorted = [...v.fuel].sort((a, b) => a.odometer - b.odometer)
          const km = sorted.length > 1 ? sorted.at(-1)!.odometer - sorted[0].odometer : 0
          const per100 = km ? (sorted.slice(1).reduce((t, f) => t + f.liters, 0) / km) * 100 : 0
          const serviceDue = v.odometer >= v.nextServiceKm
          return (
            <Panel key={v.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-kufi text-[17px] font-semibold">{v.plate}</div>
                  <div className="text-[13px] text-muted">
                    {v.model[lang]} — {kindName[v.kind][lang]}
                  </div>
                </div>
                <span className={`rounded px-2 py-0.5 text-[12px] ${vStatus[v.status].cls}`}>{vStatus[v.status][lang]}</span>
              </div>
              <dl className="num mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-muted">{ar ? 'المكتب' : 'Office'}</dt>
                <dd>{s.offices.find((o) => o.id === v.officeId)?.name[lang]}</dd>
                <dt className="text-muted">{ar ? 'السائق' : 'Driver'}</dt>
                <dd>{v.driver[lang]}</dd>
                <dt className="text-muted">{ar ? 'العداد' : 'Odometer'}</dt>
                <dd>{num(v.odometer)} km</dd>
                <dt className="text-muted">{ar ? 'وقود آخر 30 يوماً' : 'Fuel, last 30 days'}</dt>
                <dd>
                  {num(liters)} L — {usd(cost / rate)}
                </dd>
                <dt className="text-muted">{ar ? 'المعدل' : 'Consumption'}</dt>
                <dd>{per100 ? `${per100.toFixed(1)} L/100km` : '—'}</dd>
              </dl>
              <div className={`mt-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] ${serviceDue ? 'bg-crescent-soft text-crescent' : 'bg-paper text-muted'}`}>
                <Wrench size={14} />
                {serviceDue ? (ar ? `تجاوزت موعد الصيانة (${num(v.nextServiceKm)} km)` : `Service overdue (${num(v.nextServiceKm)} km)`) : ar ? `الصيانة القادمة عند ${num(v.nextServiceKm)} km` : `Next service at ${num(v.nextServiceKm)} km`}
              </div>
              {can('logistics', 'edit') && (
                <div className="mt-3 flex gap-2">
                  <Button variant="quiet" className="h-9 flex-1" onClick={() => setFuel(v)}>
                    <Fuel size={15} /> {ar ? 'تسجيل وقود' : 'Log fuel'}
                  </Button>
                  <Button variant="quiet" className="h-9 flex-1" onClick={() => s.saveVehicle({ ...v, status: v.status === 'maintenance' ? 'available' : 'maintenance', nextServiceKm: v.status === 'maintenance' ? v.odometer + 5000 : v.nextServiceKm })}>
                    <Wrench size={15} /> {v.status === 'maintenance' ? (ar ? 'إنهاء الصيانة' : 'End maintenance') : ar ? 'إدخال للصيانة' : 'Send to service'}
                  </Button>
                </div>
              )}
            </Panel>
          )
        })}
      </div>
      {fuel && <FuelModal v={fuel} onClose={() => setFuel(null)} />}
    </div>
  )
}

function FuelModal({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [liters, setLiters] = useState(60)
  const [cost, setCost] = useState(174000)
  const [odo, setOdo] = useState(v.odometer + 300)
  return (
    <Modal open onClose={onClose} title={`${ar ? 'تسجيل وقود' : 'Log fuel'} — ${v.plate}`}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={ar ? 'اللترات' : 'Liters'}>
          <input type="number" className={`${inputCls} num`} value={liters} onChange={(e) => setLiters(Math.max(0, +e.target.value))} />
        </Field>
        <Field label={ar ? 'التكلفة (جنيه)' : 'Cost (SDG)'}>
          <input type="number" className={`${inputCls} num`} value={cost} onChange={(e) => setCost(Math.max(0, +e.target.value))} />
        </Field>
        <Field label={ar ? 'قراءة العداد' : 'Odometer'}>
          <input type="number" className={`${inputCls} num`} value={odo} onChange={(e) => setOdo(Math.max(0, +e.target.value))} />
        </Field>
      </div>
      {odo < v.odometer && <p className="mt-2 text-[13px] text-crescent">{ar ? 'قراءة العداد أقل من آخر قراءة مسجلة.' : 'The odometer is lower than the last reading.'}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!liters || odo < v.odometer}
          onClick={() => {
            s.addFuel(v.id, { date: new Date().toISOString(), liters, costSDG: cost, odometer: odo, officeId: v.officeId })
            onClose()
          }}
        >
          {ar ? 'حفظ' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
