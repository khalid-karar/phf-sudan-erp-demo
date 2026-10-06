import { revaluation } from '../lib/ledger'
import { daysFromNow, offices, projects } from './seed'
import type {
  Account,
  Advance,
  Expense,
  FieldActivity,
  JournalEntry,
  JournalLine,
  MonthClose,
  RateEntry,
  Staff,
  Voucher,
} from './types'

// ---------------------------------------------------------------------------
// Chart of accounts — NGO / fund-accounting style.
// The account says WHAT the money is; project, budget line and office travel on
// every journal line as dimensions, so the chart stays short and stable.
// ---------------------------------------------------------------------------

const officeCode = (id: string) => String(offices.findIndex((o) => o.id === id) + 1).padStart(2, '0')
/** Cash box account of an office. Pass the live accounts list once offices can be added at runtime. */
export const cashAccount = (officeId: string, accts?: Account[]) =>
  (accts ?? accounts).find((a) => a.parent === '1101' && a.officeId === officeId)?.code ?? `1101-${officeCode(officeId)}`
export const BANK_SDG = '1102-01'
export const BANK_USD = '1102-02'
export const BANK_PTS = '1102-03'
export const ADVANCES = '1103'
export const FX_LOSS = '5206'
export const FX_GAIN = '4104'

const A = (code: string, parent: string | null, ar: string, en: string, type: Account['type'], postable = true, extra: Partial<Account> = {}): Account => ({
  code,
  parent,
  name: { ar, en },
  type,
  postable,
  ...extra,
})

