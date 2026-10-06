import { daysFromNow } from './seed'
import type { Beneficiary, Bi, Contract, Department, Employee, FieldActivity, LeaveRequest, ServiceType } from './types'

export const departmentName: Record<Department, Bi> = {
  medical: { ar: 'الطبي', en: 'Medical' },
  field: { ar: 'العمل الميداني', en: 'Field' },
  finance: { ar: 'المالية', en: 'Finance' },
  admin: { ar: 'الإدارة', en: 'Administration' },
  supply: { ar: 'المخازن', en: 'Stores' },
  logistics: { ar: 'اللوجستيات', en: 'Logistics' },
}
export const contractName: Record<Contract, Bi> = {
  permanent: { ar: 'دائم', en: 'Permanent' },
  fixed: { ar: 'محدد المدة', en: 'Fixed-term' },
  daily: { ar: 'يومية', en: 'Daily' },
  volunteer: { ar: 'متطوع', en: 'Volunteer' },
}
export const serviceName: Record<ServiceType, Bi> = {
  consultation: { ar: 'كشف طبي', en: 'Consultation' },
  surgery: { ar: 'عملية جراحية', en: 'Surgery' },
  medicines: { ar: 'صرف أدوية', en: 'Medicines' },
  nutrition: { ar: 'تغذية علاجية', en: 'Therapeutic nutrition' },
  vaccination: { ar: 'تطعيم', en: 'Vaccination' },
  referral: { ar: 'تحويل لمستشفى', en: 'Hospital referral' },
  maternal: { ar: 'رعاية أمومة', en: 'Maternal care' },
}

type E = [string, string, string, string, string, Department, Contract, number, number, string?, [string, string, number][]?, string?]
// name ar, name en, office, position ar, position en, dept, contract, salary SDG, start (days ago), user id, allocations, end (days from now)
const rows: E[] = [
  ['د. منى الفاتح', 'Dr. Mona Elfatih', 'khr', 'المدير التنفيذي', 'Executive Director', 'admin', 'permanent', 1_850_000, 2400, 'u-ed'],
  ['عبدالرحيم حسن النور', 'Abdelrahim Hassan Elnour', 'khr', 'مدير الشؤون المالية والإدارية', 'Finance & Admin Manager', 'finance', 'permanent', 1_520_000, 1900, 'u-fm'],
  ['إيمان عبدالباقي', 'Iman Abdelbagi', 'khr', 'محاسبة', 'Accountant', 'finance', 'permanent', 820_000, 1100, 'u-acc'],
  ['سلمى حسن بشير', 'Salma Hassan Bashir', 'khr', 'مسؤولة الموارد البشرية', 'HR officer', 'admin', 'permanent', 780_000, 900, 'u-hr'],
  ['م. خالد الطيب', 'Eng. Khalid Eltayeb', 'khr', 'مسؤول تقنية المعلومات', 'IT officer', 'admin', 'fixed', 760_000, 500, 'u-admin', [], '24'],
  ['الطاهر محمد نور', 'Altahir Mohamed Nour', 'khr', 'أمين المخزن', 'Storekeeper', 'supply', 'permanent', 640_000, 1400, 'u-store'],
  ['عمر عبدالله', 'Omar Abdalla', 'khr', 'سائق شاحنة', 'Truck driver', 'logistics', 'permanent', 480_000, 1700],
  ['إسماعيل حامد', 'Ismail Hamid', 'khr', 'سائق', 'Driver', 'logistics', 'daily', 360_000, 300],
  ['سارة الطيب إدريس', 'Sara Eltayeb Idris', 'ksl', 'مشرفة القطاع الشرقي', 'Eastern sector supervisor', 'field', 'permanent', 980_000, 1300, 'u-sup', [['pa', 'pa-p4-l1', 50]]],
  ['محمد عثمان الأمين', 'Mohamed Osman Elamin', 'ksl', 'مسؤول ميداني', 'Field officer', 'field', 'fixed', 690_000, 420, 'u-fo', [['pa', 'pa-p4-l1', 100]], '160'],
  ['رحاب الأمين', 'Rehab Elamin', 'ksl', 'موظفة تسجيل المرضى', 'Patient registrar', 'medical', 'fixed', 520_000, 260, 'u-reg', [['pa', 'pa-p4-l1', 60]], '20'],
  ['د. ياسر عوض', 'Dr. Yasir Awad', 'ksl', 'طبيب الأيام العلاجية', 'Medical-day doctor', 'medical', 'fixed', 1_150_000, 380, undefined, [['pa', 'pa-p1-l7', 100]], '110'],
  ['حواء عبدالله موسى', 'Hawa Abdalla Musa', 'gdf', 'مسؤولة ميدانية', 'Field officer', 'field', 'fixed', 670_000, 610, undefined, [['pa', 'pa-p4-l1', 100]], '200'],
  ['عثمان بابكر علي', 'Osman Babiker Ali', 'pts', 'مسؤول إداري', 'Admin officer', 'admin', 'permanent', 610_000, 980],
  ['بكري عثمان صالح', 'Bakri Osman Salih', 'pts', 'مسؤول اللوجستيات', 'Logistics officer', 'logistics', 'permanent', 700_000, 1200, 'u-log'],
  ['حسن أوهاج', 'Hassan Ohaj', 'pts', 'سائق', 'Driver', 'logistics', 'daily', 350_000, 640],
  ['آدم يحيى هارون', 'Adam Yahia Haroun', 'fsh', 'منسق التغذية', 'Nutrition coordinator', 'field', 'fixed', 760_000, 330, 'u-fo2', [['pb', 'pb-p2-l2', 100]], '275'],
  ['فاطمة إسحق', 'Fatima Ishag', 'fsh', 'ممرضة تغذية', 'Nutrition nurse', 'medical', 'fixed', 560_000, 300, undefined, [['pb', 'pb-p2-l2', 100]], '275'],
  ['يعقوب آدم', 'Yagoub Adam', 'fsh', 'سائق إسعاف', 'Ambulance driver', 'logistics', 'daily', 340_000, 700],
  ['نفيسة إبراهيم آدم', 'Nafisa Ibrahim Adam', 'obd', 'مسؤولة ميدانية', 'Field officer', 'field', 'fixed', 640_000, 280, undefined, [['pb', 'pb-p2-l2', 50]], '275'],
  ['الطيب محمد', 'Eltayeb Mohamed', 'ksl', 'سائق', 'Driver', 'logistics', 'daily', 340_000, 520],
  ['هالة عبدالرحمن', 'Hala Abdelrahman', 'khr', 'متطوعة توعية صحية', 'Health awareness volunteer', 'field', 'volunteer', 0, 120],
]

