// Programme management sample data: donors, project plans (sectors, objectives, indicators, team, milestones)
// and the reporting schedule. Shared by the clickable demo and the server's demo seed, so both tell the same story.
import type { Bi } from './types'

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

export interface DemoDonor { id: string; code: string; name: Bi }
export const donors: DemoDonor[] = [
  { id: 'don-a', code: 'DON-A', name: { ar: 'مانح (أ) — بيانات تجريبية', en: 'Donor A (sample)' } },
  { id: 'don-b', code: 'DON-B', name: { ar: 'مانح (ب) — بيانات تجريبية', en: 'Donor B (sample)' } },
]
/** Which donor funds which sample project. */
export const projectDonor: Record<string, string> = { pa: 'don-a', pb: 'don-b' }

export type IndicatorSource = 'manual' | 'beneficiaries' | 'services' | 'activities' | 'field_beneficiaries'
export interface DemoIndicator { code: string; name: Bi; unit: Bi; target: number; source: IndicatorSource }
export interface DemoObjective { code: string; name: Bi; sectorId: string; indicators: DemoIndicator[] }
export interface DemoPlan {
  sectors: string[]
  objectives: DemoObjective[]
  team: { role: 'project_manager' | 'project_coordinator' | 'project_office'; userId: string; sectorId?: string }[]
  milestones: { title: Bi; due: number; ownerId: string; status: 'planned' | 'in_progress' | 'done'; objective?: string; notifyDaysBefore: number }[]
  schedule: { monthlyDueDay: number; quarterlyDueDay: number; notifyDaysBefore: number }
}

export const plans: Record<string, DemoPlan> = {
  pa: {
    sectors: ['health'],
    objectives: [
      {
        code: 'O1',
        name: { ar: 'تحسين الوصول إلى الخدمات العلاجية', en: 'Improve access to curative health services' },
        sectorId: 'health',
        indicators: [
          { code: 'I1', name: { ar: 'عدد المستفيدين الذين وصلتهم الخدمة', en: 'People reached with services' }, unit: { ar: 'مستفيد', en: 'people' }, target: 4000, source: 'beneficiaries' },
          { code: 'I2', name: { ar: 'أيام علاجية متنقلة منفذة', en: 'Mobile medical days held' }, unit: { ar: 'يوم', en: 'days' }, target: 24, source: 'activities' },
          { code: 'I3', name: { ar: 'عمليات جراحية للحالات الحرجة', en: 'Critical-case surgeries' }, unit: { ar: 'عملية', en: 'surgeries' }, target: 60, source: 'manual' },
        ],
      },
      {
        code: 'O2',
        name: { ar: 'تعزيز رعاية الأمومة والطفولة', en: 'Strengthen maternal and child care' },
        sectorId: 'health',
        indicators: [{ code: 'I1', name: { ar: 'خدمات الأمومة المقدمة', en: 'Maternal care services given' }, unit: { ar: 'خدمة', en: 'services' }, target: 1500, source: 'services' }],
      },
    ],
    team: [
      { role: 'project_manager', userId: 'u-pm' },
      { role: 'project_coordinator', userId: 'u-pc' },
      { role: 'project_office', userId: 'u-poh', sectorId: 'health' },
    ],
    milestones: [
      { title: { ar: 'اكتمال الأيام العلاجية في كسلا', en: 'Kassala medical days completed' }, due: -20, ownerId: 'u-pm', status: 'done', objective: 'O1', notifyDaysBefore: 7 },
      { title: { ar: 'مراجعة منتصف المشروع', en: 'Mid-project review' }, due: 6, ownerId: 'u-pm', status: 'in_progress', notifyDaysBefore: 7 },
      { title: { ar: 'تسليم المستلزمات الطبية للمراكز', en: 'Medical supplies delivered to centres' }, due: -3, ownerId: 'u-pc', status: 'in_progress', objective: 'O1', notifyDaysBefore: 5 },
      { title: { ar: 'إطلاق حملة التطعيم', en: 'Vaccination campaign launch' }, due: 40, ownerId: 'u-pc', status: 'planned', objective: 'O2', notifyDaysBefore: 10 },
    ],
    schedule: { monthlyDueDay: 10, quarterlyDueDay: 20, notifyDaysBefore: 5 },
  },
  pb: {
    sectors: ['nutrition'],
    objectives: [
      {
        code: 'O1',
        name: { ar: 'علاج سوء التغذية الحاد', en: 'Treat acute malnutrition' },
        sectorId: 'nutrition',
        indicators: [
          { code: 'I1', name: { ar: 'أطفال تلقّوا علاجاً غذائياً', en: 'Children who received nutrition treatment' }, unit: { ar: 'طفل', en: 'children' }, target: 3000, source: 'beneficiaries' },
          { code: 'I2', name: { ar: 'جولات توزيع منفذة', en: 'Distribution rounds held' }, unit: { ar: 'جولة', en: 'rounds' }, target: 18, source: 'activities' },
          { code: 'I3', name: { ar: 'معدل الشفاء', en: 'Recovery rate' }, unit: { ar: '٪', en: '%' }, target: 75, source: 'manual' },
        ],
      },
    ],
    team: [
      { role: 'project_manager', userId: 'u-pm' },
      { role: 'project_coordinator', userId: 'u-pc' },
      { role: 'project_office', userId: 'u-pon', sectorId: 'nutrition' },
    ],
    milestones: [
      { title: { ar: 'وصول الشحنة الأولى من الأغذية العلاجية', en: 'First therapeutic food shipment arrives' }, due: -30, ownerId: 'u-pm', status: 'done', notifyDaysBefore: 7 },
      { title: { ar: 'تدريب العاملين على الفرز التغذوي', en: 'Nutrition screening training' }, due: 12, ownerId: 'u-pc', status: 'planned', objective: 'O1', notifyDaysBefore: 7 },
    ],
    schedule: { monthlyDueDay: 12, quarterlyDueDay: 25, notifyDaysBefore: 5 },
  },
}

