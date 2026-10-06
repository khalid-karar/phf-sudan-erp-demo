import type {
  ApprovalRule,
  ApprovalStep,
  Deadline,
  Expense,
  Fund,
  Office,
  Project,
  Reallocation,
  RoleKey,
  SpendRequest,
  User,
} from './types'

// All dates are relative to "now" so the demo never goes stale.
const DAY = 86_400_000
export const daysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString()

// Demo exchange rate (SDG per USD). The real system keeps a dated rate log.
export const SDG_RATE = 2450

export const offices: Office[] = [
  { id: 'khr', name: { ar: 'الرئاسة — الخرطوم', en: 'HQ — Khartoum' }, state: { ar: 'الخرطوم', en: 'Khartoum' }, lat: 15.5, lon: 32.56, isHQ: true },
  { id: 'pts', name: { ar: 'بورتسودان', en: 'Port Sudan' }, state: { ar: 'البحر الأحمر', en: 'Red Sea' }, lat: 19.62, lon: 37.22 },
  { id: 'ksl', name: { ar: 'كسلا', en: 'Kassala' }, state: { ar: 'كسلا', en: 'Kassala' }, lat: 15.45, lon: 36.4 },
  { id: 'gdf', name: { ar: 'القضارف', en: 'Gedaref' }, state: { ar: 'القضارف', en: 'Gedaref' }, lat: 14.03, lon: 35.38 },
  { id: 'atb', name: { ar: 'عطبرة', en: 'Atbara' }, state: { ar: 'نهر النيل', en: 'River Nile' }, lat: 17.7, lon: 33.99 },
  { id: 'dgl', name: { ar: 'دنقلا', en: 'Dongola' }, state: { ar: 'الشمالية', en: 'Northern' }, lat: 19.17, lon: 30.48 },
  { id: 'kst', name: { ar: 'كوستي', en: 'Kosti' }, state: { ar: 'النيل الأبيض', en: 'White Nile' }, lat: 13.16, lon: 32.66 },
  { id: 'snr', name: { ar: 'سنار', en: 'Sennar' }, state: { ar: 'سنار', en: 'Sennar' }, lat: 13.55, lon: 33.6 },
  { id: 'dmz', name: { ar: 'الدمازين', en: 'Ed Damazin' }, state: { ar: 'النيل الأزرق', en: 'Blue Nile' }, lat: 11.79, lon: 34.36 },
  { id: 'obd', name: { ar: 'الأبيض', en: 'El Obeid' }, state: { ar: 'شمال كردفان', en: 'North Kordofan' }, lat: 13.18, lon: 30.22 },
  { id: 'wmd', name: { ar: 'ود مدني', en: 'Wad Madani' }, state: { ar: 'الجزيرة', en: 'Gezira' }, lat: 14.4, lon: 33.52 },
  { id: 'fsh', name: { ar: 'الفاشر', en: 'El Fasher' }, state: { ar: 'شمال دارفور', en: 'North Darfur' }, lat: 13.63, lon: 25.35 },
]

export const users: User[] = [
  { id: 'u-fo', name: { ar: 'محمد عثمان الأمين', en: 'Mohamed Osman Elamin' }, role: 'field_officer', officeId: 'ksl' },
  { id: 'u-sup', name: { ar: 'سارة الطيب إدريس', en: 'Sara Eltayeb Idris' }, role: 'supervisor', officeId: 'ksl' },
  { id: 'u-fm', name: { ar: 'عبدالرحيم حسن النور', en: 'Abdelrahim Hassan Elnour' }, role: 'finance_manager', officeId: 'khr' },
  { id: 'u-ed', name: { ar: 'د. منى الفاتح', en: 'Dr. Mona Elfatih' }, role: 'executive_director', officeId: 'khr' },
]

export const roleNames: Record<RoleKey, { ar: string; en: string }> = {
  field_officer: { ar: 'مسؤول ميداني', en: 'Field officer' },
  supervisor: { ar: 'المشرف', en: 'Supervisor' },
  finance_manager: { ar: 'مدير الشؤون المالية والإدارية', en: 'Finance & Admin Manager' },
  executive_director: { ar: 'المدير التنفيذي', en: 'Executive Director' },
}