export const accounts: Account[] = [
  A('1', null, 'الأصول', 'Assets', 'asset', false),
  A('11', '1', 'الأصول المتداولة', 'Current assets', 'asset', false),
  A('1101', '11', 'النقدية بصناديق المكاتب', 'Office cash boxes', 'asset', false),
  ...offices.map((o) =>
    A(`1101-${officeCode(o.id)}`, '1101', `صندوق ${o.isHQ ? 'الرئاسة' : `مكتب ${o.name.ar}`}`, `${o.isHQ ? 'HQ' : o.name.en} cash box`, 'asset', true, { currency: 'SDG', officeId: o.id }),
  ),
  A('1102', '11', 'النقدية بالبنوك', 'Cash at bank', 'asset', false),
  A(BANK_SDG, '1102', 'بنك الخرطوم — جاري بالجنيه', 'Bank of Khartoum — SDG current', 'asset', true, { currency: 'SDG', officeId: 'khr' }),
  A(BANK_USD, '1102', 'بنك الخرطوم — حساب بالدولار', 'Bank of Khartoum — USD account', 'asset', true, { currency: 'USD', officeId: 'khr' }),
  A(BANK_PTS, '1102', 'بنك فيصل الإسلامي — بورتسودان', 'Faisal Islamic Bank — Port Sudan', 'asset', true, { currency: 'SDG', officeId: 'pts' }),
  A(ADVANCES, '11', 'العُهد النقدية للموظفين', 'Staff cash advances', 'asset'),
  A('1104', '11', 'منح مستحقة من المانحين', 'Grants receivable', 'asset'),
  A('1105', '11', 'مخزون المواد الطبية والغذائية', 'Medical & food stock', 'asset'),
  A('12', '1', 'الأصول الثابتة', 'Fixed assets', 'asset', false),
  A('1201', '12', 'المركبات', 'Vehicles', 'asset'),
  A('1202', '12', 'الأجهزة الطبية', 'Medical equipment', 'asset'),
  A('1203', '12', 'الأثاث والمعدات المكتبية', 'Furniture & office equipment', 'asset'),
  A('1209', '12', 'مجمع الإهلاك', 'Accumulated depreciation', 'asset'),

  A('2', null, 'الالتزامات', 'Liabilities', 'liability', false),
  A('21', '2', 'الالتزامات المتداولة', 'Current liabilities', 'liability', false),
  A('2101', '21', 'الموردون', 'Suppliers payable', 'liability'),
  A('2102', '21', 'مستحقات الموظفين', 'Staff payables', 'liability'),
  A('2103', '21', 'منح مقبوضة مقدماً', 'Grants received in advance', 'liability'),
  A('2104', '21', 'أمانات وتأمينات', 'Deposits held', 'liability'),

  A('3', null, 'صافي الأصول', 'Net assets', 'net_assets', false),
  A('3101', '3', 'صافي الأصول غير المقيدة', 'Unrestricted net assets', 'net_assets'),
  A('3102', '3', 'صافي الأصول المقيدة', 'Restricted net assets', 'net_assets'),

  A('4', null, 'الإيرادات', 'Revenue', 'revenue', false),
  A('4101', '4', 'منح نقدية مقيدة بمشاريع', 'Restricted project grants', 'revenue'),
  A('4102', '4', 'تبرعات عامة غير مقيدة', 'Unrestricted donations', 'revenue'),
  A('4103', '4', 'تبرعات عينية (التغذية)', 'In-kind donations (replenishment)', 'revenue'),
  A(FX_GAIN, '4', 'أرباح فروق العملة', 'Foreign exchange gains', 'revenue'),

  A('5', null, 'المصروفات', 'Expenses', 'expense', false),
  A('51', '5', 'مصروفات البرامج', 'Programme expenses', 'expense', false),
  A('5101', '51', 'الخدمات العلاجية', 'Treatment services', 'expense'),
  A('5102', '51', 'الأدوية والمستلزمات الطبية', 'Medicines & medical supplies', 'expense'),
  A('5103', '51', 'التدريب وبناء القدرات', 'Training & capacity building', 'expense'),
  A('5104', '51', 'التغذية العلاجية', 'Therapeutic nutrition', 'expense'),
  A('5105', '51', 'حوافز الكوادر الميدانية', 'Field staff incentives', 'expense'),
  A('52', '5', 'المصروفات الإدارية والتشغيلية', 'Admin & operating expenses', 'expense', false),
  A('5201', '52', 'الرواتب والأجور', 'Salaries & wages', 'expense'),
  A('5202', '52', 'الوقود والتنقلات', 'Fuel & transport', 'expense'),
  A('5203', '52', 'الاتصالات والإنترنت', 'Communications & internet', 'expense'),
  A('5204', '52', 'القرطاسية والمطبوعات', 'Stationery & printing', 'expense'),
  A('5205', '52', 'الرسوم البنكية', 'Bank charges', 'expense'),
  A(FX_LOSS, '52', 'خسائر فروق العملة', 'Foreign exchange losses', 'expense'),
  A('5207', '52', 'الإيجارات', 'Rent', 'expense'),
  A('5208', '52', 'المتابعة والتقييم والتدقيق', 'Monitoring, evaluation & audit', 'expense'),
  A('5209', '52', 'التأمين والأمن', 'Insurance & security', 'expense'),
  A('5299', '52', 'مصروفات أخرى', 'Other expenses', 'expense'),
]

/** Default mapping from each budget line to the expense account it posts to. Editable on the chart of accounts screen. */
export function defaultLineMap(): Record<string, string> {
  const byPillar: Record<string, string> = { 'pa-p1': '5101', 'pa-p2': '5102', 'pa-p3': '5103', 'pa-p4': '5299', 'pb-p1': '5104', 'pb-p2': '5104', 'pb-p3': '5208' }
  const special: Record<string, string> = {
    'pa-p1-l7': '5105',
    'pa-p4-l1': '5201',
    'pa-p4-l2': '5202',
    'pa-p4-l3': '5203',
    'pa-p4-l4': '5204',
    'pa-p4-l5': '5202',
    'pa-p4-l6': '5208',
    'pa-p4-l7': '5208',
    'pa-p4-l8': '5205',
    'pa-p4-l9': '5209',
    'pa-p3-l8': '5202',
    'pb-p1-l3': '5202',
    'pb-p2-l2': '5105',
    'pb-p3-l3': '5202',
    'pb-p3-l4': '5299',
  }
  const map: Record<string, string> = {}
  for (const p of projects) for (const pl of p.pillars) for (const l of pl.lines) map[l.id] = special[l.id] ?? byPillar[pl.id]
  return map
}

