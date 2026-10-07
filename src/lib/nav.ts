import type { Access, Bi, ModuleKey } from '../data/types'

export interface NavItem {
  to: string
  label: Bi
  min?: Access // minimum access on the module to see this page (default: view)
  badge?: 'approvals' | 'awaitingPay' | 'overdueAdv' | 'unread' | 'gaps' | 'lowStock' | 'offline'
  hint?: Bi // one-line description used by search and help
}

export interface NavModule {
  key: ModuleKey | 'help'
  label: Bi
  icon: string // lucide icon name, resolved in the sidebar
  items: NavItem[]
}

export const modules: NavModule[] = [
  {
    key: 'dashboard',
    label: { ar: 'لوحة القيادة', en: 'Dashboard' },
    icon: 'LayoutDashboard',
    items: [{ to: '/', label: { ar: 'لوحة القيادة', en: 'Dashboard' }, hint: { ar: 'الصورة العامة للمكاتب والصناديق والمشاريع', en: 'Overview of offices, funds and projects' } }],
  },
  {
    key: 'projects',
    label: { ar: 'المشاريع والصرف', en: 'Projects & spending' },
    icon: 'Wallet',
    items: [
      { to: '/projects', label: { ar: 'المشاريع والميزانيات', en: 'Projects & budgets' }, hint: { ar: 'المحاور والبنود والسقوف', en: 'Pillars, lines and ceilings' } },
      { to: '/requests', label: { ar: 'طلبات الصرف', en: 'Spend requests' }, hint: { ar: 'كل الطلبات وحالاتها', en: 'All requests and their status' } },
      { to: '/requests/new', label: { ar: 'طلب صرف جديد', en: 'New spend request' }, min: 'edit', hint: { ar: 'مع التحقق من السقف', en: 'With ceiling check' } },
      { to: '/approvals', label: { ar: 'بانتظار اعتمادي', en: 'Awaiting my approval' }, badge: 'approvals', hint: { ar: 'الطلبات التي وصلت إلى دورك', en: 'Requests waiting on you' } },
    ],
  },
  {
    key: 'activities',
    label: { ar: 'العمل الميداني', en: 'Field work' },
    icon: 'ClipboardCheck',
    items: [
      { to: '/activities', label: { ar: 'الأنشطة', en: 'Activities' }, hint: { ar: 'الأنشطة المخطط لها والمنفذة', en: 'Planned and completed activities' } },
      { to: '/activities/report', label: { ar: 'رفع تقرير فني', en: 'Submit field report' }, min: 'edit', badge: 'offline', hint: { ar: 'يعمل دون إنترنت', en: 'Works offline' } },
      { to: '/reconciliation', label: { ar: 'المطابقة الفنية والمالية', en: 'Report matching' }, badge: 'gaps', hint: { ar: 'صرف بلا تقرير وتقرير بلا صرف', en: 'Spend without report and vice versa' } },
      { to: '/activities/import', label: { ar: 'الاستيراد من Excel', en: 'Import from Excel' }, min: 'edit', hint: { ar: 'للمكاتب ضعيفة الاتصال', en: 'For offices with weak internet' } },
    ],
  },
  {
    key: 'finance',
    label: { ar: 'المالية', en: 'Finance' },
    icon: 'Landmark',
    items: [
      { to: '/finance', label: { ar: 'نظرة عامة', en: 'Overview' } },
      { to: '/finance/accounts', label: { ar: 'دليل الحسابات', en: 'Chart of accounts' }, hint: { ar: 'شجرة الحسابات والأرصدة', en: 'Account tree and balances' } },
      { to: '/finance/vouchers', label: { ar: 'سندات الصرف والقبض', en: 'Vouchers' }, badge: 'awaitingPay' },
      { to: '/finance/advances', label: { ar: 'العُهد وتسويتها', en: 'Cash advances' }, badge: 'overdueAdv' },
      { to: '/finance/journal', label: { ar: 'قيود اليومية', en: 'Journal entries' } },
      { to: '/finance/rates', label: { ar: 'أسعار الصرف', en: 'Exchange rates' } },
      { to: '/finance/close', label: { ar: 'الإقفال الشهري', en: 'Monthly close' } },
      { to: '/finance/reports', label: { ar: 'التقارير المالية', en: 'Financial reports' } },
    ],
  },
  {
    key: 'supply',
    label: { ar: 'سلسلة الإمداد', en: 'Supply chain' },
    icon: 'Boxes',
    items: [
      { to: '/supply', label: { ar: 'المخزون', en: 'Stock' }, badge: 'lowStock' },
      { to: '/supply/receipts', label: { ar: 'استلام التغذية', en: 'Receive supplies' }, min: 'edit' },
      { to: '/supply/issues', label: { ar: 'صرف المواد', en: 'Issue stock' }, min: 'edit' },
      { to: '/supply/items', label: { ar: 'الأصناف', en: 'Items' } },
    ],
  },
  {
    key: 'logistics',
    label: { ar: 'اللوجستيات', en: 'Logistics' },
    icon: 'Truck',
    items: [
      { to: '/logistics', label: { ar: 'الشحنات', en: 'Shipments' } },
      { to: '/logistics/fleet', label: { ar: 'المركبات والوقود', en: 'Vehicles & fuel' } },
    ],
  },
  {
    key: 'patients',
    label: { ar: 'المرضى والمستفيدون', en: 'Patients' },
    icon: 'HeartPulse',
    items: [
      { to: '/patients', label: { ar: 'سجل المستفيدين', en: 'Beneficiary register' } },
      { to: '/patients/stats', label: { ar: 'الإحصاءات', en: 'Statistics' } },
    ],
  },
  {
    key: 'hr',
    label: { ar: 'الموارد البشرية', en: 'Human resources' },
    icon: 'Users',
    items: [
      { to: '/hr', label: { ar: 'الموظفون', en: 'Staff' } },
      { to: '/hr/leave', label: { ar: 'الإجازات', en: 'Leave' } },
      { to: '/hr/payroll', label: { ar: 'الرواتب', en: 'Payroll' } },
    ],
  },
  {
    key: 'reports',
    label: { ar: 'التقارير', en: 'Reports' },
    icon: 'FileBarChart',
    items: [
      { to: '/reports/hq', label: { ar: 'التقرير الشهري للمقر', en: 'Monthly HQ report' }, hint: { ar: 'إلى المقر الرئيسي في الكويت', en: 'To headquarters in Kuwait' } },
      { to: '/reports/donor', label: { ar: 'تقرير المانح', en: 'Donor report' } },
      { to: '/reports/expenditure', label: { ar: 'تقرير المصروفات الربع سنوي', en: 'Quarterly expenditure report' }, hint: { ar: 'بنموذج المانح (Excel)', en: 'Donor template (Excel)' } },
      { to: '/reports/sent', label: { ar: 'سجل الإرسال', en: 'Sent reports' } },
    ],
  },
  {
    key: 'alerts',
    label: { ar: 'التنبيهات والمواعيد', en: 'Alerts & deadlines' },
    icon: 'Bell',
    items: [
      { to: '/alerts', label: { ar: 'التنبيهات', en: 'Notifications' }, badge: 'unread' },
      { to: '/alerts/calendar', label: { ar: 'تقويم المواعيد', en: 'Deadline calendar' } },
    ],
  },
  {
    key: 'settings',
    label: { ar: 'الإعدادات', en: 'Settings' },
    icon: 'Settings',
    items: [
      { to: '/settings/organization', label: { ar: 'المؤسسة', en: 'Organization' }, min: 'manage' },
      { to: '/settings/offices', label: { ar: 'المكاتب والفروع', en: 'Offices' }, min: 'manage' },
      { to: '/settings/users', label: { ar: 'المستخدمون', en: 'Users' }, min: 'manage' },
      { to: '/settings/roles', label: { ar: 'الأدوار والصلاحيات', en: 'Roles & permissions' }, min: 'manage' },
      { to: '/settings/approval-rules', label: { ar: 'قواعد الاعتماد', en: 'Approval rules' }, min: 'edit' },
      { to: '/settings/notifications', label: { ar: 'قواعد التنبيهات', en: 'Notification rules' }, min: 'edit' },
      { to: '/settings/channels', label: { ar: 'البريد وواتساب والرسائل', en: 'Email, WhatsApp & SMS' }, min: 'manage' },
      { to: '/settings/reports', label: { ar: 'إعدادات إرسال التقارير', en: 'Report delivery' }, min: 'edit' },
    ],
  },
]

export const helpItem: NavItem = { to: '/help', label: { ar: 'مركز المساعدة', en: 'Help centre' } }

/** Finds the module and page for a path (longest matching prefix wins). */
export function locate(pathname: string) {
  let best: { module: NavModule; item: NavItem } | null = null
  for (const m of modules)
    for (const it of m.items) {
      const exact = pathname === it.to
      const prefix = it.to !== '/' && pathname.startsWith(it.to + '/')
      if (exact || prefix) if (!best || it.to.length > best.item.to.length) best = { module: m, item: it }
    }
  return best
}
