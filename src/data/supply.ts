import { daysFromNow } from './seed'
import type { Bi, FieldActivity, Item, ItemCategory, JournalEntry, Shipment, StockLevel, StockMove, Vehicle } from './types'

export const categoryName: Record<ItemCategory, Bi> = {
  nutrition: { ar: 'تغذية', en: 'Nutrition' },
  medicine: { ar: 'أدوية', en: 'Medicines' },
  medical_supply: { ar: 'مستلزمات طبية', en: 'Medical supplies' },
  equipment: { ar: 'معدات', en: 'Equipment' },
}

/** Expense account an issued item posts to. */
export const categoryAccount: Record<ItemCategory, string> = { nutrition: '5104', medicine: '5102', medical_supply: '5102', equipment: '5299' }
export const INVENTORY = '1105'
export const INKIND_REVENUE = '4103'

const I = (id: string, code: string, ar: string, en: string, uar: string, uen: string, category: ItemCategory, unitValueUSD: number, min: number): Item => ({
  id,
  code,
  name: { ar, en },
  unit: { ar: uar, en: uen },
  category,
  unitValueUSD,
  min,
  active: true,
})

export const items: Item[] = [
  I('i1', 'NUT-001', 'بسكويت عالي الطاقة BP-5', 'High-energy biscuits BP-5', 'كرتونة', 'carton', 'nutrition', 28, 40),
  I('i2', 'NUT-002', 'أغذية علاجية جاهزة (بلمبي نت)', 'Ready-to-use therapeutic food (Plumpy’Nut)', 'كرتونة 150 كيس', 'carton of 150', 'nutrition', 55, 30),
  I('i3', 'MED-001', 'أموكسيسيلين 500 ملغ', 'Amoxicillin 500 mg', 'علبة 100 كبسولة', 'box of 100', 'medicine', 6, 80),
  I('i4', 'MED-002', 'باراسيتامول 500 ملغ', 'Paracetamol 500 mg', 'علبة 1000 قرص', 'box of 1000', 'medicine', 9, 30),
  I('i5', 'MED-003', 'محلول رينجر لاكتات 500 مل', 'Ringer’s lactate 500 ml', 'كرتونة 20', 'carton of 20', 'medicine', 18, 25),
  I('i6', 'MED-004', 'أملاح الإرواء ORS', 'Oral rehydration salts (ORS)', 'كرتونة 100 كيس', 'carton of 100', 'medicine', 12, 25),
  I('i7', 'SUP-001', 'شرائط فحص الملاريا السريع', 'Malaria rapid test strips', 'علبة 25', 'box of 25', 'medical_supply', 15, 20),
  I('i8', 'SUP-002', 'قفازات طبية', 'Medical gloves', 'كرتونة 10 علب', 'carton of 10 boxes', 'medical_supply', 22, 15),
  I('i9', 'SUP-003', 'أقراص تنقية المياه', 'Water purification tablets', 'علبة 1000', 'box of 1000', 'medical_supply', 30, 10),
  I('i10', 'EQP-001', 'حقيبة إسعافات أولية', 'First aid kit', 'حقيبة', 'kit', 'equipment', 35, 5),
]

export const vehicles: Vehicle[] = [
  { id: 'v1', plate: 'خ ط 4417', model: { ar: 'إيسوزو شاحنة 7 طن', en: 'Isuzu 7-ton truck' }, kind: 'truck', officeId: 'khr', driver: { ar: 'عمر عبدالله', en: 'Omar Abdalla' }, status: 'available', odometer: 186_420, fuel: [], nextServiceKm: 190_000 },
  { id: 'v2', plate: 'خ ط 2290', model: { ar: 'تويوتا لاندكروزر', en: 'Toyota Land Cruiser' }, kind: 'suv', officeId: 'khr', driver: { ar: 'إسماعيل حامد', en: 'Ismail Hamid' }, status: 'available', odometer: 142_310, fuel: [], nextServiceKm: 145_000 },
  { id: 'v3', plate: 'ك س 1182', model: { ar: 'تويوتا هايلكس', en: 'Toyota Hilux' }, kind: 'pickup', officeId: 'ksl', driver: { ar: 'الطيب محمد', en: 'Eltayeb Mohamed' }, status: 'available', odometer: 98_740, fuel: [], nextServiceKm: 99_500 },
  { id: 'v4', plate: 'ب ح 3305', model: { ar: 'تويوتا هايلكس', en: 'Toyota Hilux' }, kind: 'pickup', officeId: 'pts', driver: { ar: 'حسن أوهاج', en: 'Hassan Ohaj' }, status: 'available', odometer: 121_050, fuel: [], nextServiceKm: 125_000 },
  { id: 'v5', plate: 'ش د 0871', model: { ar: 'تويوتا لاندكروزر — إسعاف', en: 'Toyota Land Cruiser — ambulance' }, kind: 'ambulance', officeId: 'fsh', driver: { ar: 'يعقوب آدم', en: 'Yagoub Adam' }, status: 'maintenance', odometer: 203_880, fuel: [], nextServiceKm: 203_000 },
]

