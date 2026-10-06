import { Check, ChevronLeft, ChevronRight, Rocket, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Access, Bi, ModuleKey } from '../data/types'
import { useLang } from '../lib/i18n'
import { usePerm, useStore } from '../lib/store'

const NONE: string[] = []

interface Task {
  to: string
  label: Bi
  why: Bi
  need?: [ModuleKey, Access]
  approver?: boolean
}

const tasks: Task[] = [
  { to: '/settings/offices', label: { ar: 'راجع المكاتب والفروع', en: 'Review offices and branches' }, why: { ar: 'أضف أي مكتب جديد وحدد موقعه', en: 'Add any new office and place it on the map' }, need: ['settings', 'manage'] },
  { to: '/settings/roles', label: { ar: 'اضبط الأدوار والصلاحيات', en: 'Set up roles and permissions' }, why: { ar: 'من يرى ماذا — حسب الحاجة إلى المعرفة', en: 'Who sees what — on a need-to-know basis' }, need: ['settings', 'manage'] },
  { to: '/settings/users', label: { ar: 'أضف المستخدمين', en: 'Add users' }, why: { ar: 'وحدد دور ومكتب كل منهم', en: 'And give each one a role and office' }, need: ['settings', 'manage'] },
  { to: '/settings/channels', label: { ar: 'اربط البريد وواتساب والرسائل', en: 'Connect email, WhatsApp and SMS' }, why: { ar: 'لتصل التنبيهات خارج النظام', en: 'So notifications reach people outside the system' }, need: ['settings', 'manage'] },
  { to: '/finance/accounts', label: { ar: 'راجع دليل الحسابات', en: 'Review the chart of accounts' }, why: { ar: 'أضف الحسابات الخاصة بكم', en: 'Add your own accounts' }, need: ['finance', 'edit'] },
  { to: '/approvals', label: { ar: 'افتح ما ينتظر اعتمادك', en: 'Open what awaits your approval' }, why: { ar: 'الطلبات التي وصلت إلى دورك', en: 'Requests that have reached you' }, approver: true },
  { to: '/requests/new', label: { ar: 'جرّب طلب صرف', en: 'Try a spend request' }, why: { ar: 'وشاهد كيف يمنع النظام تجاوز السقف', en: 'And see how the ceiling check works' }, need: ['projects', 'edit'] },
  { to: '/activities/report', label: { ar: 'ارفع تقريراً فنياً', en: 'Submit a field report' }, why: { ar: 'يعمل حتى دون إنترنت', en: 'Works even without internet' }, need: ['activities', 'edit'] },
  { to: '/supply/receipts', label: { ar: 'سجّل استلام تغذية', en: 'Record a supply receipt' }, why: { ar: 'يدخل المخزون والحسابات معاً', en: 'Updates stock and the books together' }, need: ['supply', 'edit'] },
  { to: '/logistics', label: { ar: 'تابع الشحنات', en: 'Follow shipments' }, why: { ar: 'من المستودع إلى المكتب', en: 'From store to office' }, need: ['logistics', 'edit'] },
  { to: '/hr', label: { ar: 'افتح ملفات الموظفين', en: 'Open staff files' }, why: { ar: 'والعقود التي تنتهي قريباً', en: 'And contracts ending soon' }, need: ['hr', 'edit'] },
  { to: '/patients', label: { ar: 'سجّل مستفيداً', en: 'Register a beneficiary' }, why: { ar: 'مع التنبيه على التكرار', en: 'With a duplicate check' }, need: ['patients', 'edit'] },
  { to: '/reports/hq', label: { ar: 'جهّز التقرير الشهري للمقر', en: 'Prepare the monthly HQ report' }, why: { ar: 'PDF وإرسال بالبريد بضغطة', en: 'PDF and email in one click' }, need: ['reports', 'edit'] },
  { to: '/help', label: { ar: 'تصفّح مركز المساعدة', en: 'Browse the Help centre' }, why: { ar: 'شرح كل صفحة خطوة بخطوة', en: 'Step-by-step help for every page' } },
]

/** A short, role-aware “get started” checklist. Items tick themselves off when the page is visited. */
export function GetStarted() {
  const lang = useLang()
  const ar = lang === 'ar'
  const { can, role } = usePerm()
  const visited = useStore((s) => s.visited[s.userId]) ?? NONE
  const hidden = useStore((s) => s.checklistHidden.includes(s.userId))
  const tourSeen = useStore((s) => s.tourSeen)
  const startTour = useStore((s) => s.startTour)
  const hide = useStore((s) => s.hideChecklist)
  if (hidden) return null
  const mine = tasks.filter((t) => (t.approver ? role?.canApprove : true) && (!t.need || can(t.need[0], t.need[1]))).slice(0, 5)
  const done = mine.filter((t) => visited.includes(t.to)).length + (tourSeen ? 1 : 0)
  const total = mine.length + 1
  if (done === total) return null
  const Chevron = ar ? ChevronLeft : ChevronRight
  const row = (key: string, isDone: boolean, label: string, why: string, to?: string, onClick?: () => void) => {
    const body = (
      <>
        <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${isDone ? 'border-leaf bg-leaf text-white' : 'border-line'}`}>{isDone && <Check size={14} />}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[14px] font-medium ${isDone ? 'text-muted line-through' : ''}`}>{label}</span>
          <span className="block truncate text-[12.5px] text-muted">{why}</span>
        </span>
        {!isDone && <Chevron size={16} className="text-muted" />}
      </>
    )
    const cls = 'flex items-center gap-3 rounded-md px-3 py-2 hover:bg-paper'
    return (
      <li key={key}>
        {to ? (
          <Link to={to} className={cls}>
            {body}
          </Link>
        ) : (
          <button onClick={onClick} className={`${cls} w-full text-start`}>
            {body}
          </button>
        )}
      </li>
    )
  }
  return (
    <section className="rounded-lg border border-line bg-surface" aria-labelledby="get-started">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <Rocket size={18} className="text-crescent" />
        <div className="flex-1">
          <h2 id="get-started" className="text-[15.5px] font-semibold">
            {ar ? 'ابدأ من هنا' : 'Get started'}
          </h2>
          <div className="text-[12.5px] text-muted">
            {ar ? `خطوات مقترحة لدورك: ${role?.name.ar ?? ''}` : `Suggested first steps for the ${role?.name.en ?? ''} role`}
          </div>
        </div>
        <span className="num text-[13px] text-muted">
          {done}/{total}
        </span>
        <button onClick={() => hide()} className="rounded p-1 text-muted hover:bg-paper" aria-label={ar ? 'إخفاء القائمة' : 'Hide checklist'} title={ar ? 'إخفاء — يمكن إظهارها من مركز المساعدة' : 'Hide — you can bring it back from the Help centre'}>
          <X size={16} />
        </button>
      </div>
      <div className="h-1 bg-paper">
        <div className="h-1 bg-leaf transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ul className="grid gap-0.5 p-2 md:grid-cols-2">
        {row('tour', tourSeen, ar ? 'خذ الجولة التعريفية' : 'Take the guided tour', ar ? 'دقيقة واحدة لتعرف مكان كل شيء' : 'One minute to learn where everything is', undefined, startTour)}
        {mine.map((t) => row(t.to, visited.includes(t.to), t.label[lang], t.why[lang], t.to))}
      </ul>
    </section>
  )
}