export const employees: Employee[] = rows.map(([nar, nen, officeId, par, pen, department, contract, salarySDG, start, userId, alloc, end], i) => ({
  id: `e${i + 1}`,
  no: `EMP-${String(i + 101).padStart(4, '0')}`,
  name: { ar: nar, en: nen },
  officeId,
  position: { ar: par, en: pen },
  department,
  contract,
  startDate: daysFromNow(-start),
  endDate: end ? daysFromNow(+end) : undefined,
  salarySDG,
  phone: `+249 91${String(2345100 + i * 37).slice(0, 1)} ${String(345000 + i * 131).slice(0, 3)} ${String(100 + i * 7).padStart(3, '0')}`,
  status: i === 13 ? 'on_leave' : 'active',
  userId,
  allocations: (alloc ?? []).map(([projectId, lineId, pct]) => ({ projectId, lineId, pct })),
  leaveBalance: [21, 18, 14, 9, 12, 21, 16, 0, 10, 6, 4, 8, 15, 3, 19, 0, 7, 11, 0, 13, 0, 0][i] ?? 10,
}))

export const leaves: LeaveRequest[] = [
  { id: 'lv1', employeeId: 'e14', type: 'annual', from: daysFromNow(-3), to: daysFromNow(9), days: 10, status: 'approved', decidedBy: 'u-hr', createdAt: daysFromNow(-12) },
  { id: 'lv2', employeeId: 'e10', type: 'annual', from: daysFromNow(12), to: daysFromNow(18), days: 5, note: 'زواج أخي في القضارف', status: 'pending', createdAt: daysFromNow(-1) },
  { id: 'lv3', employeeId: 'e17', type: 'emergency', from: daysFromNow(2), to: daysFromNow(4), days: 3, note: 'ظرف عائلي', status: 'pending', createdAt: daysFromNow(0) },
  { id: 'lv4', employeeId: 'e3', type: 'sick', from: daysFromNow(-20), to: daysFromNow(-18), days: 3, status: 'approved', decidedBy: 'u-hr', createdAt: daysFromNow(-20) },
]