export const funds: Fund[] = [
  {
    id: 'f-cash',
    type: 'cash',
    name: { ar: 'الدعم النقدي', en: 'Cash support' },
    donor: { ar: 'يُستلم في الإدارة المالية', en: 'Received by Finance' },
    receivedUSD: 412_000,
  },
  {
    id: 'f-inkind',
    type: 'inkind',
    name: { ar: 'التغذية', en: 'Replenishment (in-kind)' },
    donor: { ar: 'يُستلم في سلسلة الإمداد', en: 'Received by Supply Chain' },
    receivedUSD: 186_500,
  },
]

type L = [string, string, number] // ar, en, ceiling
const pillar = (projectId: string, n: number, ar: string, en: string, lines: L[]) => ({
  id: `${projectId}-p${n}`,
  code: `${n}`,
  name: { ar, en },
  ceilingUSD: lines.reduce((s, l) => s + l[2], 0),
  lines: lines.map(([lar, len, c], i) => ({
    id: `${projectId}-p${n}-l${i + 1}`,
    code: `${n}.${i + 1}`,
    name: { ar: lar, en: len },
    ceilingUSD: c,
  })),
})

export const projects: Project[] = [
  {
    id: 'pa',
    code: 'PRJ-A',
    name: { ar: 'مشروع دعم الرعاية الصحية — شرق السودان', en: 'Health Care Support — Eastern Sudan' },
    donor: { ar: 'مانح (أ) — بيانات تجريبية', en: 'Donor A (sample)' },
    fundId: 'f-cash',
    start: daysFromNow(-160),
    end: daysFromNow(205),
    controlMode: 'hard',
    tolerancePct: 0,
    pillars: [
      pillar('pa', 1, 'الخدمات الصحية والعلاجية', 'Health & treatment services', [
        ['أيام علاجية متنقلة', 'Mobile medical days', 8000],
        ['عمليات جراحية للحالات الحرجة', 'Critical-case surgeries', 7000],
        ['فحوصات مخبرية', 'Lab tests', 3000],
        ['رعاية الأمومة والطفولة', 'Maternal & child care', 4500],
        ['علاج سوء التغذية', 'Malnutrition treatment', 4000],
        ['الإسعاف والإحالة', 'Ambulance & referrals', 3000],
        ['حوافز الكوادر الطبية', 'Medical staff incentives', 4000],
        ['تشغيل المراكز الصحية', 'Health centre operations', 3500],
        ['حملات التطعيم', 'Vaccination campaigns', 2000],
        ['الدعم النفسي', 'Psychosocial support', 1000],
      ]),
      pillar('pa', 2, 'الأدوية والمستلزمات الطبية', 'Medicines & medical supplies', [
        ['أدوية الأمراض المزمنة', 'Chronic disease medicines', 6000],
        ['المضادات الحيوية', 'Antibiotics', 4000],
        ['المحاليل الوريدية', 'IV fluids', 3000],
        ['مستهلكات جراحية', 'Surgical consumables', 4000],
        ['كواشف المختبر', 'Lab reagents', 2500],
        ['أدوية الأطفال', 'Paediatric medicines', 3000],
        ['اللقاحات وسلسلة التبريد', 'Vaccines & cold chain', 2500],
        ['أجهزة طبية صغيرة', 'Small medical devices', 2000],
        ['نقل وتخزين الأدوية', 'Medicine transport & storage', 1500],
        ['أدوات الوقاية الشخصية', 'Personal protective equipment', 1500],
      ]),
      pillar('pa', 3, 'التدريب وبناء القدرات', 'Training & capacity building', [
        ['تدريب الكوادر الصحية', 'Health staff training', 3000],
        ['تدريب القابلات', 'Midwife training', 2000],
        ['ورش الإسعافات الأولية', 'First aid workshops', 1500],
        ['تدريب متطوعي المجتمع', 'Community volunteer training', 1500],
        ['المواد التدريبية', 'Training materials', 1000],
        ['بدلات المدربين', 'Trainer allowances', 2000],
        ['القاعات والتجهيزات', 'Venues & equipment', 1000],
        ['تنقلات المتدربين', 'Trainee transport', 1500],
        ['الشهادات والاعتماد', 'Certificates & accreditation', 500],
        ['حملات التوعية الصحية', 'Health awareness campaigns', 1000],
      ]),
      pillar('pa', 4, 'الإدارة والمتابعة والتقييم', 'Management, monitoring & evaluation', [
        ['رواتب فريق المشروع', 'Project team salaries', 5000],
        ['الوقود والتنقلات', 'Fuel & transport', 2500],
        ['الاتصالات والإنترنت', 'Communications & internet', 1000],
        ['القرطاسية والطباعة', 'Stationery & printing', 500],
        ['زيارات المتابعة الميدانية', 'Field monitoring visits', 1500],
        ['التقييم النهائي', 'Final evaluation', 1500],
        ['التدقيق المالي', 'Financial audit', 1000],
        ['الرسوم البنكية والتحويلات', 'Bank & transfer fees', 500],
        ['التأمين والأمن', 'Insurance & security', 1000],
        ['الطوارئ', 'Contingency', 500],
      ]),
    ],
  },
  {
    id: 'pb',
    code: 'PRJ-B',
    name: { ar: 'مشروع التغذية العلاجية — شمال دارفور', en: 'Therapeutic Nutrition — North Darfur' },
    donor: { ar: 'مانح (ب) — بيانات تجريبية', en: 'Donor B (sample)' },
    fundId: 'f-cash',
    start: daysFromNow(-90),
    end: daysFromNow(275),
    controlMode: 'soft',
    tolerancePct: 10,
    pillars: [
      pillar('pb', 1, 'توزيع المكملات الغذائية', 'Nutrition supplement distribution', [
        ['بسكويت مدعّم', 'Fortified biscuits', 12000],
        ['أغذية علاجية جاهزة', 'Ready-to-use therapeutic food', 10000],
        ['النقل والتوزيع', 'Transport & distribution', 5000],
        ['المخازن', 'Warehousing', 3000],
      ]),
      pillar('pb', 2, 'عيادات التغذية', 'Nutrition clinics', [
        ['فحص الأطفال', 'Child screening', 6000],
        ['حوافز الكوادر', 'Staff incentives', 8000],
        ['معدات القياس', 'Measuring equipment', 3000],
        ['أدوية مرافقة', 'Supporting medicines', 3000],
      ]),
      pillar('pb', 3, 'المتابعة والتقارير', 'Monitoring & reporting', [
        ['المسوحات الميدانية', 'Field surveys', 4000],
        ['إعداد التقارير', 'Report preparation', 2000],
        ['التنقلات', 'Transport', 3000],
        ['الطوارئ', 'Contingency', 1000],
      ]),
    ],
  },
]