/** Which objective a sample activity serves (so indicator counts have something to count). */
export function objectiveFor(projectId: string, type: string | undefined): string | undefined {
  if (projectId === 'pa') return type === 'medical_day' || type === 'clinic' ? 'O1' : type === 'awareness' ? 'O2' : undefined
  if (projectId === 'pb') return type === 'distribution' || type === 'clinic' || type === 'medical_day' ? 'O1' : undefined
  return undefined
}

export interface DemoField { key: string; label: Bi; type: 'text' | 'longtext' | 'number' | 'date' | 'choice' | 'table'; required?: boolean; options?: string[]; columns?: { key: string; label: Bi; type: 'text' | 'number' }[] }
export interface DemoTemplate { id: string; name: Bi; sectorId: string; fields: DemoField[] }
export const templates: DemoTemplate[] = [
  {
    id: 'tpl-nutrition',
    name: { ar: 'التقرير الشهري — التغذية', en: 'Monthly report — Nutrition' },
    sectorId: 'nutrition',
    fields: [
      { key: 'screened', label: { ar: 'عدد الأطفال الذين فُحصوا', en: 'Children screened' }, type: 'number', required: true },
      { key: 'sam', label: { ar: 'حالات سوء التغذية الحاد الوخيم المقبولة', en: 'SAM admissions' }, type: 'number', required: true },
      { key: 'mam', label: { ar: 'حالات سوء التغذية الحاد المتوسط المقبولة', en: 'MAM admissions' }, type: 'number', required: true },
      { key: 'stockout', label: { ar: 'هل حدث نفاد في المخزون؟', en: 'Any stock-out?' }, type: 'choice', options: ['نعم / Yes', 'لا / No'], required: true },
      { key: 'sites', label: { ar: 'مواقع التوزيع', en: 'Distribution sites' }, type: 'table', columns: [{ key: 'site', label: { ar: 'الموقع', en: 'Site' }, type: 'text' }, { key: 'children', label: { ar: 'الأطفال', en: 'Children' }, type: 'number' }] },
      { key: 'remarks', label: { ar: 'ملاحظات', en: 'Remarks' }, type: 'longtext' },
    ],
  },
  {
    id: 'tpl-health',
    name: { ar: 'التقرير الشهري — الصحة', en: 'Monthly report — Health' },
    sectorId: 'health',
    fields: [
      { key: 'consultations', label: { ar: 'عدد الاستشارات الطبية', en: 'Consultations' }, type: 'number', required: true },
      { key: 'referrals', label: { ar: 'حالات الإحالة', en: 'Referrals' }, type: 'number', required: true },
      { key: 'medicines', label: { ar: 'توفر الأدوية الأساسية', en: 'Essential medicines available' }, type: 'choice', options: ['كاف / Adequate', 'ناقص / Short', 'نفد / Out'], required: true },
      { key: 'centres', label: { ar: 'المراكز الصحية', en: 'Health centres' }, type: 'table', columns: [{ key: 'centre', label: { ar: 'المركز', en: 'Centre' }, type: 'text' }, { key: 'visits', label: { ar: 'الزيارات', en: 'Visits' }, type: 'number' }] },
      { key: 'remarks', label: { ar: 'ملاحظات', en: 'Remarks' }, type: 'longtext' },
    ],
  },
]