// ---------------------------------------------------------------------------
// Exchange-rate log — weekly, rising from ~2,050 to 2,450 SDG per USD.
// ---------------------------------------------------------------------------
export const rates: RateEntry[] = Array.from({ length: 27 }, (_, i) => {
  const age = (26 - i) * 7
  const t = i / 26
  const wiggle = i === 26 ? 0 : Math.round(Math.sin(i * 1.7) * 18)
  return {
    date: daysFromNow(-age),
    rate: Math.round(2050 + 400 * t * t * 0.4 + 400 * t * 0.6) + wiggle,
    source: { ar: 'السعر المعتمد — بنك الخرطوم', en: 'Approved rate — Bank of Khartoum' },
  }
})
rates[rates.length - 1].rate = 2450

export function rateOn(iso: string, log: RateEntry[] = rates) {
  const t = +new Date(iso)
  let r = log[0].rate
  for (const e of log) if (+new Date(e.date) <= t) r = e.rate
  return r
}

// ---------------------------------------------------------------------------
// People and field activities referenced by advances
// ---------------------------------------------------------------------------
export const staff: Staff[] = [
  { id: 's-ksl', name: { ar: 'محمد عثمان الأمين', en: 'Mohamed Osman Elamin' }, officeId: 'ksl', title: { ar: 'مسؤول ميداني', en: 'Field officer' } },
  { id: 's-fsh', name: { ar: 'آدم يحيى هارون', en: 'Adam Yahia Haroun' }, officeId: 'fsh', title: { ar: 'منسق التغذية', en: 'Nutrition coordinator' } },
  { id: 's-gdf', name: { ar: 'حواء عبدالله موسى', en: 'Hawa Abdalla Musa' }, officeId: 'gdf', title: { ar: 'مسؤولة ميدانية', en: 'Field officer' } },
  { id: 's-pts', name: { ar: 'عثمان بابكر علي', en: 'Osman Babiker Ali' }, officeId: 'pts', title: { ar: 'مسؤول إداري', en: 'Admin officer' } },
  { id: 's-obd', name: { ar: 'نفيسة إبراهيم آدم', en: 'Nafisa Ibrahim Adam' }, officeId: 'obd', title: { ar: 'مسؤولة ميدانية', en: 'Field officer' } },
]

type Rep = [string, number, number, number, number, string, string]
const act = (
  id: string,
  code: string,
  officeId: string,
  projectId: string,
  lineId: string,
  type: FieldActivity['type'],
  ar: string,
  en: string,
  day: number,
  location: string,
  plannedUSD: number,
  rep?: Rep, // [no, submitted day, men, women, children, summary ar, summary en]
): FieldActivity => ({
  id,
  code,
  officeId,
  projectId,
  lineId,
  type,
  title: { ar, en },
  date: daysFromNow(day),
  location,
  plannedUSD,
  createdBy: 'u-fo',
  report: rep
    ? {
        no: rep[0],
        submittedAt: daysFromNow(rep[1]),
        doneOn: daysFromNow(day),
        men: rep[2],
        women: rep[3],
        children: rep[4],
        beneficiaries: rep[2] + rep[3] + rep[4],
        summary: { ar: rep[5], en: rep[6] },
        via: 'online',
        submittedBy: officeId === 'ksl' ? 'u-fo' : officeId === 'fsh' ? 'u-fo2' : 'u-sup',
      }
    : undefined,
})