// --- Spending history -------------------------------------------------------
// For each line: [spent %, committed %]. Tuned so the demo has a story:
// line 1.1 is nearly exhausted, 1.9 has room to give, a few lines are near their ceiling.
const usage: Record<string, [number, number]> = {
  'pa-p1-l1': [0.65, 0.225], // 8000 → spent 5200, committed 1800, available 1000
  'pa-p1-l2': [0.52, 0.1],
  'pa-p1-l3': [0.4, 0.05],
  'pa-p1-l4': [0.48, 0.12],
  'pa-p1-l5': [0.7, 0.18],
  'pa-p1-l6': [0.35, 0],
  'pa-p1-l7': [0.5, 0.1],
  'pa-p1-l8': [0.55, 0.05],
  'pa-p1-l9': [0.2, 0.05],
  'pa-p1-l10': [0.1, 0],
  'pa-p2-l1': [0.62, 0.12],
  'pa-p2-l2': [0.55, 0.2],
  'pa-p2-l3': [0.4, 0.1],
  'pa-p2-l4': [0.6, 0.15],
  'pa-p2-l5': [0.3, 0.1],
  'pa-p2-l6': [0.5, 0],
  'pa-p2-l7': [0.35, 0.1],
  'pa-p2-l8': [0.25, 0],
  'pa-p2-l9': [0.6, 0.1],
  'pa-p2-l10': [0.45, 0],
  'pa-p3-l1': [0.3, 0.2],
  'pa-p3-l2': [0.25, 0],
  'pa-p3-l3': [0.4, 0],
  'pa-p3-l4': [0.2, 0.1],
  'pa-p3-l6': [0.3, 0.1],
  'pa-p3-l8': [0.35, 0],
  'pa-p3-l10': [0.5, 0],
  'pa-p4-l1': [0.45, 0.1],
  'pa-p4-l2': [0.84, 0.08],
  'pa-p4-l3': [0.4, 0.05],
  'pa-p4-l4': [0.5, 0],
  'pa-p4-l5': [0.3, 0.1],
  'pa-p4-l8': [0.6, 0],
  'pa-p4-l9': [0.4, 0],
  'pb-p1-l1': [0.58, 0.2],
  'pb-p1-l2': [0.45, 0.15],
  'pb-p1-l3': [0.5, 0.1],
  'pb-p1-l4': [0.33, 0],
  'pb-p2-l1': [0.4, 0.1],
  'pb-p2-l2': [0.38, 0.12],
  'pb-p2-l3': [0.66, 0],
  'pb-p2-l4': [0.3, 0.05],
  'pb-p3-l1': [0.25, 0],
  'pb-p3-l3': [0.4, 0.1],
}