// --- Beneficiaries -------------------------------------------------------------
const male = [['محمد', 'Mohamed'], ['أحمد', 'Ahmed'], ['عثمان', 'Osman'], ['آدم', 'Adam'], ['إبراهيم', 'Ibrahim'], ['الطيب', 'Eltayeb'], ['حامد', 'Hamid'], ['يوسف', 'Yousif'], ['بابكر', 'Babiker'], ['عبدالله', 'Abdalla']]
const female = [['فاطمة', 'Fatima'], ['آمنة', 'Amna'], ['حواء', 'Hawa'], ['زينب', 'Zainab'], ['مريم', 'Mariam'], ['سعاد', 'Suad'], ['نعمات', 'Neimat'], ['إخلاص', 'Ikhlas'], ['هدى', 'Huda'], ['عائشة', 'Aisha']]
const last = [['حسن', 'Hassan'], ['علي', 'Ali'], ['موسى', 'Musa'], ['إدريس', 'Idris'], ['الأمين', 'Elamin'], ['عمر', 'Omer'], ['صالح', 'Salih'], ['هارون', 'Haroun'], ['النور', 'Elnour'], ['عيسى', 'Eisa']]

/** A register of people who received services, tied to the activities that served them. */
export function buildBeneficiaries(activities: FieldActivity[]): Beneficiary[] {
  const out: Beneficiary[] = []
  const reported = activities.filter((a) => a.report)
  const svcFor = (a: FieldActivity): ServiceType =>
    a.type === 'clinic' ? (a.code.includes('OBD') || a.code.includes('FSH') ? 'nutrition' : 'maternal') : a.type === 'distribution' ? 'medicines' : a.type === 'awareness' ? 'vaccination' : 'consultation'
  for (let i = 0; i < 64; i++) {
    const a = reported[i % reported.length]
    const g = i % 3 === 0 ? 'm' : 'f'
    const first = (g === 'm' ? male : female)[(i * 7) % 10]
    const fam = last[(i * 3) % 10]
    const fam2 = last[(i * 5 + 1) % 10]
    const child = i % 4 === 1
    const born = child ? 2018 + (i % 7) : 1958 + ((i * 11) % 45)
    const services = [
      { id: `sv-${i}-1`, date: a.report!.doneOn ?? a.date, type: svcFor(a), activityId: a.id, officeId: a.officeId },
      ...(i % 5 === 0 ? [{ id: `sv-${i}-2`, date: a.report!.doneOn ?? a.date, type: 'referral' as ServiceType, activityId: a.id, officeId: a.officeId, note: 'تحويل إلى المستشفى التعليمي' }] : []),
      ...(i % 6 === 2 ? [{ id: `sv-${i}-3`, date: daysFromNow(-70 - i), type: 'consultation' as ServiceType, officeId: a.officeId }] : []),
    ]
    out.push({
      id: `b${i + 1}`,
      no: `BEN-${a.officeId.toUpperCase()}-${String(1200 + i * 3).padStart(5, '0')}`,
      name: { ar: `${first[0]} ${fam[0]} ${fam2[0]}`, en: `${first[1]} ${fam[1]} ${fam2[1]}` },
      gender: g,
      birthYear: born,
      officeId: a.officeId,
      locality: a.location ?? '',
      displaced: a.officeId === 'fsh' || a.officeId === 'obd' || i % 4 === 0,
      phone: i % 3 === 0 ? undefined : `+249 9${(i * 13) % 10}${(i * 7) % 10} ${String(100 + ((i * 37) % 900))} ${String(1000 + ((i * 53) % 9000)).slice(0, 3)}`,
      registeredAt: services.map((x) => x.date).sort()[0],
      registeredBy: a.officeId === 'ksl' ? 'u-reg' : 'u-fo',
      services,
    })
  }
  return out
}