export const fieldActivities: FieldActivity[] = [
  act('act-128', 'ACT-KSL-0128', 'ksl', 'pa', 'pa-p1-l1', 'medical_day', 'يوم علاجي متنقل — قرية أروما', 'Mobile medical day — Aroma village', -9, 'أروما', 1200, ['TR-KSL-0128', -6, 96, 131, 85, 'كشف وعلاج 312 مريضاً، تحويل 9 حالات للمستشفى', '312 patients seen and treated, 9 cases referred']),
  act('act-131', 'ACT-KSL-0131', 'ksl', 'pa', 'pa-p1-l4', 'clinic', 'عيادة الأمومة والطفولة — ود الحليو', 'Maternal & child clinic — Wad Elhilew', -3, 'ود الحليو', 650),
  act('act-135', 'ACT-KSL-0135', 'ksl', 'pa', 'pa-p1-l4', 'clinic', 'عيادة صحة الأم والطفل المتنقلة — حي الختمية', 'Mobile mother & child clinic — Khatmiya', -34, 'كسلا — الختمية', 720, ['TR-KSL-0135', -32, 0, 164, 210, 'متابعة 164 حاملاً وفحص 210 أطفال', '164 pregnant women followed up, 210 children examined']),
  act('act-081', 'ACT-GDF-0081', 'gdf', 'pa', 'pa-p2-l2', 'distribution', 'توزيع مضادات حيوية — مركز القضارف', 'Antibiotics distribution — Gedaref centre', -15, 'القضارف', 800, ['TR-GDF-0081', -4, 201, 248, 91, 'صرف علاج لـ 540 مريضاً', 'Treatment dispensed to 540 patients']),
  act('act-084', 'ACT-GDF-0084', 'gdf', 'pa', 'pa-p1-l1', 'medical_day', 'يوم علاجي — القلابات', 'Medical day — Gallabat', -12, 'القلابات', 900, ['TR-GDF-0084', -10, 88, 120, 77, 'كشف 285 مريضاً وصرف أدوية', '285 patients examined, medicines dispensed']),
  act('act-088', 'ACT-GDF-0088', 'gdf', 'pa', 'pa-p3-l2', 'training', 'دورة القابلات — القضارف', 'Midwife course — Gedaref', 6, 'القضارف', 700),
  act('act-027', 'ACT-FSH-0027', 'fsh', 'pb', 'pb-p1-l3', 'transport', 'نقل شحنة مكملات غذائية إلى معسكر أبوشوك', 'Supplement shipment to Abu Shouk camp', -24, 'معسكر أبوشوك', 2400),
  act('act-030', 'ACT-FSH-0030', 'fsh', 'pb', 'pb-p2-l1', 'clinic', 'فحص سوء التغذية — معسكر زمزم', 'Malnutrition screening — Zamzam camp', -6, 'معسكر زمزم', 600),
  act('act-044', 'ACT-PTS-0044', 'pts', 'pa', 'pa-p3-l3', 'training', 'ورشة إسعافات أولية — بورتسودان', 'First aid workshop — Port Sudan', -38, 'بورتسودان', 600, ['TR-PTS-0044', -33, 17, 11, 0, 'تدريب 28 متطوعاً', '28 volunteers trained']),
  act('act-047', 'ACT-PTS-0047', 'pts', 'pa', 'pa-p2-l7', 'awareness', 'حملة تطعيم وتوعية بالكوليرا — حي سلبونا', 'Cholera vaccination & awareness — Salabona', -16, 'بورتسودان — سلبونا', 437, ['TR-PTS-0047', -15, 140, 190, 260, 'تطعيم 590 شخصاً وتوزيع أقراص تنقية مياه', '590 people vaccinated, water purification tablets handed out']),
  act('act-019', 'ACT-OBD-0019', 'obd', 'pb', 'pb-p2-l1', 'clinic', 'عيادة تغذية — الأبيض', 'Nutrition clinic — El Obeid', -10, 'الأبيض', 450, ['TR-OBD-0019', -9, 0, 38, 126, 'فحص 126 طفلاً، 14 حالة سوء تغذية حاد', '126 children screened, 14 severe cases']),
  act('act-142', 'ACT-KSL-0142', 'ksl', 'pa', 'pa-p1-l1', 'medical_day', 'يوم علاجي متنقل — قرية ود شريفي', 'Mobile medical day — Wad Sharifey village', 4, 'ود شريفي', 1840),
  act('act-144', 'ACT-KSL-0144', 'ksl', 'pa', 'pa-p3-l10', 'awareness', 'توعية صحية بالمدارس — كسلا', 'School health awareness — Kassala', 10, 'كسلا', 250),
  act('act-139', 'ACT-KSL-0139', 'ksl', 'pa', 'pa-p1-l7', 'medical_day', 'حوافز الطاقم — يوم ود الحليو العلاجي', 'Staff incentives — Wad Elhilew day', 2, 'ود الحليو', 380),
]