const projectOffices: Record<string, string[]> = {
  pa: ['ksl', 'gdf', 'pts', 'khr'],
  pb: ['fsh', 'obd'],
}

// Offices whose field reports lag behind spending (drives reconciliation status on the map).
const lagging: Record<string, number> = { fsh: 0.5, gdf: 0.25, pts: 0.12 }

function buildHistory() {
  const expenses: Expense[] = []
  const requests: SpendRequest[] = []
  let e = 1
  let r = 60
  for (const p of projects) {
    const offs = projectOffices[p.id]
    for (const pil of p.pillars) {
      for (const line of pil.lines) {
        const [sp, cm] = usage[line.id] ?? [0, 0]
        const spent = Math.round(line.ceilingUSD * sp)
        const committed = Math.round(line.ceilingUSD * cm)
        // Split spending into 2–3 expenses across the project's offices.
        const parts = spent > 2000 ? 3 : spent > 0 ? 2 : 0
        for (let i = 0; i < parts; i++) {
          const office = offs[(e + i) % offs.length]
          const amount = i === parts - 1 ? spent - Math.round(spent / parts) * (parts - 1) : Math.round(spent / parts)
          const age = 6 + ((e * 7 + i * 11) % 120)
          const lagRatio = lagging[office] ?? 0.04
          const missing = age < 40 && (e * 13 + i * 5) % 100 < lagRatio * 100 * 1.6
          expenses.push({
            id: `ex-${e}-${i}`,
            lineId: line.id,
            projectId: p.id,
            officeId: office,
            amountUSD: amount,
            date: daysFromNow(-age),
            hasTechReport: !missing,
          })
        }
        e++
        if (committed > 0) {
          const office = offs[r % offs.length]
          requests.push(
            approvedRequest(`sr-${r}`, r, office, p.id, line.id, committed, line.name, -(3 + (r % 9))),
          )
          r++
        }
      }
    }
  }
  return { expenses, requests }
}

function approvedRequest(
  id: string,
  n: number,
  officeId: string,
  projectId: string,
  lineId: string,
  usd: number,
  name: { ar: string; en: string },
  days: number,
): SpendRequest {
  const chain: RoleKey[] = usd < 500 ? ['supervisor'] : usd < 5000 ? ['supervisor', 'finance_manager'] : ['supervisor', 'finance_manager', 'executive_director']
  return {
    id,
    code: `SR-${String(n).padStart(4, '0')}`,
    officeId,
    projectId,
    lineId,
    purpose: { ar: `${name.ar} — دفعة معتمدة`, en: `${name.en} — approved tranche` },
    amount: Math.round(usd * SDG_RATE),
    currency: 'SDG',
    rate: SDG_RATE,
    amountUSD: usd,
    requesterId: 'u-fo',
    createdAt: daysFromNow(days),
    status: 'approved',
    overCeiling: false,
    steps: chain.map((role) => ({ role, status: 'approved', by: userForRole(role), at: daysFromNow(days + 1) })),
  }
}