/** Reports older than this many days are released in the sample data, so the donor portal opens with something to read. */
export const RELEASED_BEFORE_DAYS = 45

/** Believable content for a sample report of the given kind. */
export function sampleContent(type: 'statistics' | 'narrative' | 'custom' | 'quarterly', plan: DemoPlan | undefined, period: string, ids: { objectives: Record<string, string>; indicators: Record<string, string> }, templateId?: string | null) {
  const seed = [...period].reduce((a, c) => a + c.charCodeAt(0), 0)
  if (type === 'statistics') {
    const values: Record<string, number> = {}
    for (const o of plan?.objectives ?? []) for (const i of o.indicators) if (i.source === 'manual') values[ids.indicators[`${o.code}.${i.code}`]] = i.unit.en === '%' ? 68 + (seed % 9) : 4 + (seed % 7)
    return { values, notes: '' }
  }
  if (type === 'narrative')
    return {
      summary: 'تم تنفيذ الأنشطة المخططة لهذا الشهر وفق الخطة، مع استمرار الإقبال على الخدمات. / Planned activities for the month were carried out as scheduled, with steady demand for services.',
      sections: (plan?.objectives ?? []).map((o) => ({ objectiveId: ids.objectives[o.code], progress: 'سار العمل بشكل جيد. / Work progressed well.', challenges: 'صعوبة الوصول في بعض المناطق. / Access was difficult in some areas.', nextSteps: 'مواصلة التنفيذ وتوسيع التغطية. / Continue delivery and widen coverage.' })),
    }
  if (type === 'quarterly') return { summary: 'ربع سنة جيد من حيث التنفيذ والإنفاق ضمن الميزانية. / A good quarter: delivery on track and spending within budget.', challenges: 'ارتفاع تكاليف النقل. / Rising transport costs.', nextQuarter: 'تسريع الأنشطة المتأخرة. / Speed up delayed activities.' }
  const t = templates.find((x) => x.id === templateId)
  const values: Record<string, unknown> = {}
  for (const f of t?.fields ?? []) values[f.key] = f.type === 'number' ? 40 + (seed % 60) : f.type === 'choice' ? f.options?.[0] : f.type === 'table' ? [] : f.type === 'longtext' || f.type === 'text' ? 'لا ملاحظات. / Nothing to add.' : null
  return { values, notes: '' }
}
export { day }
