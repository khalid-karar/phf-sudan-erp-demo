import { useLocation } from 'react-router-dom'
import { PageHeader, Panel } from '../components/ui'
import { useLang } from '../lib/i18n'

const plans: Record<string, { ar: [string, string[]]; en: [string, string[]] }> = {
  '/activities': {
    ar: ['الأنشطة والتقارير الفنية', ['إنشاء النشاط قبل التنفيذ وربطه ببند الميزانية', 'التقرير الفني من الجوال يعمل دون إنترنت ويُزامَن لاحقاً', 'صور ومستفيدون وموقع جغرافي لكل نشاط']],
    en: ['Activities & field reports', ['Create the activity before work starts, linked to a budget line', 'Mobile field report that works offline and syncs later', 'Photos, beneficiaries and location per activity']],
  },
  '/reconciliation': {
    ar: ['المطابقة الفنية والمالية', ['كل مصروف مرتبط بنشاط وتقرير فني تلقائياً عبر رقم النشاط', 'قائمة الفجوات: صرف بلا تقرير، تقرير بلا صرف، فرق في المبلغ', 'أعمار الفجوات وتذكير آلي للمكتب المعني']],
    en: ['Technical–financial matching', ['Every expense tied to an activity and its field report by activity number', 'Gap list: spend with no report, report with no spend, amount variance', 'Gap ageing and automatic reminders to the office']],
  },
  '/supply': {
    ar: ['سلسلة الإمداد والمخازن', ['استلام التغذية العينية وتسجيل قيمتها', 'مخزون لكل مكتب وصرف المواد على الأنشطة', 'تنبيه انخفاض المخزون']],
    en: ['Supply chain & stores', ['Receive in-kind replenishment and record its value', 'Stock per office, issued against activities', 'Low-stock alerts']],
  },
  '/logistics': {
    ar: ['اللوجستيات', ['شحنات من الرئاسة إلى المكاتب', 'تأكيد الاستلام في المكتب', 'رحلات المركبات وتكلفة الوقود']],
    en: ['Logistics', ['Shipments from HQ to offices', 'Delivery confirmation at the office', 'Vehicle trips and fuel cost']],
  },
  '/patients': {
    ar: ['المرضى والمستفيدون', ['سجل المستفيدين والخدمات المقدّمة', 'ربط المستفيد بالنشاط', 'أرقام الأثر في تقارير المانحين']],
    en: ['Patients & beneficiaries', ['Beneficiary register and services received', 'Linked to the activity', 'Impact figures in donor reports']],
  },
  '/hr': {
    ar: ['الموارد البشرية', ['الموظفون لكل مكتب وأدوارهم', 'التكليفات الميدانية', 'توزيع تكلفة الرواتب على المشاريع']],
    en: ['Human resources', ['Staff per office and their roles', 'Field assignments', 'Salary cost allocated to projects']],
  },
  '/alerts': {
    ar: ['التنبيهات والمواعيد', ['تقويم مواعيد تقارير المانحين والتقارير الداخلية', 'تنبيه قبل الموعد بعدد أيام يحدده المستخدم', 'عبر النظام والبريد والرسائل']],
    en: ['Alerts & deadlines', ['Calendar of donor and internal report deadlines', 'Notify a user-set number of days before', 'In the app, by email and by SMS/WhatsApp']],
  },
  '/reports': {
    ar: ['التقارير', ['تقرير المانح: الميزانية مقابل الفعلي مع التقارير الفنية', 'تقارير لكل مكتب ولكل صندوق', 'تصدير PDF و Excel']],
    en: ['Reports', ['Donor report: budget vs actual with field reports', 'Per office and per fund', 'Export to PDF and Excel']],
  },
}

export function Upcoming() {
  const lang = useLang()
  const { pathname } = useLocation()
  const p = plans[pathname]?.[lang] ?? [pathname, []]
  return (
    <div>
      <PageHeader title={p[0]} sub={lang === 'ar' ? 'هذه الشاشة ضمن المرحلة التالية من العرض.' : 'This screen is part of the next demo milestone.'} />
      <Panel className="p-6">
        <ul className="list-disc space-y-2 ps-5">
          {p[1].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