function userForRole(role: RoleKey) {
  return users.find((u) => u.role === role)!.id
}

const steps = (chain: RoleKey[], approvedCount: number): ApprovalStep[] =>
  chain.map((role, i) => ({
    role,
    status: i < approvedCount ? 'approved' : i === approvedCount ? 'pending' : 'waiting',
    by: i < approvedCount ? userForRole(role) : undefined,
    at: i < approvedCount ? daysFromNow(-1) : undefined,
  }))

const sdg = (usd: number) => Math.round(usd * SDG_RATE)

const openRequests: SpendRequest[] = [
  {
    id: 'sr-138',
    code: 'SR-0138',
    officeId: 'gdf',
    projectId: 'pa',
    lineId: 'pa-p2-l1',
    activityCode: 'ACT-GDF-0087',
    purpose: { ar: 'أدوية ضغط وسكري لمركز القضارف الصحي', en: 'Hypertension & diabetes medicines, Gedaref centre' },
    amount: sdg(400),
    currency: 'SDG',
    rate: SDG_RATE,
    amountUSD: 400,
    requesterId: 'u-fo',
    createdAt: daysFromNow(-1),
    status: 'pending',
    overCeiling: false,
    ruleId: 'r1',
    steps: steps(['supervisor'], 0),
  },
  {
    id: 'sr-139',
    code: 'SR-0139',
    officeId: 'ksl',
    projectId: 'pa',
    lineId: 'pa-p1-l7',
    activityCode: 'ACT-KSL-0139',
    purpose: { ar: 'حوافز الكوادر الطبية — اليوم العلاجي بود الحليو', en: 'Medical staff incentives — Wad Elhilew medical day' },
    amount: sdg(380),
    currency: 'SDG',
    rate: SDG_RATE,
    amountUSD: 380,
    requesterId: 'u-fo',
    createdAt: daysFromNow(-2),
    status: 'pending',
    overCeiling: false,
    ruleId: 'r1',
    steps: steps(['supervisor'], 0),
  },
  {
    id: 'sr-140',
    code: 'SR-0140',
    officeId: 'ksl',
    projectId: 'pa',
    lineId: 'pa-p1-l2',
    activityCode: 'ACT-KSL-0140',
    purpose: { ar: 'عمليات جراحية لحالات محوّلة من مستشفى كسلا', en: 'Surgeries for cases referred from Kassala hospital' },
    amount: sdg(1306),
    currency: 'SDG',
    rate: SDG_RATE,
    amountUSD: 1306,
    requesterId: 'u-fo',
    createdAt: daysFromNow(-2),
    status: 'pending',
    overCeiling: false,
    ruleId: 'r2',
    steps: steps(['supervisor', 'finance_manager'], 1),
  },
  {
    id: 'sr-141',
    code: 'SR-0141',
    officeId: 'pts',
    projectId: 'pa',
    lineId: 'pa-p4-l3',
    purpose: { ar: 'باقات إنترنت فضائي لمكتب بورتسودان', en: 'Satellite internet bundle, Port Sudan office' },
    amount: 520,
    currency: 'USD',
    rate: SDG_RATE,
    amountUSD: 520,
    requesterId: 'u-fo',
    createdAt: daysFromNow(-3),
    status: 'pending',
    overCeiling: false,
    ruleId: 'r2',
    steps: steps(['supervisor', 'finance_manager'], 1),
  },
  {
    id: 'sr-142',
    code: 'SR-0142',
    officeId: 'fsh',
    projectId: 'pb',
    lineId: 'pb-p1-l1',
    activityCode: 'ACT-FSH-0031',
    purpose: { ar: 'شحنة بسكويت مدعّم — معسكرات النازحين بالفاشر', en: 'Fortified biscuit shipment — El Fasher IDP camps' },
    amount: 3400,
    currency: 'USD',
    rate: SDG_RATE,
    amountUSD: 3400,
    requesterId: 'u-fo',
    createdAt: daysFromNow(-4),
    status: 'pending',
    overCeiling: true,
    ruleId: 'r2',
    steps: steps(['supervisor', 'finance_manager', 'executive_director'], 2),
  },
  {
    id: 'sr-137',
    code: 'SR-0137',
    officeId: 'ksl',
    projectId: 'pa',
    lineId: 'pa-p3-l7',
    purpose: { ar: 'استئجار قاعة لورشة تدريب القابلات', en: 'Venue hire for midwife training workshop' },
    amount: sdg(220),
    currency: 'SDG',
    rate: SDG_RATE,
    amountUSD: 220,
    requesterId: 'u-fo',
    createdAt: daysFromNow(-6),
    status: 'rejected',
    overCeiling: false,
    ruleId: 'r1',
    steps: [{ role: 'supervisor', status: 'rejected', by: 'u-sup', at: daysFromNow(-5), note: 'Use the health centre hall at no cost.' }],
  },
]

