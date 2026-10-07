export const EVENTS = ['approval_waiting', 'request_stale', 'request_decided', 'deadline_near', 'deadline_overdue', 'advance_overdue', 'report_overdue', 'line_threshold', 'spend_no_report', 'month_close', 'low_stock'] as const
export type NotifEvent = (typeof EVENTS)[number]

/** Events whose rule takes a number, with its unit and a sensible default. */
export const THRESHOLD: Partial<Record<NotifEvent, { unit: 'hours' | 'days' | 'percent' | 'day_of_month'; default: number; min: number; max: number }>> = {
  request_stale: { unit: 'hours', default: 48, min: 1, max: 24 * 60 },
  report_overdue: { unit: 'days', default: 5, min: 1, max: 365 },
  line_threshold: { unit: 'percent', default: 85, min: 1, max: 100 },
  spend_no_report: { unit: 'days', default: 10, min: 1, max: 365 },
  month_close: { unit: 'day_of_month', default: 5, min: 1, max: 28 },
}

type Rule = { event: NotifEvent; nameAr: string; nameEn: string; threshold?: number; recipients: { concerned: boolean; roles: string[]; users: string[] }; channels: { inapp: boolean; email: boolean; whatsapp: boolean; sms: boolean }; enabled: boolean }
const ch = (email: boolean, whatsapp: boolean, sms: boolean) => ({ inapp: true, email, whatsapp, sms })

/** The rules a new installation starts with. All of them can be changed or switched off in settings. */
export const DEFAULT_RULES: Rule[] = [
  { event: 'approval_waiting', nameAr: 'طلب وصل إلى دورك في الاعتماد', nameEn: 'A request reaches your approval step', recipients: { concerned: true, roles: [], users: [] }, channels: ch(true, true, false), enabled: true },
  { event: 'request_stale', nameAr: 'طلب متوقف عند معتمد', nameEn: 'Request stuck with an approver', threshold: 48, recipients: { concerned: true, roles: ['finance_manager'], users: [] }, channels: ch(true, false, false), enabled: true },
  { event: 'request_decided', nameAr: 'اعتماد أو رفض طلبك', nameEn: 'Your request is approved or rejected', recipients: { concerned: true, roles: [], users: [] }, channels: ch(false, true, false), enabled: true },
  { event: 'deadline_near', nameAr: 'اقتراب موعد تسليم تقرير', nameEn: 'A report deadline is coming', recipients: { concerned: true, roles: ['finance_manager'], users: [] }, channels: ch(true, false, false), enabled: true },
  { event: 'deadline_overdue', nameAr: 'تجاوز موعد تسليم', nameEn: 'A deadline is missed', recipients: { concerned: true, roles: ['executive_director'], users: [] }, channels: ch(true, false, true), enabled: true },
  { event: 'advance_overdue', nameAr: 'عهدة تجاوزت موعد التسوية', nameEn: 'Advance past its settlement date', recipients: { concerned: true, roles: ['finance_manager', 'accountant'], users: [] }, channels: ch(false, false, true), enabled: true },
  { event: 'report_overdue', nameAr: 'تقرير فني متأخر', nameEn: 'Field report overdue', threshold: 5, recipients: { concerned: true, roles: ['supervisor'], users: [] }, channels: ch(false, true, false), enabled: true },
  { event: 'line_threshold', nameAr: 'بند ميزانية قارب سقفه', nameEn: 'Budget line near its ceiling', threshold: 85, recipients: { concerned: false, roles: ['finance_manager', 'executive_director'], users: [] }, channels: ch(true, false, false), enabled: true },
  { event: 'spend_no_report', nameAr: 'صرف بلا تقرير فني', nameEn: 'Spending with no field report', threshold: 10, recipients: { concerned: true, roles: ['accountant'], users: [] }, channels: ch(false, false, false), enabled: true },
  { event: 'month_close', nameAr: 'الإقفال الشهري لم يكتمل', nameEn: 'Monthly close not finished', threshold: 5, recipients: { concerned: false, roles: ['finance_manager'], users: [] }, channels: ch(true, false, false), enabled: true },
  { event: 'low_stock', nameAr: 'مخزون صنف تحت الحد الأدنى', nameEn: 'Stock below minimum', recipients: { concerned: true, roles: ['logistics_officer'], users: [] }, channels: ch(false, true, false), enabled: true },
]