export const activityTypes: Record<NonNullable<FieldActivity['type']>, { ar: string; en: string }> = {
  medical_day: { ar: 'يوم علاجي', en: 'Medical day' },
  clinic: { ar: 'عيادة', en: 'Clinic' },
  distribution: { ar: 'توزيع', en: 'Distribution' },
  training: { ar: 'تدريب', en: 'Training' },
  transport: { ar: 'نقل', en: 'Transport' },
  awareness: { ar: 'توعية', en: 'Awareness' },
  other: { ar: 'أخرى', en: 'Other' },
}

// ---------------------------------------------------------------------------
// Ledger generated from the operational seed, so every report ties out.
// ---------------------------------------------------------------------------
export function buildFinance(expenses: Expense[], lineMap: Record<string, string>) {
  const journal: JournalEntry[] = []
  const vouchers: Voucher[] = []
  let jn = 1
  let pv = 1
  let rv = 1
  const je = (date: string, memo: JournalEntry['memo'], source: JournalEntry['source'], lines: JournalLine[], ref?: string) => {
    const e: JournalEntry = { id: `je-${jn}`, no: `JE-${String(jn).padStart(4, '0')}`, date, memo, source, ref, lines }
    jn++
    journal.push(e)
    return e
  }
  const sdgLine = (account: string, usd: number, date: string, side: 'dr' | 'cr', dims: Partial<JournalLine> = {}): JournalLine => {
    const r = rateOn(date)
    return { account, debit: side === 'dr' ? usd : 0, credit: side === 'cr' ? usd : 0, sdg: Math.round(usd * r) * (side === 'dr' ? 1 : -1), ...dims }
  }

  // Opening balances
  const openDate = daysFromNow(-182)
  je(openDate, { ar: 'أرصدة افتتاحية', en: 'Opening balances' }, 'opening', [
    { account: BANK_USD, debit: 200_000, credit: 0 },
    { account: '1201', debit: 86_000, credit: 0 },
    { account: '1202', debit: 41_500, credit: 0 },
    { account: '1203', debit: 12_300, credit: 0 },
    { account: '1209', debit: 0, credit: 38_400 },
    { account: '3101', debit: 0, credit: 301_400 },
  ])

  // Grant and donation receipts into the USD account
  const receipts: [number, number, string | undefined, string, { ar: string; en: string }, { ar: string; en: string }][] = [
    [-150, 60_000, 'pa', '4101', { ar: 'مانح (أ)', en: 'Donor A' }, { ar: 'الدفعة الأولى — مشروع (أ)', en: 'First tranche — Project A' }],
    [-85, 60_000, 'pb', '4101', { ar: 'مانح (ب)', en: 'Donor B' }, { ar: 'منحة مشروع (ب) كاملة', en: 'Project B grant, full amount' }],
    [-60, 40_000, 'pa', '4101', { ar: 'مانح (أ)', en: 'Donor A' }, { ar: 'الدفعة الثانية — مشروع (أ)', en: 'Second tranche — Project A' }],
    [-40, 52_000, undefined, '4102', { ar: 'الصندوق — الكويت', en: 'PHF — Kuwait' }, { ar: 'تبرعات عامة — الربع الثالث', en: 'General donations — Q3' }],
  ]
  for (const [d, amt, projectId, acc, party, memo] of receipts) {
    const date = daysFromNow(d)
    const e = je(date, memo, 'receipt', [{ account: BANK_USD, debit: amt, credit: 0, projectId }, { account: acc, debit: 0, credit: amt, projectId }], `RV-${String(rv).padStart(4, '0')}`)
    vouchers.push({
      id: `rv-${rv}`,
      no: `RV-${String(rv).padStart(4, '0')}`,
      kind: 'receipt',
      date,
      method: 'transfer',
      account: BANK_USD,
      amountUSD: amt,
      currency: 'USD',
      amount: amt,
      rate: rateOn(date),
      party,
      memo,
      officeId: 'khr',
      projectId,
      journalId: e.id,
    })
    rv++
  }

  // Decide how each expense was paid: offices pay small items from their cash box, bigger ones by bank.
  const payAccount = (ex: Expense) => (ex.officeId === 'pts' && ex.amountUSD > 900 ? BANK_PTS : ex.amountUSD > 1500 || ex.officeId === 'khr' ? BANK_SDG : cashAccount(ex.officeId))

  // Fund SDG accounts from the USD account before spending (currency conversions and transfers to offices)
  const needs: Record<string, number> = {}
  for (const ex of expenses) needs[payAccount(ex)] = (needs[payAccount(ex)] ?? 0) + ex.amountUSD
  needs[cashAccount('ksl')] = (needs[cashAccount('ksl')] ?? 0) + 2600 // room for advances
  needs[cashAccount('fsh')] = (needs[cashAccount('fsh')] ?? 0) + 2600
  needs[cashAccount('gdf')] = (needs[cashAccount('gdf')] ?? 0) + 1000
  needs[cashAccount('pts')] = (needs[cashAccount('pts')] ?? 0) + 700
  for (const [acc, total] of Object.entries(needs)) {
    const parts = [0.45, 0.35, 0.35]
    ;[-135, -95, -50].forEach((d, i) => {
      const date = daysFromNow(d)
      const amt = Math.round(total * parts[i])
      const office = accounts.find((a) => a.code === acc)?.officeId
      je(
        date,
        acc === BANK_SDG || acc === BANK_PTS
          ? { ar: 'تحويل عملة من الحساب الدولاري', en: 'Currency conversion from USD account' }
          : { ar: `تغذية ${accounts.find((a) => a.code === acc)!.name.ar}`, en: `Top-up of ${accounts.find((a) => a.code === acc)!.name.en}` },
        'transfer',
        [sdgLine(acc, amt, date, 'dr', { officeId: office }), { account: BANK_USD, debit: 0, credit: amt }],
      )
    })
  }

  // One payment voucher + journal entry per expense
  for (const ex of [...expenses].sort((a, b) => +new Date(a.date) - +new Date(b.date))) {
    const acc = payAccount(ex)
    const no = `PV-${String(pv).padStart(4, '0')}`
    const line = projects.flatMap((p) => p.pillars.flatMap((pl) => pl.lines)).find((l) => l.id === ex.lineId)!
    const dims = { officeId: ex.officeId, projectId: ex.projectId, lineId: ex.lineId }
    const memo = { ar: `${line.code} ${line.name.ar}`, en: `${line.code} ${line.name.en}` }
    const e = je(ex.date, memo, 'payment', [{ account: lineMap[ex.lineId], debit: ex.amountUSD, credit: 0, ...dims }, sdgLine(acc, ex.amountUSD, ex.date, 'cr', { officeId: ex.officeId })], no)
    const r = rateOn(ex.date)
    vouchers.push({
      id: `pv-${pv}`,
      no,
      kind: 'payment',
      date: ex.date,
      method: acc.startsWith('1101') ? 'cash' : 'bank',
      account: acc,
      amountUSD: ex.amountUSD,
      currency: 'SDG',
      amount: Math.round(ex.amountUSD * r),
      rate: r,
      party: { ar: 'موردون متعددون', en: 'Various suppliers' },
      memo,
      ...dims,
      journalId: e.id,
    })
    pv++
  }

  // Cash advances
  const adv = (no: string, staffId: string, officeId: string, projectId: string, lineId: string, activityCode: string, amountUSD: number, issued: number, due: number): Advance => ({
    id: no.toLowerCase(),
    no,
    staffId,
    officeId,
    projectId,
    lineId,
    activityCode,
    amountUSD,
    issuedAt: daysFromNow(issued),
    dueAt: daysFromNow(due),
    status: 'open',
  })
  const advances: Advance[] = [
    adv('ADV-0020', 's-ksl', 'ksl', 'pa', 'pa-p1-l1', 'ACT-KSL-0128', 1200, -11, 3),
    adv('ADV-0021', 's-ksl', 'ksl', 'pa', 'pa-p1-l4', 'ACT-KSL-0131', 650, -5, 9),
    adv('ADV-0019', 's-gdf', 'gdf', 'pa', 'pa-p2-l2', 'ACT-GDF-0081', 800, -16, -2),
    adv('ADV-0018', 's-fsh', 'fsh', 'pb', 'pb-p1-l3', 'ACT-FSH-0027', 2400, -26, -12),
    adv('ADV-0015', 's-pts', 'pts', 'pa', 'pa-p3-l3', 'ACT-PTS-0044', 600, -40, -26),
  ]
  const extraExpenses: Expense[] = []
  for (const a of advances) {
    const lines = [
      { account: ADVANCES, debit: a.amountUSD, credit: 0, officeId: a.officeId, projectId: a.projectId, lineId: a.lineId },
      sdgLine(cashAccount(a.officeId), a.amountUSD, a.issuedAt, 'cr', { officeId: a.officeId }),
    ]
    je(a.issuedAt, { ar: `صرف عهدة ${a.no} — ${a.activityCode}`, en: `Advance ${a.no} — ${a.activityCode}` }, 'advance', lines, a.no)
  }
  // ADV-0015 is already settled: 560 spent, 40 returned.
  const settled = advances.find((a) => a.no === 'ADV-0015')!
  const sAt = daysFromNow(-31)
  settled.status = 'settled'
  settled.settlement = {
    at: sAt,
    items: [
      { description: 'إيجار قاعة ليوم واحد', receiptNo: '4471', amountUSD: 180 },
      { description: 'حقائب إسعافات أولية للمتدربين', receiptNo: '4472', amountUSD: 290 },
      { description: 'وجبات المتدربين', receiptNo: '4475', amountUSD: 90 },
    ],
    returnedUSD: 40,
    reimbursedUSD: 0,
    reportNo: 'TR-PTS-0044',
  }
  const sDims = { officeId: 'pts', projectId: 'pa', lineId: 'pa-p3-l3' }
  je(
    sAt,
    { ar: 'تسوية عهدة ADV-0015', en: 'Settlement of advance ADV-0015' },
    'settlement',
    [
      { account: lineMap['pa-p3-l3'], debit: 560, credit: 0, ...sDims },
      sdgLine(cashAccount('pts'), 40, sAt, 'dr', { officeId: 'pts' }),
      { account: ADVANCES, debit: 0, credit: 600, ...sDims },
    ],
    'ADV-0015',
  )
  extraExpenses.push({ id: 'ex-adv-0015', activityCode: 'ACT-PTS-0044', lineId: 'pa-p3-l3', projectId: 'pa', officeId: 'pts', amountUSD: 560, date: sAt, hasTechReport: true })

  journal.sort((a, b) => +new Date(a.date) - +new Date(b.date))

  // Month-end revaluations of SDG balances, as the finance team would post them.
  for (const age of [-152, -121, -91, -60, -30]) {
    const at = daysFromNow(age)
    const upTo = journal.filter((e) => +new Date(e.date) <= +new Date(at))
    const r = rateOn(at)
    const rows = revaluation(accounts, upTo, r).filter((x) => Math.abs(x.diff) >= 0.5)
    if (!rows.length) continue
    const lines: JournalLine[] = rows.map((x) => {
      const d = Math.round(x.diff * 100) / 100
      return { account: x.account.code, debit: d > 0 ? d : 0, credit: d < 0 ? -d : 0, sdg: 0, officeId: x.account.officeId }
    })
    const net = Math.round(rows.reduce((t, x) => t + Math.round(x.diff * 100) / 100, 0) * 100) / 100
    lines.push(net < 0 ? { account: FX_LOSS, debit: -net, credit: 0 } : { account: FX_GAIN, debit: 0, credit: net })
    je(at, { ar: `إعادة تقييم أرصدة الجنيه نهاية الشهر بسعر ${r}`, en: `Month-end revaluation of SDG balances at ${r}` }, 'fx', lines)
    journal.sort((a, b) => +new Date(a.date) - +new Date(b.date))
  }
  journal.forEach((e, i) => (e.no = `JE-${String(i + 1).padStart(4, '0')}`))

  const closes: MonthClose[] = offices.map((o) => ({
    officeId: o.id,
    cashCounted: ['dgl', 'atb', 'kst', 'snr', 'dmz', 'wmd', 'obd'].includes(o.id),
    closedAt: ['dgl', 'atb', 'kst', 'snr', 'dmz', 'wmd'].includes(o.id) ? daysFromNow(-2) : undefined,
    closedBy: ['dgl', 'atb', 'kst', 'snr', 'dmz', 'wmd'].includes(o.id) ? 'u-fm' : undefined,
  }))

  return { journal, vouchers, advances, extraExpenses, closes, nextJe: jn, nextPv: pv, nextRv: rv }
}
