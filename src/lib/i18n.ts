import { useStore } from './store'

const dict = {
  appName: { ar: 'نظام إدارة الموارد', en: 'Resource Management System' },
  orgName: { ar: 'صندوق إعانة المرضى الكويتي — السودان', en: 'Kuwait Patients Helping Fund — Sudan' },
  demo: { ar: 'نسخة عرض — بيانات تجريبية', en: 'Demo — sample data' },
  resetDemo: { ar: 'إعادة ضبط العرض', en: 'Reset demo' },
  actingAs: { ar: 'تعمل الآن بصفة', en: 'Acting as' },
  switchRole: { ar: 'تبديل الدور', en: 'Switch role' },

  nav_dashboard: { ar: 'لوحة القيادة', en: 'Dashboard' },
  nav_projects: { ar: 'المشاريع والميزانيات', en: 'Projects & budgets' },
  nav_requests: { ar: 'طلبات الصرف', en: 'Spend requests' },
  nav_approvals: { ar: 'بانتظار اعتمادي', en: 'Awaiting my approval' },
  nav_activities: { ar: 'الأنشطة والتقارير الفنية', en: 'Activities & field reports' },
  nav_reconcile: { ar: 'المطابقة الفنية والمالية', en: 'Technical–financial matching' },
  nav_supply: { ar: 'سلسلة الإمداد والمخازن', en: 'Supply chain & stores' },
  nav_logistics: { ar: 'اللوجستيات', en: 'Logistics' },
  nav_patients: { ar: 'المرضى والمستفيدون', en: 'Patients & beneficiaries' },
  nav_hr: { ar: 'الموارد البشرية', en: 'Human resources' },
  nav_alerts: { ar: 'التنبيهات والمواعيد', en: 'Alerts & deadlines' },
  nav_reports: { ar: 'التقارير', en: 'Reports' },
  nav_rules: { ar: 'قواعد الاعتماد', en: 'Approval rules' },
  nav_group_ops: { ar: 'العمليات', en: 'Operations' },
  nav_group_finance: { ar: 'المالية', en: 'Finance' },
  nav_fin_overview: { ar: 'نظرة عامة', en: 'Overview' },
  nav_fin_accounts: { ar: 'دليل الحسابات', en: 'Chart of accounts' },
  nav_fin_vouchers: { ar: 'سندات الصرف والقبض', en: 'Vouchers' },
  nav_fin_advances: { ar: 'العُهد وتسويتها', en: 'Cash advances' },
  nav_fin_journal: { ar: 'قيود اليومية', en: 'Journal entries' },
  nav_fin_rates: { ar: 'أسعار الصرف', en: 'Exchange rates' },
  nav_fin_close: { ar: 'الإقفال الشهري', en: 'Monthly close' },
  nav_fin_reports: { ar: 'التقارير المالية', en: 'Financial reports' },
  nav_group_next: { ar: 'المرحلة التالية من العرض', en: 'Next demo milestone' },
  nav_group_settings: { ar: 'الإعدادات', en: 'Settings' },

  spent: { ar: 'مصروف', en: 'Spent' },
  committed: { ar: 'محجوز', en: 'Committed' },
  pending: { ar: 'قيد الاعتماد', en: 'In approval' },
  available: { ar: 'المتاح', en: 'Available' },
  ceiling: { ar: 'السقف', en: 'Ceiling' },
  received: { ar: 'المستلم', en: 'Received' },
  balance: { ar: 'الرصيد', en: 'Balance' },

  line: { ar: 'البند', en: 'Line' },
  pillar: { ar: 'المحور', en: 'Pillar' },
  project: { ar: 'المشروع', en: 'Project' },
  office: { ar: 'المكتب', en: 'Office' },
  amount: { ar: 'المبلغ', en: 'Amount' },
  purpose: { ar: 'الغرض', en: 'Purpose' },
  status: { ar: 'الحالة', en: 'Status' },
  date: { ar: 'التاريخ', en: 'Date' },
  approve: { ar: 'اعتماد', en: 'Approve' },
  reject: { ar: 'رفض', en: 'Reject' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  open: { ar: 'فتح', en: 'Open' },

  st_pending: { ar: 'قيد الاعتماد', en: 'In approval' },
  st_approved: { ar: 'معتمد', en: 'Approved' },
  st_rejected: { ar: 'مرفوض', en: 'Rejected' },
  st_paid: { ar: 'مصروف', en: 'Paid' },
  st_waiting: { ar: 'لم يصل بعد', en: 'Not reached yet' },

  newRequest: { ar: 'طلب صرف جديد', en: 'New spend request' },
  reallocate: { ar: 'مناقلة', en: 'Reallocate' },
  requestReallocation: { ar: 'طلب مناقلة', en: 'Request reallocation' },
}

export type DictKey = keyof typeof dict

export function useT() {
  const lang = useStore((s) => s.lang)
  return (k: DictKey) => dict[k][lang]
}

export function useLang() {
  return useStore((s) => s.lang)
}