/** Builds the stock history: receipts at the Khartoum store, shipments to offices, issues to activities, plus their journal entries. */
export function buildSupply(activities: FieldActivity[], rateOn: (iso: string) => number) {
  const moves: StockMove[] = []
  const journal: JournalEntry[] = []
  const shipments: Shipment[] = []
  const stock = new Map<string, number>()
  const k = (i: string, o: string) => `${i}|${o}`
  const add = (i: string, o: string, q: number) => stock.set(k(i, o), (stock.get(k(i, o)) ?? 0) + q)
  const item = (id: string) => items.find((x) => x.id === id)!
  let mv = 1
  let jn = 1
  const move = (m: Omit<StockMove, 'id' | 'no' | 'valueUSD'>) => {
    const it = item(m.itemId)
    const rec: StockMove = { ...m, id: `mv-${mv}`, no: `${m.kind === 'receipt' ? 'GRN' : m.kind === 'issue' ? 'ISS' : 'TRF'}-${String(mv).padStart(4, '0')}`, valueUSD: Math.round(m.qty * it.unitValueUSD * 100) / 100 }
    mv++
    moves.push(rec)
    add(m.itemId, m.officeId, m.kind === 'receipt' || m.kind === 'transfer_in' ? m.qty : -m.qty)
    return rec
  }
  const je = (date: string, memo: Bi, lines: JournalEntry['lines'], ref?: string) => journal.push({ id: `je-s${jn++}`, no: '', date, memo, source: 'transfer', ref, lines })

  // 1. In-kind replenishment (التغذية) received at the Khartoum store
  const receipts: [number, Bi, [string, number, number?][]][] = [
    [-150, { ar: 'شحنة التغذية الأولى — الصندوق، الكويت', en: 'First replenishment — PHF Kuwait' }, [['i1', 1500], ['i2', 1000], ['i3', 1200, 400]]],
    [-75, { ar: 'شحنة التغذية الثانية — الصندوق، الكويت', en: 'Second replenishment — PHF Kuwait' }, [['i4', 400, 500], ['i5', 900, 300], ['i6', 1200, 600], ['i7', 600, 260], ['i8', 300]]],
    [-21, { ar: 'شحنة التغذية الثالثة — الصندوق، الكويت', en: 'Third replenishment — PHF Kuwait' }, [['i9', 400, 700], ['i10', 150], ['i1', 600], ['i3', 1200, 540]]],
  ]
  receipts.forEach(([d, source, lines], ri) => {
    const date = daysFromNow(d)
    const ref = `GRN-R${ri + 1}`
    let total = 0
    for (const [itemId, qty, exp] of lines) {
      const m = move({ kind: 'receipt', date, itemId, officeId: 'khr', qty, source, ref, expiry: exp ? daysFromNow(exp) : undefined, by: 'u-store' })
      total += m.valueUSD
    }
    je(date, { ar: `استلام تغذية عينية ${ref}`, en: `In-kind receipt ${ref}` }, [
      { account: INVENTORY, debit: total, credit: 0, officeId: 'khr' },
      { account: INKIND_REVENUE, debit: 0, credit: total },
    ], ref)
  })

  // 2. Shipments from Khartoum to offices
  const plan: [string, number, string, [string, number][], Shipment['status']][] = [
    ['ksl', -140, 'v1', [['i1', 300], ['i2', 120], ['i3', 300], ['i7', 0]], 'delivered'],
    ['gdf', -138, 'v1', [['i1', 200], ['i3', 200], ['i2', 80]], 'delivered'],
    ['fsh', -130, 'v1', [['i1', 600], ['i2', 380]], 'delivered'],
    ['pts', -70, 'v4', [['i4', 80], ['i5', 200], ['i6', 300], ['i8', 60]], 'delivered'],
    ['ksl', -68, 'v1', [['i4', 90], ['i5', 220], ['i6', 260], ['i7', 90], ['i8', 70]], 'delivered'],
    ['obd', -66, 'v2', [['i2', 120], ['i6', 150], ['i7', 40]], 'delivered'],
    ['fsh', -2, 'v1', [['i2', 150], ['i1', 300], ['i6', 200]], 'in_transit'],
    ['gdf', 0, 'v2', [['i3', 300], ['i7', 60], ['i9', 40]], 'preparing'],
  ]
  plan.forEach(([to, d, vehicleId, lines, status], i) => {
    const no = `SHP-${String(i + 21).padStart(4, '0')}`
    const at = daysFromNow(d)
    const real = lines.filter(([, q]) => q > 0)
    const sh: Shipment = {
      id: `sh-${i + 21}`,
      no,
      fromOfficeId: 'khr',
      toOfficeId: to,
      lines: real.map(([itemId, qty]) => ({ itemId, qty, received: status === 'delivered' ? qty : undefined })),
      vehicleId,
      driver: vehicles.find((v) => v.id === vehicleId)!.driver.ar,
      status,
      createdAt: daysFromNow(d - 1),
      departedAt: status !== 'preparing' ? at : undefined,
      deliveredAt: status === 'delivered' ? daysFromNow(d + 3) : undefined,
      receivedBy: status === 'delivered' ? 'u-fo' : undefined,
    }
    // One delivery arrived short: 10 cartons damaged on the road to El Fasher.
    if (no === 'SHP-0023') sh.lines[1].received = 370
    shipments.push(sh)
    if (status === 'preparing') return
    for (const l of sh.lines) move({ kind: 'transfer_out', date: at, itemId: l.itemId, officeId: 'khr', qty: l.qty, ref: no })
    if (status === 'delivered')
      for (const l of sh.lines) {
        move({ kind: 'transfer_in', date: sh.deliveredAt!, itemId: l.itemId, officeId: to, qty: l.received!, ref: no })
        if (l.received! < l.qty) {
          const m = move({ kind: 'loss', date: sh.deliveredAt!, itemId: l.itemId, officeId: to, qty: 0, ref: no })
          m.qty = 0
          const lost = (l.qty - l.received!) * item(l.itemId).unitValueUSD
          je(sh.deliveredAt!, { ar: `تلف أثناء النقل ${no}`, en: `Lost in transit ${no}` }, [
            { account: '5299', debit: lost, credit: 0, officeId: to },
            { account: INVENTORY, debit: 0, credit: lost, officeId: 'khr' },
          ], no)
        }
      }
  })
  // remove zero-qty placeholder loss moves (value recorded in the journal entry)
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i].kind === 'loss' && moves[i].qty === 0) moves.splice(i, 1)

  // 3. Issues at offices to activities
  const issues: [string, string, string, number, number][] = [
    // office, item, activity code, qty, day
    ['ksl', 'i3', 'ACT-KSL-0128', 120, -9],
    ['ksl', 'i5', 'ACT-KSL-0128', 60, -9],
    ['ksl', 'i7', 'ACT-KSL-0128', 75, -9],
    ['ksl', 'i1', 'ACT-KSL-0135', 180, -34],
    ['ksl', 'i6', 'ACT-KSL-0135', 210, -34],
    ['gdf', 'i3', 'ACT-GDF-0081', 200, -15],
    ['gdf', 'i1', 'ACT-GDF-0084', 150, -12],
    ['gdf', 'i2', 'ACT-GDF-0084', 50, -12],
    ['fsh', 'i1', 'ACT-FSH-0027', 520, -24],
    ['fsh', 'i2', 'ACT-FSH-0027', 355, -24],
    ['pts', 'i6', 'ACT-PTS-0047', 240, -16],
    ['pts', 'i5', 'ACT-PTS-0047', 120, -16],
    ['pts', 'i8', 'ACT-PTS-0044', 20, -38],
    ['obd', 'i2', 'ACT-OBD-0019', 104, -10],
    ['obd', 'i6', 'ACT-OBD-0019', 140, -10],
  ]
  for (const [officeId, itemId, code, qty, d] of issues) {
    const act = activities.find((a) => a.code === code)
    const date = daysFromNow(d)
    const m = move({ kind: 'issue', date, itemId, officeId, qty, ref: code, activityId: act?.id, by: 'u-store' })
    je(date, { ar: `صرف مواد عينية ${m.no} — ${code}`, en: `In-kind issue ${m.no} — ${code}` }, [
      { account: categoryAccount[item(itemId).category], debit: m.valueUSD, credit: 0, officeId, projectId: act?.projectId, lineId: act?.lineId },
      { account: INVENTORY, debit: 0, credit: m.valueUSD, officeId },
    ], m.no)
  }

  // 4. Fuel logs
  const vs = structuredClone(vehicles)
  vs.forEach((v, vi) => {
    let odo = v.odometer - 3200
    for (let w = 0; w < 6; w++) {
      const date = daysFromNow(-60 + w * 10 + vi)
      const liters = v.kind === 'truck' ? 180 + ((w * 37) % 60) : 70 + ((w * 23) % 30)
      odo += v.kind === 'truck' ? 520 : 380
      v.fuel.push({ id: `f-${v.id}-${w}`, date, liters, costSDG: Math.round(liters * 2900 * (rateOn(date) / 2450)), odometer: odo, officeId: v.officeId })
    }
    v.odometer = odo
  })
  vs.find((v) => v.id === 'v1')!.status = 'on_trip'

  const levels: StockLevel[] = []
  stock.forEach((qty, key) => {
    const [itemId, officeId] = key.split('|')
    levels.push({ itemId, officeId, qty })
  })
  return { moves, journal, shipments, stock: levels, vehicles: vs }
}