export function buildSeed() {
  const { expenses, requests } = buildHistory()
  const rules: ApprovalRule[] = [
    { id: 'r1', name: { ar: 'مبالغ صغيرة', en: 'Small amounts' }, minUSD: 0, maxUSD: 500, appliesTo: 'spend', officeId: null, chain: ['supervisor'], active: true },
    { id: 'r2', name: { ar: 'مبالغ متوسطة', en: 'Medium amounts' }, minUSD: 500, maxUSD: 5000, appliesTo: 'spend', officeId: null, chain: ['supervisor', 'finance_manager'], active: true },
    { id: 'r3', name: { ar: 'مبالغ كبيرة', en: 'Large amounts' }, minUSD: 5000, maxUSD: null, appliesTo: 'spend', officeId: null, chain: ['supervisor', 'finance_manager', 'executive_director'], active: true },
    { id: 'r4', name: { ar: 'المناقلة بين البنود', en: 'Budget reallocation' }, minUSD: 0, maxUSD: null, appliesTo: 'reallocation', officeId: null, chain: ['finance_manager', 'executive_director'], active: true },
  ]
  const reallocations: Reallocation[] = [
    {
      id: 'ra-1',
      code: 'RA-0007',
      projectId: 'pa',
      fromLineId: 'pa-p3-l9',
      toLineId: 'pa-p3-l1',
      amountUSD: 300,
      reason: { ar: 'زيادة عدد المتدربين في دورة الكوادر الصحية', en: 'More trainees in the health staff course' },
      requesterId: 'u-fm',
      createdAt: daysFromNow(-20),
      status: 'approved',
      steps: [
        { role: 'finance_manager', status: 'approved', by: 'u-fm', at: daysFromNow(-20) },
        { role: 'executive_director', status: 'approved', by: 'u-ed', at: daysFromNow(-19) },
      ],
    },
  ]
  const deadlines: Deadline[] = [
    { id: 'd1', title: { ar: 'التقرير الربعي للمانح — مشروع (أ)', en: 'Quarterly donor report — Project A' }, projectId: 'pa', due: daysFromNow(7), notifyDaysBefore: 10, owner: 'finance_manager' },
    { id: 'd2', title: { ar: 'تقرير التغذية الشهري — مشروع (ب)', en: 'Monthly nutrition report — Project B' }, projectId: 'pb', due: daysFromNow(3), notifyDaysBefore: 5, owner: 'supervisor' },
    { id: 'd3', title: { ar: 'التقرير الفني الشهري — مكتب الفاشر', en: 'Monthly technical report — El Fasher office' }, due: daysFromNow(-4), notifyDaysBefore: 5, owner: 'field_officer' },
    { id: 'd4', title: { ar: 'الإقفال المالي الشهري — جميع المكاتب', en: 'Monthly financial close — all offices' }, due: daysFromNow(24), notifyDaysBefore: 7, owner: 'finance_manager' },
    { id: 'd5', title: { ar: 'تسليم ملف التدقيق السنوي', en: 'Annual audit file submission' }, due: daysFromNow(54), notifyDaysBefore: 30, owner: 'finance_manager' },
  ]
  return {
    expenses,
    requests: [...openRequests, ...requests],
    reallocations,
    rules,
    deadlines,
  }
}
