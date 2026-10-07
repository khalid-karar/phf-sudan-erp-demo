import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { LIVE } from '../api/http'
import { buildSeed, daysFromNow, offices as seedOffices, orgDefaults, projects as seedProjects, roles as seedRoles, users as seedUsers } from '../data/seed'
import {
  accounts as seedAccounts,
  ADVANCES,
  BANK_PTS,
  BANK_SDG,
  BANK_USD,
  buildFinance,
  cashAccount,
  defaultLineMap,
  FX_GAIN,
  FX_LOSS,
  fieldActivities as seedActivities,
  rateOn,
  rates as seedRates,
  staff,
} from '../data/finance'
import type {
  Beneficiary,
  Employee,
  LeaveRequest,
  PayrollRun,
  Service,
  ServiceType,
  Item,
  Shipment,
  ShipmentLine,
  StockLevel,
  StockMove,
  Vehicle,
  FuelLog,
  HqDraft,
  ReportSettings,
  SentReport,
  AppNotification,
  Channel,
  ChannelConfig,
  Deadline,
  Delivery,
  NotifRule,
  FieldActivity,
  FieldReport,
  OutboxItem,
  Access,
  ModuleKey,
  Office,
  OrgSettings,
  Role,
  User,
  Account,
  Advance,
  ApprovalRule,
  ApprovalStep,
  Bi,
  ControlMode,
  Expense,
  JournalEntry,
  JournalLine,
  Lang,
  MonthClose,
  PayMethod,
  Project,
  RateEntry,
  Reallocation,
  SettlementItem,
  SpendRequest,
  Voucher,
} from '../data/types'
import { checkCeiling, findLine, routeApproval } from './budget'
import { revaluation } from './ledger'
import { buildBeneficiaries, employees as seedEmployees, leaves as seedLeaves } from '../data/people'
import { buildSupply, categoryAccount, INKIND_REVENUE, INVENTORY, items as seedItems } from '../data/supply'
import { defaultChannels, defaultRules, runEngine, testChannel } from './notify'

export interface Toast {
  id: number
  text: Bi
  tone: 'ok' | 'warn' | 'bad'
}

interface State {
  lang: Lang
  userId: string
  serverUsage?: Record<string, import('./budget').Usage> | null
  patientsVersion?: number
  org: OrgSettings
  offices: Office[]
  users: User[]
  roles: Role[]
  sidebarCollapsed: boolean
  tourOpen: boolean
  tourSeen: boolean
  visited: Record<string, string[]>
  checklistHidden: string[]
  startTour: () => void
  endTour: () => void
  markVisited: (path: string) => void
  hideChecklist: (show?: boolean) => void
  employees: Employee[]
  leaves: LeaveRequest[]
  payrolls: PayrollRun[]
  beneficiaries: Beneficiary[]
  saveEmployee: (e: Employee) => void | Promise<boolean>
  requestLeave: (l: Omit<LeaveRequest, 'id' | 'status' | 'createdAt'>) => void | Promise<boolean>
  decideLeave: (id: string, approve: boolean) => void | Promise<boolean>
  postPayroll: (period: string) => void | Promise<boolean>
  saveBeneficiary: (b: Beneficiary, opts?: { firstService?: ServiceType; notDuplicate?: boolean }) => void | Promise<boolean>
  addService: (beneficiaryId: string, sv: Omit<Service, 'id'>) => void | Promise<boolean>

  items: Item[]
  stock: StockLevel[]
  stockMoves: StockMove[]
  shipments: Shipment[]
  vehicles: Vehicle[]
  saveItem: (i: Item) => void | Promise<boolean>
  receiveSupplies: (d: { officeId: string; source: string; lines: { itemId: string; qty: number; expiry?: string }[] }) => string | Promise<boolean>
  issueSupplies: (d: { officeId: string; activityId?: string; note?: string; lines: { itemId: string; qty: number }[] }) => string | null | Promise<boolean>
  createShipment: (d: { fromOfficeId: string; toOfficeId: string; vehicleId?: string; driver?: string; note?: string; lines: ShipmentLine[] }) => Shipment | Promise<boolean>
  dispatchShipment: (id: string) => boolean | Promise<boolean>
  receiveShipment: (id: string, received: Record<string, number>) => void | Promise<boolean>
  saveVehicle: (v: Vehicle) => void | Promise<boolean>
  addFuel: (vehicleId: string, f: Omit<FuelLog, 'id'>) => void | Promise<boolean>
  lowStockCount: () => number
  qtyOf: (itemId: string, officeId: string) => number

  reportSettings: ReportSettings
  hqDrafts: HqDraft[]
  sentReports: SentReport[]
  setReportSettings: (r: ReportSettings) => void | Promise<boolean>
  saveHqDraft: (period: string, patch: Partial<HqDraft>) => void
  recordSent: (r: Omit<SentReport, 'id' | 'at' | 'by'> & { body?: string; blob?: Blob }) => void | Promise<boolean>

  notifRules: NotifRule[]
  notifications: AppNotification[]
  deliveries: Delivery[]
  channels: ChannelConfig

  runNotifications: () => void
  saveNotifRule: (r: NotifRule) => void | Promise<boolean>
  deleteNotifRule: (id: string) => void | Promise<boolean>
  markRead: (id: string) => void
  markAllRead: () => void
  unreadCount: (userId: string) => number
  setChannels: (patch: Partial<ChannelConfig>) => void | Promise<boolean>
  runChannelTest: (ch: Channel, to: string, draft?: ChannelConfig) => ChannelConfig[Channel]['lastTest'] | Promise<ChannelConfig[Channel]['lastTest']>
  saveDeadline: (d: Deadline) => void | Promise<boolean>
  deleteDeadline: (id: string) => void | Promise<boolean>

  activities: FieldActivity[]
  outbox: OutboxItem[]
  offlineSim: boolean

  saveActivity: (a: FieldActivity) => void | FieldActivity | null | Promise<FieldActivity | null>
  submitReport: (activityId: string, report: FieldReport) => 'sent' | 'queued' | null | Promise<'sent' | 'queued' | null>
  setOfflineSim: (v: boolean) => void
  syncOutbox: () => void | Promise<void>
  linkExpense: (expenseId: string, activityCode: string) => void | Promise<boolean>
  importReports: (rows: { activityId: string; report: FieldReport }[]) => void | Promise<boolean>
  gapCount: () => number

  setOrg: (patch: Partial<OrgSettings>) => void | Promise<boolean>
  saveOffice: (o: Office) => void | Promise<boolean>
  saveUser: (u: User) => void | Promise<boolean>
  saveRole: (r: Role) => void | Promise<boolean>
  deleteRole: (id: string) => void | Promise<boolean>
  setSidebarCollapsed: (v: boolean) => void
  projects: Project[]
  expenses: Expense[]
  requests: SpendRequest[]
  reallocations: Reallocation[]
  rules: ApprovalRule[]
  deadlines: ReturnType<typeof buildSeed>['deadlines']
  toasts: Toast[]
  seq: number

  // finance
  accounts: Account[]
  lineMap: Record<string, string>
  journal: JournalEntry[]
  vouchers: Voucher[]
  advances: Advance[]
  rates: RateEntry[]
  closes: MonthClose[]
  fseq: { je: number; pv: number; rv: number; adv: number }

  issuePayment: (requestId: string, method: PayMethod, staffId?: string) => void | Promise<boolean>
  recordReceipt: (d: { projectId?: string; amountUSD: number; account: string; revenueAccount: string; party: string; memo: string }) => void | Promise<boolean>
  settleAdvance: (id: string, items: SettlementItem[], reportNo: string) => void | Promise<boolean>
  addAccount: (a: Account) => void | Promise<boolean>
  setLineAccount: (lineId: string, code: string) => void | Promise<boolean>
  addRate: (rate: number) => void | Promise<boolean>
  postRevaluation: () => void | Promise<boolean>
  setCashCounted: (officeId: string, v: boolean) => void | Promise<boolean>
  closeMonth: (officeId: string) => void | Promise<boolean>

  setLang: (l: Lang) => void
  setUser: (id: string) => void
  reset: () => void
  toast: (text: Bi, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void

  submitRequest: (draft: {
    officeId: string
    projectId: string
    lineId: string
    amount: number
    currency: 'SDG' | 'USD'
    purpose: string
    activityCode?: string
  }) => SpendRequest | null | Promise<SpendRequest | null>
  decideRequest: (id: string, approve: boolean, note?: string) => void | Promise<boolean>

  submitReallocation: (draft: { projectId: string; fromLineId: string; toLineId: string; amountUSD: number; reason: string }) => Reallocation | null | Promise<Reallocation | null>
  decideReallocation: (id: string, approve: boolean, note?: string) => void | Promise<boolean>

  updateRule: (id: string, patch: Partial<ApprovalRule>) => void
  addRule: (kind: ApprovalRule['appliesTo']) => void | Promise<boolean>
  removeRule: (id: string) => void | Promise<boolean>
  setProjectControl: (projectId: string, mode: ControlMode, tolerancePct: number) => void
  addProject: (p: import('../components/NewProjectModal').NewProject) => void | Promise<boolean>
}

const defaultReportSettings: ReportSettings = {
  hq: {
    to: ['hq.reports@phf-kw.org'],
    cc: ['director@kphfs.org'],
    subject: { ar: 'التقرير الشهري لمكتب السودان — {month}', en: 'Sudan office monthly report — {month}' },
    body: {
      ar: 'السادة / {hq} المحترمين،\nالسلام عليكم ورحمة الله وبركاته،\n\nنرفق لكم التقرير الشهري لمكتب السودان عن شهر {month}، ويتضمن الموقف المالي وتقدم المشاريع والأنشطة الميدانية وأعداد المستفيدين.\n\nوتفضلوا بقبول فائق الاحترام،\n{sender}\n{org}',
      en: 'Dear {hq},\n\nPlease find attached the Sudan office monthly report for {month}, covering the financial position, project progress, field activities and beneficiaries.\n\nKind regards,\n{sender}\n{org}',
    },
    requireApproval: true,
    approverRole: 'executive_director',
    autoSendDay: 10,
    includeSections: { finance: true, projects: true, activities: true, compliance: true, supply: true, hr: true, challenges: true, plan: true },
  },
  donor: {
    pa: { to: ['grants@donor-a.org'], cc: ['finance@kphfs.org'], subject: { ar: 'تقرير المشروع {project} — {period}', en: 'Project report {project} — {period}' }, body: { ar: 'السادة / {donor} المحترمين،\n\nنرفق تقرير المشروع {project} عن الفترة {period}.\n\nمع التحية،\n{sender}\n{org}', en: 'Dear {donor},\n\nPlease find attached the {project} report for {period}.\n\nKind regards,\n{sender}\n{org}' } },
    pb: { to: ['programs@donor-b.org'], cc: ['finance@kphfs.org'], subject: { ar: 'تقرير المشروع {project} — {period}', en: 'Project report {project} — {period}' }, body: { ar: 'السادة / {donor} المحترمين،\n\nنرفق تقرير المشروع {project} عن الفترة {period}.\n\nمع التحية،\n{sender}\n{org}', en: 'Dear {donor},\n\nPlease find attached the {project} report for {period}.\n\nKind regards,\n{sender}\n{org}' } },
  },
}

const fresh = () => {
  const s = buildSeed()
  const lineMap = defaultLineMap()
  const f = buildFinance(s.expenses, lineMap)
  const sup = buildSupply(seedActivities, (iso) => rateOn(iso))
  const journal = [...f.journal, ...sup.journal].sort((a, b) => +new Date(a.date) - +new Date(b.date))
  journal.forEach((e, i) => (e.no = `JE-${String(i + 1).padStart(4, '0')}`))
  f.journal = journal
  return {
    employees: structuredClone(seedEmployees),
    leaves: structuredClone(seedLeaves),
    payrolls: [] as PayrollRun[],
    beneficiaries: buildBeneficiaries(seedActivities),
    items: structuredClone(seedItems),
    stock: sup.stock,
    stockMoves: sup.moves,
    shipments: sup.shipments,
    vehicles: sup.vehicles,
    reportSettings: structuredClone(defaultReportSettings),
    hqDrafts: [] as HqDraft[],
    sentReports: [] as SentReport[],
    notifRules: structuredClone(defaultRules),
    notifications: [] as AppNotification[],
    deliveries: [] as Delivery[],
    channels: structuredClone(defaultChannels),
    activities: structuredClone(seedActivities),
    outbox: [] as OutboxItem[],
    org: structuredClone(orgDefaults),
    offices: structuredClone(seedOffices),
    users: structuredClone(seedUsers),
    roles: structuredClone(seedRoles),
    accounts: structuredClone(seedAccounts),
    lineMap,
    journal: f.journal,
    vouchers: f.vouchers,
    advances: f.advances,
    rates: structuredClone(seedRates),
    closes: f.closes,
    fseq: { je: journal.length + 1, pv: f.nextPv, rv: f.nextRv, adv: 22 },
    projects: structuredClone(seedProjects),
    expenses: [...f.extraExpenses, ...s.expenses].map((e) =>
      e.id === 'ex-4-0' ? { ...e, activityCode: 'ACT-KSL-0135' } : e.id === 'ex-17-1' ? { ...e, activityCode: 'ACT-PTS-0047' } : e,
    ),
    requests: s.requests,
    reallocations: s.reallocations,
    rules: s.rules,
    deadlines: s.deadlines,
    seq: 143,
  }
}

// localStorage can throw (private mode, blocked storage); fall back to memory.
const mem = new Map<string, string>()
const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return mem.get(k) ?? null
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      mem.set(k, v)
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k)
    } catch {
      mem.delete(k)
    }
  },
}

const initialLang = (): Lang => {
  try {
    return (localStorage.getItem('phf-lang') as Lang) || 'ar'
  } catch {
    return 'ar'
  }
}

const decide = (steps: ApprovalStep[], userId: string, approve: boolean, note?: string) => {
  const next = steps.map((s) => ({ ...s }))
  const i = next.findIndex((s) => s.status === 'pending')
  if (i < 0) return { steps: next, done: true, approved: false }
  next[i] = { ...next[i], status: approve ? 'approved' : 'rejected', by: userId, at: new Date().toISOString(), note }
  if (!approve) return { steps: next, done: true, approved: false }
  if (i + 1 < next.length) {
    next[i + 1] = { ...next[i + 1], status: 'pending' }
    return { steps: next, done: false, approved: false }
  }
  return { steps: next, done: true, approved: true }
}

type SetFn = (p: Partial<State> | ((s: State) => Partial<State>)) => void

function applyMoves(stock: StockLevel[], moves: StockMove[]) {
  const next = stock.map((x) => ({ ...x }))
  for (const m of moves) {
    const sign = m.kind === 'receipt' || m.kind === 'transfer_in' ? 1 : -1
    const row = next.find((x) => x.itemId === m.itemId && x.officeId === m.officeId)
    if (row) row.qty += sign * m.qty
    else next.push({ itemId: m.itemId, officeId: m.officeId, qty: sign * m.qty })
  }
  return next
}

/** Attaches a field report to its activity and marks the activity's spending as matched. */
function applyReport(set: SetFn, get: () => State, activityId: string, report: FieldReport, quiet = false) {
  const s = get()
  const a = s.activities.find((x) => x.id === activityId)
  if (!a) return
  const no = report.no || `TR-${a.code.slice(4)}`
  set({
    activities: s.activities.map((x) => (x.id === activityId ? { ...x, report: { ...report, no, submittedBy: report.submittedBy ?? s.userId } } : x)),
    expenses: s.expenses.map((e) => (e.activityCode === a.code ? { ...e, hasTechReport: true } : e)),
  })
  if (!quiet) get().toast({ ar: `أُرسل التقرير الفني ${no} وارتبط بالنشاط ${a.code}`, en: `Field report ${no} sent and linked to ${a.code}` })
}

export type Gap =
  | { kind: 'spend_no_report'; id: string; officeId: string; amountUSD: number; date: string; lineId: string; expenseId: string }
  | { kind: 'report_overdue'; id: string; officeId: string; amountUSD: number; date: string; lineId: string; activityId: string }
  | { kind: 'report_no_spend'; id: string; officeId: string; amountUSD: number; date: string; lineId: string; activityId: string }

/** Places where the technical and financial sides don't line up yet. A report is due 5 days after the activity. */
export function matchingGaps(s: Pick<State, 'expenses' | 'activities' | 'advances' | 'requests'>): Gap[] {
  const gaps: Gap[] = []
  const now = Date.now()
  for (const e of s.expenses)
    if (!e.hasTechReport) gaps.push({ kind: 'spend_no_report', id: `g-${e.id}`, officeId: e.officeId, amountUSD: e.amountUSD, date: e.date, lineId: e.lineId, expenseId: e.id })
  for (const a of s.activities) {
    const funded =
      s.advances.some((x) => x.activityCode === a.code) || s.requests.some((r) => r.activityCode === a.code && r.status !== 'rejected') || s.expenses.some((e) => e.activityCode === a.code)
    if (!a.report && +new Date(a.date) + 5 * 86_400_000 < now)
      gaps.push({ kind: 'report_overdue', id: `g-${a.id}`, officeId: a.officeId, amountUSD: a.plannedUSD ?? 0, date: a.date, lineId: a.lineId, activityId: a.id })
    if (a.report && !funded && !a.inKind) gaps.push({ kind: 'report_no_spend', id: `g-ns-${a.id}`, officeId: a.officeId, amountUSD: a.plannedUSD ?? 0, date: a.report.submittedAt, lineId: a.lineId, activityId: a.id })
  }
  return gaps
}

export const useStore = create<State>()(
  persist(
  (set, get) => ({
  lang: initialLang(),
  userId: LIVE ? '' : 'u-fo',
  serverUsage: null,
  toasts: [],
  sidebarCollapsed: false,
  tourOpen: false,
  tourSeen: false,
  visited: {},
  checklistHidden: [],
  startTour: () => set({ tourOpen: true }),
  endTour: () => set({ tourOpen: false, tourSeen: true }),
  markVisited: (path) => {
    const s = get()
    const mine = s.visited[s.userId] ?? []
    if (!mine.includes(path)) set({ visited: { ...s.visited, [s.userId]: [...mine, path] } })
  },
  hideChecklist: (show) => {
    const s = get()
    set({ checklistHidden: show ? s.checklistHidden.filter((u) => u !== s.userId) : [...s.checklistHidden, s.userId] })
  },
  offlineSim: false,
  ...fresh(),

  setReportSettings: (r) => {
    set({ reportSettings: r })
    get().toast({ ar: 'حُفظت إعدادات إرسال التقارير', en: 'Report delivery settings saved' })
  },
  saveHqDraft: (period, patch) =>
    set((s) => {
      const cur = s.hqDrafts.find((d) => d.period === period) ?? { period, status: 'draft' as const }
      const next = { ...cur, ...patch }
      return { hqDrafts: [...s.hqDrafts.filter((d) => d.period !== period), next] }
    }),
  recordSent: (r) => {
    const s = get()
    const rec: SentReport = { ...r, id: `rp-${Date.now().toString(36)}`, at: new Date().toISOString(), by: s.userId }
    const deliveries: Delivery[] = [...r.to, ...r.cc].map((to, i) => ({
      id: `dl-rp-${Date.now()}-${i}`,
      at: rec.at,
      channel: 'email',
      to,
      subject: r.subject,
      status: s.channels.email.enabled ? 'sent' : 'skipped',
      reason: s.channels.email.enabled ? undefined : { ar: 'البريد غير مفعّل في الإعدادات', en: 'Email is turned off in settings' },
    }))
    set({ sentReports: [rec, ...s.sentReports], deliveries: [...deliveries, ...s.deliveries].slice(0, 400) })
    if (r.kind === 'hq') get().saveHqDraft(r.period, { status: 'sent' })
    get().toast({ ar: `أُرسل «${r.title.ar}» إلى ${r.to.join('، ')}`, en: `“${r.title.en}” sent to ${r.to.join(', ')}` })
  },

  runNotifications: () => {
    const s = get()
    const { notifications, deliveries } = runEngine(s)
    if (!notifications.length && !deliveries.length) return
    set({ notifications: [...notifications, ...s.notifications].slice(0, 400), deliveries: [...deliveries, ...s.deliveries].slice(0, 400) })
  },
  saveNotifRule: (r) => {
    const s = get()
    const exists = s.notifRules.some((x) => x.id === r.id)
    set({ notifRules: exists ? s.notifRules.map((x) => (x.id === r.id ? r : x)) : [...s.notifRules, r] })
    get().toast({ ar: 'حُفظت قاعدة التنبيه', en: 'Notification rule saved' })
  },
  deleteNotifRule: (id) => {
    set((s) => ({ notifRules: s.notifRules.filter((r) => r.id !== id) }))
  },
  markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id && !n.readBy.includes(s.userId) ? { ...n, readBy: [...n.readBy, s.userId] } : n)) })),
  markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => (n.userIds.includes(s.userId) && !n.readBy.includes(s.userId) ? { ...n, readBy: [...n.readBy, s.userId] } : n)) })),
  unreadCount: (userId) => get().notifications.filter((n) => n.userIds.includes(userId) && !n.readBy.includes(userId)).length,
  setChannels: (patch) => {
    set((s) => ({ channels: { ...s.channels, ...patch } }))
  },
  runChannelTest: (ch, to, draft) => {
    const s = get()
    const r = testChannel(draft ?? s.channels, ch, to)
    const test = { at: new Date().toISOString(), ok: r.ok, message: r.message }
    set({
      channels: { ...s.channels, [ch]: { ...s.channels[ch], lastTest: test } },
      deliveries: [
        { id: `dl-test-${Date.now()}`, at: test.at, channel: ch, to, subject: 'رسالة تجريبية من نظام إدارة الموارد', status: (r.ok ? 'sent' : 'failed') as Delivery['status'], reason: r.ok ? undefined : r.message },
        ...s.deliveries,
      ].slice(0, 400),
    })
    get().toast(r.message, r.ok ? 'ok' : 'bad')
    return test
  },
  saveDeadline: (d) => {
    const s = get()
    const exists = s.deadlines.some((x) => x.id === d.id)
    set({ deadlines: exists ? s.deadlines.map((x) => (x.id === d.id ? d : x)) : [...s.deadlines, d] })
    get().toast(exists ? { ar: 'حُفظ الموعد', en: 'Deadline saved' } : { ar: 'أُضيف الموعد وسيُنبَّه المسؤول قبله', en: 'Deadline added; its owner will be reminded beforehand' })
  },
  deleteDeadline: (id) => {
    set((s) => ({ deadlines: s.deadlines.filter((d) => d.id !== id) }))
  },

  saveActivity: (a) => {
    const s = get()
    const exists = s.activities.some((x) => x.id === a.id)
    set({ activities: exists ? s.activities.map((x) => (x.id === a.id ? a : x)) : [a, ...s.activities] })
    get().toast(exists ? { ar: `حُفظ النشاط ${a.code}`, en: `${a.code} saved` } : { ar: `أُنشئ النشاط ${a.code}`, en: `${a.code} created` })
  },
  submitReport: (activityId, report) => {
    const s = get()
    const offline = s.offlineSim || (typeof navigator !== 'undefined' && navigator.onLine === false)
    if (offline) {
      set({ outbox: [...s.outbox, { id: `ob-${Date.now()}`, activityId, report: { ...report, via: 'offline' }, savedAt: new Date().toISOString() }] })
      get().toast({ ar: 'لا يوجد اتصال — حُفظ التقرير على الجهاز وسيُرسل تلقائياً عند عودة الإنترنت', en: 'No connection — report saved on this device and will send when back online' }, 'warn')
      return 'queued'
    }
    applyReport(set, get, activityId, report)
    return 'sent'
  },
  setOfflineSim: (v) => {
    set({ offlineSim: v })
    if (!v && get().outbox.length) get().syncOutbox()
  },
  syncOutbox: () => {
    const items = get().outbox
    if (!items.length) return
    for (const it of items) applyReport(set, get, it.activityId, it.report, true)
    set({ outbox: [] })
    get().toast({ ar: `عاد الاتصال — أُرسل ${items.length} تقرير محفوظ`, en: `Back online — ${items.length} saved report(s) sent` })
  },
  linkExpense: (expenseId, activityCode) => {
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === expenseId ? { ...e, activityCode, hasTechReport: true } : e)) }))
    get().toast({ ar: `رُبط المصروف بالنشاط ${activityCode}`, en: `Expense linked to ${activityCode}` })
  },
  importReports: (rows) => {
    for (const r of rows) applyReport(set, get, r.activityId, { ...r.report, via: 'excel' }, true)
    get().toast({ ar: `استُورد ${rows.length} تقرير من ملف Excel`, en: `${rows.length} report(s) imported from Excel` })
  },
  gapCount: () => matchingGaps(get()).length,

  setOrg: (patch) => {
    set((s) => ({ org: { ...s.org, ...patch } }))
    get().toast({ ar: 'حُفظت إعدادات المؤسسة', en: 'Organization settings saved' })
  },
  saveOffice: (o) => {
    const s = get()
    const exists = s.offices.some((x) => x.id === o.id)
    if (exists) {
      set({ offices: s.offices.map((x) => (x.id === o.id ? o : x)) })
      get().toast({ ar: `حُفظ مكتب ${o.name.ar}`, en: `${o.name.en} office saved` })
      return
    }
    // A new office gets its own cash box account and a month-close row.
    const boxes = s.accounts.filter((a) => a.parent === '1101')
    const code = `1101-${String(boxes.length + 1).padStart(2, '0')}`
    const acc: Account = { code, parent: '1101', name: { ar: `صندوق مكتب ${o.name.ar}`, en: `${o.name.en} cash box` }, type: 'asset', postable: true, currency: 'SDG', officeId: o.id }
    set({ offices: [...s.offices, o], accounts: [...s.accounts, acc], closes: [...s.closes, { officeId: o.id, cashCounted: false }] })
    get().toast({ ar: `أُضيف مكتب ${o.name.ar} وأُنشئ له حساب صندوق ${code}`, en: `${o.name.en} office added with cash box account ${code}` })
  },
  saveUser: (u) => {
    const s = get()
    const exists = s.users.some((x) => x.id === u.id)
    set({ users: exists ? s.users.map((x) => (x.id === u.id ? u : x)) : [...s.users, u] })
    get().toast(
      exists
        ? { ar: `حُفظ المستخدم ${u.name.ar}`, en: `${u.name.en} saved` }
        : { ar: `أُضيف ${u.name.ar} وأُرسلت دعوة الدخول إلى ${u.email ?? ''}`, en: `${u.name.en} added; sign-in invitation sent to ${u.email ?? ''}` },
    )
  },
  saveRole: (r) => {
    const s = get()
    const exists = s.roles.some((x) => x.id === r.id)
    set({ roles: exists ? s.roles.map((x) => (x.id === r.id ? r : x)) : [...s.roles, r] })
  },
  deleteRole: (id) => {
    set((s) => ({ roles: s.roles.filter((r) => r.id !== id) }))
    get().toast({ ar: 'حُذف الدور', en: 'Role deleted' }, 'warn')
  },
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  setLang: (lang) => {
    try {
      localStorage.setItem('phf-lang', lang)
    } catch {
      /* storage unavailable */
    }
    set({ lang })
  },
  setUser: (userId) => set({ userId }),
  reset: () => {
    try {
      localStorage.removeItem('phf-procurement-demo')
    } catch {
      /* storage blocked */
    }
    set({ ...fresh(), userId: 'u-fo', visited: {}, checklistHidden: [], tourSeen: false })
    get().toast({ ar: 'أُعيدت بيانات العرض إلى وضعها الأصلي', en: 'Demo data restored to its starting point' })
  },
  toast: (text, tone = 'ok') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  submitRequest: (draft) => {
    const s = get()
    const found = findLine(s.projects, draft.lineId)
    if (!found) return null
    const rate = s.rates[s.rates.length - 1].rate
    const amountUSD = draft.currency === 'USD' ? draft.amount : draft.amount / rate
    const check = checkCeiling(found.project, found.pillar, found.line, amountUSD, s)
    if (check.verdict === 'blocked') return null
    const over = check.verdict === 'needs_extra_approval'
    const { rule, chain } = routeApproval(s.rules, 'spend', amountUSD, over, draft.officeId)
    const n = s.seq
    const req: SpendRequest = {
      id: `sr-${n}`,
      code: `SR-${String(n).padStart(4, '0')}`,
      officeId: draft.officeId,
      projectId: draft.projectId,
      lineId: draft.lineId,
      activityCode: draft.activityCode || undefined,
      purpose: { ar: draft.purpose, en: draft.purpose },
      amount: draft.amount,
      currency: draft.currency,
      rate,
      amountUSD: Math.round(amountUSD * 100) / 100,
      requesterId: s.userId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      overCeiling: over,
      ruleId: rule?.id,
      steps: chain.map((role, i) => ({ role, status: i === 0 ? 'pending' : 'waiting' })),
    }
    set({ requests: [req, ...s.requests], seq: n + 1 })
    get().toast({ ar: `أُرسل الطلب ${req.code} للاعتماد`, en: `${req.code} sent for approval` })
    return req
  },

  decideRequest: (id, approve, note) => {
    const s = get()
    const req = s.requests.find((r) => r.id === id)
    if (!req) return
    const r = decide(req.steps, s.userId, approve, note)
    const status = !approve ? 'rejected' : r.approved ? 'approved' : 'pending'
    set({ requests: s.requests.map((x) => (x.id === id ? { ...x, steps: r.steps, status } : x)) })
    get().toast(
      approve
        ? status === 'approved'
          ? { ar: `اكتمل اعتماد ${req.code} وحُجز المبلغ على البند`, en: `${req.code} fully approved; amount committed to the line` }
          : { ar: `اعتُمد ${req.code} وانتقل للمعتمد التالي`, en: `${req.code} approved and passed to the next approver` }
        : { ar: `رُفض ${req.code} وأُعيد المبلغ إلى رصيد البند`, en: `${req.code} rejected; amount released back to the line` },
      approve ? 'ok' : 'warn',
    )
  },

  submitReallocation: (draft) => {
    const s = get()
    const { chain } = routeApproval(s.rules, 'reallocation', draft.amountUSD)
    const n = s.seq
    const ra: Reallocation = {
      id: `ra-${n}`,
      code: `RA-${String(n).padStart(4, '0')}`,
      projectId: draft.projectId,
      fromLineId: draft.fromLineId,
      toLineId: draft.toLineId,
      amountUSD: draft.amountUSD,
      reason: { ar: draft.reason, en: draft.reason },
      requesterId: s.userId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      steps: chain.map((role, i) => ({ role, status: i === 0 ? 'pending' : 'waiting' })),
    }
    set({ reallocations: [ra, ...s.reallocations], seq: n + 1 })
    get().toast({ ar: `أُرسل طلب المناقلة ${ra.code} للاعتماد`, en: `Reallocation ${ra.code} sent for approval` })
    return ra
  },

  decideReallocation: (id, approve, note) => {
    const s = get()
    const ra = s.reallocations.find((r) => r.id === id)
    if (!ra) return
    const r = decide(ra.steps, s.userId, approve, note)
    const status = !approve ? 'rejected' : r.approved ? 'approved' : 'pending'
    set({ reallocations: s.reallocations.map((x) => (x.id === id ? { ...x, steps: r.steps, status } : x)) })
    get().toast(
      status === 'approved'
        ? { ar: `نُفّذت المناقلة ${ra.code} وتحدّثت سقوف البنود`, en: `${ra.code} applied; line ceilings updated` }
        : approve
          ? { ar: `اعتُمدت ${ra.code} وانتقلت للمعتمد التالي`, en: `${ra.code} approved and passed on` }
          : { ar: `رُفضت المناقلة ${ra.code}`, en: `${ra.code} rejected` },
      approve ? 'ok' : 'warn',
    )
  },




  // ---- people ---------------------------------------------------------------
  saveEmployee: (e) => {
    const s = get()
    const exists = s.employees.some((x) => x.id === e.id)
    set({ employees: exists ? s.employees.map((x) => (x.id === e.id ? e : x)) : [...s.employees, e] })
    get().toast(exists ? { ar: `حُفظ ملف ${e.name.ar}`, en: `${e.name.en} saved` } : { ar: `أُضيف الموظف ${e.name.ar} (${e.no})`, en: `${e.name.en} added (${e.no})` })
  },
  requestLeave: (l) => {
    set((s) => ({ leaves: [{ ...l, id: `lv-${Date.now()}`, status: 'pending', createdAt: new Date().toISOString() }, ...s.leaves] }))
    get().toast({ ar: 'أُرسل طلب الإجازة إلى الموارد البشرية', en: 'Leave request sent to HR' })
  },
  decideLeave: (id, approve) => {
    const s = get()
    const l = s.leaves.find((x) => x.id === id)
    if (!l) return
    const now = Date.now()
    set({
      leaves: s.leaves.map((x) => (x.id === id ? { ...x, status: approve ? 'approved' : 'rejected', decidedBy: s.userId } : x)),
      employees: s.employees.map((e) =>
        e.id === l.employeeId && approve
          ? { ...e, leaveBalance: l.type === 'annual' ? Math.max(0, e.leaveBalance - l.days) : e.leaveBalance, status: +new Date(l.from) <= now && +new Date(l.to) >= now ? 'on_leave' : e.status }
          : e,
      ),
    })
    get().toast(approve ? { ar: 'اعتُمدت الإجازة وخُصمت من الرصيد', en: 'Leave approved and deducted from the balance' } : { ar: 'رُفض طلب الإجازة', en: 'Leave request rejected' }, approve ? 'ok' : 'warn')
  },
  postPayroll: (period) => {
    const s = get()
    if (s.payrolls.some((p) => p.period === period)) return
    const rate = s.rates.at(-1)!.rate
    const paid = s.employees.filter((e) => e.status !== 'ended' && e.salarySDG > 0)
    const now = new Date().toISOString()
    const ded = 0.08 // employee social insurance withheld
    const lines: JournalLine[] = []
    const expenses: Expense[] = []
    let gross = 0
    for (const e of paid) {
      const g = e.salarySDG / rate
      gross += g
      let left = 1
      for (const a of e.allocations) {
        const part = Math.round(g * (a.pct / 100) * 100) / 100
        left -= a.pct / 100
        lines.push({ account: '5201', debit: part, credit: 0, officeId: e.officeId, projectId: a.projectId, lineId: a.lineId })
        expenses.push({ id: `ex-pay-${period}-${e.id}-${a.lineId}`, lineId: a.lineId, projectId: a.projectId, officeId: e.officeId, amountUSD: part, date: now, hasTechReport: true })
      }
      if (left > 0.001) lines.push({ account: '5201', debit: Math.round(g * left * 100) / 100, credit: 0, officeId: e.officeId })
    }
    const total = lines.reduce((t, l) => t + l.debit, 0)
    const withheld = Math.round(total * ded * 100) / 100
    const net = Math.round((total - withheld) * 100) / 100
    lines.push({ account: BANK_SDG, debit: 0, credit: net, sdg: -Math.round(net * rate), officeId: 'khr' })
    lines.push({ account: '2104', debit: 0, credit: withheld })
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: now,
      memo: { ar: `رواتب شهر ${period}`, en: `Payroll ${period}` },
      source: 'payment',
      ref: `PAY-${period}`,
      lines,
    }
    set({
      journal: [...s.journal, je],
      expenses: [...expenses, ...s.expenses],
      payrolls: [...s.payrolls, { period, postedAt: now, postedBy: s.userId, rate, totalSDG: paid.reduce((t, e) => t + e.salarySDG, 0), journalId: je.id }],
      fseq: { ...s.fseq, je: s.fseq.je + 1 },
    })
    void gross
    get().toast({ ar: `رُحّلت رواتب ${period} — القيد ${je.no}، وحُمّلت حصص المشاريع على بنودها`, en: `Payroll ${period} posted — entry ${je.no}; project shares charged to their lines` })
  },
  saveBeneficiary: (b, _opts) => {
    void _opts
    const s = get()
    const exists = s.beneficiaries.some((x) => x.id === b.id)
    set({ beneficiaries: exists ? s.beneficiaries.map((x) => (x.id === b.id ? b : x)) : [b, ...s.beneficiaries] })
    get().toast(exists ? { ar: 'حُفظت البيانات', en: 'Saved' } : { ar: `سُجّل المستفيد ${b.no}`, en: `Beneficiary ${b.no} registered` })
  },
  addService: (id, sv) => {
    set((s) => ({ beneficiaries: s.beneficiaries.map((b) => (b.id === id ? { ...b, services: [...b.services, { ...sv, id: `sv-${Date.now()}` }] } : b)) }))
    get().toast({ ar: 'سُجّلت الخدمة', en: 'Service recorded' })
  },

  // ---- supply chain & logistics -------------------------------------------
  qtyOf: (itemId, officeId) => get().stock.find((x) => x.itemId === itemId && x.officeId === officeId)?.qty ?? 0,
  lowStockCount: () => {
    const s = get()
    return s.stock.filter((x) => {
      const it = s.items.find((i) => i.id === x.itemId)
      return it && it.active !== false && x.qty < it.min
    }).length
  },
  saveItem: (i) => {
    const s = get()
    const exists = s.items.some((x) => x.id === i.id)
    set({ items: exists ? s.items.map((x) => (x.id === i.id ? i : x)) : [...s.items, i] })
    get().toast({ ar: `حُفظ الصنف ${i.name.ar}`, en: `${i.name.en} saved` })
  },
  receiveSupplies: (d) => {
    const s = get()
    const now = new Date().toISOString()
    const ref = `GRN-${String(s.stockMoves.length + 1).padStart(4, '0')}`
    const moves: StockMove[] = d.lines.map((l, i) => {
      const it = s.items.find((x) => x.id === l.itemId)!
      return { id: `mv-n${Date.now()}-${i}`, no: ref, kind: 'receipt', date: now, itemId: l.itemId, officeId: d.officeId, qty: l.qty, valueUSD: Math.round(l.qty * it.unitValueUSD * 100) / 100, ref, source: { ar: d.source, en: d.source }, expiry: l.expiry, by: s.userId }
    })
    const total = moves.reduce((t, m) => t + m.valueUSD, 0)
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: now,
      memo: { ar: `استلام تغذية عينية ${ref} — ${d.source}`, en: `In-kind receipt ${ref} — ${d.source}` },
      source: 'transfer',
      ref,
      lines: [
        { account: INVENTORY, debit: total, credit: 0, officeId: d.officeId },
        { account: INKIND_REVENUE, debit: 0, credit: total },
      ],
    }
    set({ stockMoves: [...moves, ...s.stockMoves], stock: applyMoves(s.stock, moves), journal: [...s.journal, je], fseq: { ...s.fseq, je: s.fseq.je + 1 } })
    get().toast({ ar: `سُجّل الاستلام ${ref} بقيمة $${Math.round(total).toLocaleString('en-US')} وأُضيف للمخزون`, en: `Receipt ${ref} worth $${Math.round(total).toLocaleString('en-US')} added to stock` })
    return ref
  },
  issueSupplies: (d) => {
    const s = get()
    for (const l of d.lines) if (l.qty > (s.stock.find((x) => x.itemId === l.itemId && x.officeId === d.officeId)?.qty ?? 0)) return null
    const now = new Date().toISOString()
    const act = s.activities.find((a) => a.id === d.activityId)
    const ref = `ISS-${String(s.stockMoves.length + 1).padStart(4, '0')}`
    const moves: StockMove[] = d.lines.map((l, i) => {
      const it = s.items.find((x) => x.id === l.itemId)!
      return { id: `mv-n${Date.now()}-${i}`, no: ref, kind: 'issue', date: now, itemId: l.itemId, officeId: d.officeId, qty: l.qty, valueUSD: Math.round(l.qty * it.unitValueUSD * 100) / 100, ref: act?.code ?? d.note, activityId: act?.id, by: s.userId }
    })
    const byAcc = new Map<string, number>()
    for (const m of moves) {
      const acc = categoryAccount[s.items.find((x) => x.id === m.itemId)!.category]
      byAcc.set(acc, (byAcc.get(acc) ?? 0) + m.valueUSD)
    }
    const total = moves.reduce((t, m) => t + m.valueUSD, 0)
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: now,
      memo: { ar: `صرف مواد عينية ${ref}${act ? ` — ${act.code}` : ''}`, en: `In-kind issue ${ref}${act ? ` — ${act.code}` : ''}` },
      source: 'transfer',
      ref,
      lines: [
        ...[...byAcc].map(([account, v]) => ({ account, debit: v, credit: 0, officeId: d.officeId, projectId: act?.projectId, lineId: act?.lineId })),
        { account: INVENTORY, debit: 0, credit: total, officeId: d.officeId },
      ],
    }
    set({ stockMoves: [...moves, ...s.stockMoves], stock: applyMoves(s.stock, moves), journal: [...s.journal, je], fseq: { ...s.fseq, je: s.fseq.je + 1 } })
    get().toast({ ar: `صُرفت المواد ${ref}${act ? ` للنشاط ${act.code}` : ''}`, en: `Stock issued ${ref}${act ? ` to ${act.code}` : ''}` })
    return ref
  },
  createShipment: (d) => {
    const s = get()
    const n = s.shipments.length + 21
    const sh: Shipment = { id: `sh-n${Date.now()}`, no: `SHP-${String(n).padStart(4, '0')}`, ...d, status: 'preparing', createdAt: new Date().toISOString() }
    set({ shipments: [sh, ...s.shipments] })
    get().toast({ ar: `أُنشئت الشحنة ${sh.no}`, en: `Shipment ${sh.no} created` })
    return sh
  },
  dispatchShipment: (id) => {
    const s = get()
    const sh = s.shipments.find((x) => x.id === id)
    if (!sh || sh.status !== 'preparing') return false
    for (const l of sh.lines) if (l.qty > (s.stock.find((x) => x.itemId === l.itemId && x.officeId === sh.fromOfficeId)?.qty ?? 0)) {
      get().toast({ ar: 'الرصيد في مخزن الإرسال لا يكفي لهذه الشحنة', en: 'Not enough stock at the sending store' }, 'bad')
      return false
    }
    const now = new Date().toISOString()
    const moves: StockMove[] = sh.lines.map((l, i) => ({ id: `mv-n${Date.now()}-${i}`, no: sh.no, kind: 'transfer_out', date: now, itemId: l.itemId, officeId: sh.fromOfficeId, qty: l.qty, valueUSD: Math.round(l.qty * s.items.find((x) => x.id === l.itemId)!.unitValueUSD * 100) / 100, ref: sh.no, by: s.userId }))
    set({
      shipments: s.shipments.map((x) => (x.id === id ? { ...x, status: 'in_transit', departedAt: now } : x)),
      stockMoves: [...moves, ...s.stockMoves],
      stock: applyMoves(s.stock, moves),
      vehicles: s.vehicles.map((v) => (v.id === sh.vehicleId ? { ...v, status: 'on_trip' } : v)),
    })
    get().toast({ ar: `انطلقت الشحنة ${sh.no} — يُبلَّغ المكتب المستلم`, en: `${sh.no} dispatched — the receiving office is notified` })
    return true
  },
  receiveShipment: (id, received) => {
    const s = get()
    const sh = s.shipments.find((x) => x.id === id)
    if (!sh || sh.status !== 'in_transit') return
    const now = new Date().toISOString()
    const lines = sh.lines.map((l) => ({ ...l, received: Math.max(0, Math.min(l.qty, received[l.itemId] ?? l.qty)) }))
    const moves: StockMove[] = lines.map((l, i) => ({ id: `mv-n${Date.now()}-${i}`, no: sh.no, kind: 'transfer_in', date: now, itemId: l.itemId, officeId: sh.toOfficeId, qty: l.received!, valueUSD: Math.round(l.received! * s.items.find((x) => x.id === l.itemId)!.unitValueUSD * 100) / 100, ref: sh.no, by: s.userId }))
    const lost = lines.reduce((t, l) => t + (l.qty - l.received!) * s.items.find((x) => x.id === l.itemId)!.unitValueUSD, 0)
    const extra: Partial<State> = {}
    if (lost > 0) {
      extra.journal = [
        ...s.journal,
        {
          id: `je-n${s.fseq.je}`,
          no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
          date: now,
          memo: { ar: `نقص عند استلام الشحنة ${sh.no}`, en: `Shortage on receiving ${sh.no}` },
          source: 'transfer',
          ref: sh.no,
          lines: [
            { account: '5299', debit: lost, credit: 0, officeId: sh.toOfficeId },
            { account: INVENTORY, debit: 0, credit: lost, officeId: sh.fromOfficeId },
          ],
        },
      ]
      extra.fseq = { ...s.fseq, je: s.fseq.je + 1 }
    }
    set({
      ...extra,
      shipments: s.shipments.map((x) => (x.id === id ? { ...x, lines, status: 'delivered', deliveredAt: now, receivedBy: s.userId } : x)),
      stockMoves: [...moves, ...s.stockMoves],
      stock: applyMoves(s.stock, moves),
      vehicles: s.vehicles.map((v) => (v.id === sh.vehicleId ? { ...v, status: 'available' } : v)),
    })
    get().toast(
      lost > 0
        ? { ar: `استُلمت الشحنة ${sh.no} مع نقص بقيمة $${Math.round(lost)} — سُجّل قيد بالفرق`, en: `${sh.no} received with a $${Math.round(lost)} shortage — an entry was posted` }
        : { ar: `استُلمت الشحنة ${sh.no} كاملة وأُضيفت لمخزن المكتب`, en: `${sh.no} received in full and added to the office store` },
      lost > 0 ? 'warn' : 'ok',
    )
  },
  saveVehicle: (v) => {
    const s = get()
    const exists = s.vehicles.some((x) => x.id === v.id)
    set({ vehicles: exists ? s.vehicles.map((x) => (x.id === v.id ? v : x)) : [...s.vehicles, v] })
    get().toast({ ar: `حُفظت المركبة ${v.plate}`, en: `Vehicle ${v.plate} saved` })
  },
  addFuel: (vehicleId, f) => {
    set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === vehicleId ? { ...v, odometer: Math.max(v.odometer, f.odometer), fuel: [...v.fuel, { ...f, id: `f-${Date.now()}` }] } : v)) }))
    get().toast({ ar: 'سُجّلت تعبئة الوقود', en: 'Fuel fill-up recorded' })
  },

  // ---- finance ------------------------------------------------------------
  issuePayment: (requestId, method, staffId) => {
    const s = get()
    const req = s.requests.find((r) => r.id === requestId)
    if (!req || req.status !== 'approved') return
    const now = new Date().toISOString()
    const rate = s.rates[s.rates.length - 1].rate
    const dims = { officeId: req.officeId, projectId: req.projectId, lineId: req.lineId }
    const account =
      method === 'cash' || method === 'advance'
        ? cashAccount(req.officeId, s.accounts)
        : req.currency === 'USD' && method === 'bank'
          ? BANK_USD
          : req.officeId === 'pts' && method === 'bank'
            ? BANK_PTS
            : BANK_SDG
    const sdgAcc = s.accounts.find((a) => a.code === account)?.currency === 'SDG'
    const credit: JournalLine = { account, debit: 0, credit: req.amountUSD, sdg: sdgAcc ? -Math.round(req.amountUSD * rate) : undefined, officeId: req.officeId }
    const pvNo = `PV-${String(s.fseq.pv).padStart(4, '0')}`
    const jeNo = `JE-${String(s.fseq.je).padStart(4, '0')}`
    const line = findLine(s.projects, req.lineId)!.line
    let advance: Advance | undefined
    let expense: Expense | undefined
    let debit: JournalLine
    let memo: Bi
    if (method === 'advance') {
      const st = staffId ?? staff.find((x) => x.officeId === req.officeId)?.id ?? 's-ksl'
      const no = `ADV-${String(s.fseq.adv).padStart(4, '0')}`
      advance = {
        id: no.toLowerCase(),
        no,
        staffId: st,
        officeId: req.officeId,
        projectId: req.projectId,
        lineId: req.lineId,
        activityCode: req.activityCode ?? `ACT-${req.officeId.toUpperCase()}-${s.fseq.adv}`,
        requestId: req.id,
        amountUSD: req.amountUSD,
        issuedAt: now,
        dueAt: daysFromNow(14),
        status: 'open',
      }
      debit = { account: ADVANCES, debit: req.amountUSD, credit: 0, ...dims }
      memo = { ar: `صرف عهدة ${no} — ${req.code}`, en: `Advance ${no} — ${req.code}` }
    } else {
      expense = { id: `ex-${req.id}`, requestId: req.id, activityCode: req.activityCode, amountUSD: req.amountUSD, date: now, hasTechReport: !!s.activities.find((x) => x.code === req.activityCode)?.report, ...dims }
      debit = { account: s.lineMap[req.lineId], debit: req.amountUSD, credit: 0, ...dims }
      memo = { ar: `${req.code} — ${line.code} ${line.name.ar}`, en: `${req.code} — ${line.code} ${line.name.en}` }
    }
    const je: JournalEntry = { id: `je-n${s.fseq.je}`, no: jeNo, date: now, memo, source: method === 'advance' ? 'advance' : 'payment', ref: advance?.no ?? pvNo, lines: [debit, credit] }
    const v: Voucher = {
      id: `pv-n${s.fseq.pv}`,
      no: pvNo,
      kind: 'payment',
      date: now,
      method,
      account,
      amountUSD: req.amountUSD,
      currency: req.currency,
      amount: req.amount,
      rate,
      party: advance ? staff.find((x) => x.id === advance!.staffId)!.name : { ar: 'المورد', en: 'Supplier' },
      memo: req.purpose,
      requestId: req.id,
      journalId: je.id,
      ...dims,
    }
    set({
      requests: s.requests.map((x) => (x.id === requestId ? { ...x, status: 'paid' } : x)),
      expenses: expense ? [expense, ...s.expenses] : s.expenses,
      advances: advance ? [advance, ...s.advances] : s.advances,
      journal: [...s.journal, je],
      vouchers: [v, ...s.vouchers],
      fseq: { ...s.fseq, je: s.fseq.je + 1, pv: s.fseq.pv + 1, adv: s.fseq.adv + (advance ? 1 : 0) },
    })
    get().toast(
      advance
        ? { ar: `صُرفت العهدة ${advance.no} — تُسوّى بعد التقرير الفني`, en: `Advance ${advance.no} issued — settle it after the field report` }
        : { ar: `صدر سند الصرف ${pvNo} والقيد ${jeNo}`, en: `Payment voucher ${pvNo} and entry ${jeNo} posted` },
    )
  },

  recordReceipt: (d) => {
    const s = get()
    const now = new Date().toISOString()
    const rate = s.rates[s.rates.length - 1].rate
    const rvNo = `RV-${String(s.fseq.rv).padStart(4, '0')}`
    const sdgAcc = s.accounts.find((a) => a.code === d.account)?.currency === 'SDG'
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: now,
      memo: { ar: d.memo, en: d.memo },
      source: 'receipt',
      ref: rvNo,
      lines: [
        { account: d.account, debit: d.amountUSD, credit: 0, sdg: sdgAcc ? Math.round(d.amountUSD * rate) : undefined, projectId: d.projectId, officeId: 'khr' },
        { account: d.revenueAccount, debit: 0, credit: d.amountUSD, projectId: d.projectId },
      ],
    }
    const v: Voucher = {
      id: `rv-n${s.fseq.rv}`,
      no: rvNo,
      kind: 'receipt',
      date: now,
      method: 'transfer',
      account: d.account,
      amountUSD: d.amountUSD,
      currency: sdgAcc ? 'SDG' : 'USD',
      amount: sdgAcc ? Math.round(d.amountUSD * rate) : d.amountUSD,
      rate,
      party: { ar: d.party, en: d.party },
      memo: { ar: d.memo, en: d.memo },
      officeId: 'khr',
      projectId: d.projectId,
      journalId: je.id,
    }
    set({ journal: [...s.journal, je], vouchers: [v, ...s.vouchers], fseq: { ...s.fseq, je: s.fseq.je + 1, rv: s.fseq.rv + 1 } })
    get().toast({ ar: `سُجّل سند القبض ${rvNo}`, en: `Receipt voucher ${rvNo} recorded` })
  },

  settleAdvance: (id, items, reportNo) => {
    const s = get()
    const a = s.advances.find((x) => x.id === id)
    if (!a || a.status !== 'open') return
    const now = new Date().toISOString()
    const rate = s.rates[s.rates.length - 1].rate
    const spent = Math.round(items.reduce((t, i) => t + i.amountUSD, 0) * 100) / 100
    const returned = Math.max(0, Math.round((a.amountUSD - spent) * 100) / 100)
    const reimbursed = Math.max(0, Math.round((spent - a.amountUSD) * 100) / 100)
    const dims = { officeId: a.officeId, projectId: a.projectId, lineId: a.lineId }
    const cash = cashAccount(a.officeId, s.accounts)
    const lines: JournalLine[] = [{ account: s.lineMap[a.lineId], debit: spent, credit: 0, ...dims }]
    if (returned > 0) lines.push({ account: cash, debit: returned, credit: 0, sdg: Math.round(returned * rate), officeId: a.officeId })
    lines.push({ account: ADVANCES, debit: 0, credit: a.amountUSD, ...dims })
    if (reimbursed > 0) lines.push({ account: cash, debit: 0, credit: reimbursed, sdg: -Math.round(reimbursed * rate), officeId: a.officeId })
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: now,
      memo: { ar: `تسوية عهدة ${a.no} — ${a.activityCode}`, en: `Settlement of advance ${a.no} — ${a.activityCode}` },
      source: 'settlement',
      ref: a.no,
      lines,
    }
    const expense: Expense = { id: `ex-${a.id}`, activityCode: a.activityCode, amountUSD: spent, date: now, hasTechReport: true, ...dims }
    set({
      advances: s.advances.map((x) => (x.id === id ? { ...x, status: 'settled', settlement: { at: now, items, returnedUSD: returned, reimbursedUSD: reimbursed, reportNo } } : x)),
      journal: [...s.journal, je],
      expenses: [expense, ...s.expenses],
      fseq: { ...s.fseq, je: s.fseq.je + 1 },
    })
    get().toast({ ar: `سُوّيت العهدة ${a.no} وطوبقت مع التقرير ${reportNo}`, en: `${a.no} settled and matched to report ${reportNo}` })
  },

  addAccount: (a) => {
    set((s) => ({ accounts: [...s.accounts, a] }))
    get().toast({ ar: `أُضيف الحساب ${a.code}`, en: `Account ${a.code} added` })
  },
  setLineAccount: (lineId, code) => {
    set((s) => ({ lineMap: { ...s.lineMap, [lineId]: code } }))
  },

  addRate: (rate) => {
    const s = get()
    const today = new Date().toDateString()
    const kept = s.rates.filter((r) => new Date(r.date).toDateString() !== today)
    set({ rates: [...kept, { date: new Date().toISOString(), rate, source: { ar: 'أدخله مدير الشؤون المالية', en: 'Entered by Finance Manager' } }] })
    get().toast({ ar: `اعتُمد سعر اليوم ${rate} ج.س للدولار`, en: `Today's rate set to ${rate} SDG per USD` })
  },

  postRevaluation: () => {
    const s = get()
    const rate = s.rates[s.rates.length - 1].rate
    const rows = revaluation(s.accounts, s.journal, rate).filter((r) => Math.abs(r.diff) >= 0.5)
    if (!rows.length) return
    const lines: JournalLine[] = []
    let net = 0
    for (const r of rows) {
      const d = Math.round(r.diff * 100) / 100
      net += d
      lines.push({ account: r.account.code, debit: d > 0 ? d : 0, credit: d < 0 ? -d : 0, sdg: 0, officeId: r.account.officeId })
    }
    net = Math.round(net * 100) / 100
    lines.push(net < 0 ? { account: FX_LOSS, debit: -net, credit: 0 } : { account: FX_GAIN, debit: 0, credit: net })
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: new Date().toISOString(),
      memo: { ar: `إعادة تقييم أرصدة الجنيه بسعر ${rate}`, en: `Revaluation of SDG balances at ${rate}` },
      source: 'fx',
      lines,
    }
    set({ journal: [...s.journal, je], fseq: { ...s.fseq, je: s.fseq.je + 1 } })
    get().toast({ ar: `رُحّل قيد فروق العملة ${je.no}`, en: `FX entry ${je.no} posted` }, net < 0 ? 'warn' : 'ok')
  },

  setCashCounted: (officeId, v) => {
    set((s) => ({ closes: s.closes.map((c) => (c.officeId === officeId ? { ...c, cashCounted: v } : c)) }))
  },
  closeMonth: (officeId) => {
    set((s) => ({ closes: s.closes.map((c) => (c.officeId === officeId ? { ...c, closedAt: new Date().toISOString(), closedBy: s.userId } : c)) }))
    get().toast({ ar: 'أُقفل الشهر للمكتب — لا يمكن الترحيل بتاريخ سابق', en: 'Month closed for the office — no back-dated posting' })
  },

  updateRule: (id, patch) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  addRule: (kind) => {
    set((s) => ({
      rules: [
        ...s.rules,
        {
          id: `r${Date.now()}`,
          name: { ar: 'قاعدة جديدة', en: 'New rule' },
          minUSD: 0,
          maxUSD: null,
          appliesTo: kind,
          officeId: null,
          chain: ['supervisor'],
          active: false,
        },
      ],
    }))
  },
  removeRule: (id) => {
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }))
  },
  addProject: (np) => {
    const slug = np.code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `prj-${Date.now()}`
    let id = slug
    if (get().projects.some((p) => p.id === id)) id = `${slug}-${Date.now().toString(36)}`
    const project: Project = {
      id,
      code: np.code,
      name: np.name,
      donor: np.donor,
      fundId: 'f-cash',
      start: np.start,
      end: np.end,
      controlMode: np.controlMode,
      tolerancePct: np.tolerancePct,
      pillars: np.pillars.map((p, i) => {
        const lines = p.lines.map((l, j) => ({ id: `${id}-p${i + 1}-l${j + 1}`, code: l.code, name: l.name, ceilingUSD: l.ceilingUSD, ...(l.detail ?? {}) }))
        return { id: `${id}-p${i + 1}`, code: p.code, name: p.name, ceilingUSD: lines.reduce((t, l) => t + l.ceilingUSD, 0), lines }
      }),
    }
    const map: Record<string, string> = {}
    np.pillars.forEach((p, i) => p.lines.forEach((l, j) => l.account && (map[`${id}-p${i + 1}-l${j + 1}`] = l.account)))
    set((s) => ({ projects: [...s.projects, project], lineMap: { ...s.lineMap, ...map } }))
    get().toast({ ar: `أُنشئ المشروع ${np.code}`, en: `Project ${np.code} created` })
  },
  setProjectControl: (projectId, mode, tolerancePct) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, controlMode: mode, tolerancePct } : p)) })),
  }),
  {
    name: LIVE ? 'phf-erp-live-ui-v1' : 'phf-erp-demo-v11',
    storage: createJSONStorage(() => safeStorage),
    partialize: (s) => {
      const { toasts: _t, tourOpen: _o, ...rest } = s
      void _t
      void _o
      // Live mode keeps only screen preferences here; the data always comes from the server.
      if (LIVE) return { outbox: s.outbox, lang: s.lang, sidebarCollapsed: s.sidebarCollapsed, tourSeen: s.tourSeen, visited: s.visited, checklistHidden: s.checklistHidden } as typeof rest
      return rest
    },
  },
  ),
)

// Re-evaluate notification rules shortly after data changes (debounced).
let notifTimer: ReturnType<typeof setTimeout> | undefined
let lastSig = ''
if (!LIVE) useStore.subscribe((st) => {
  const sig = [st.requests, st.reallocations, st.deadlines, st.advances, st.activities, st.expenses, st.closes, st.notifRules, st.projects, (st as unknown as { stock?: unknown }).stock]
    .map((x) => (Array.isArray(x) ? x.length + ':' + JSON.stringify(x).length : String(x && JSON.stringify(x).length)))
    .join('|')
  if (sig === lastSig) return
  lastSig = sig
  clearTimeout(notifTimer)
  notifTimer = setTimeout(() => useStore.getState().runNotifications(), 250)
})
if (!LIVE) setTimeout(() => useStore.getState().runNotifications(), 50)

// Role names are read outside React in a few places; keep a live copy.
const syncRoles = () => ((globalThis as { __phfRoles?: Role[] }).__phfRoles = useStore.getState().roles)
syncRoles()
useStore.subscribe(syncRoles)

export const getOffices = () => useStore.getState().offices
export const getUsers = () => useStore.getState().users

const rank: Record<Access, number> = { none: 0, view: 1, edit: 2, manage: 3 }
export function usePerm() {
  const user = useUser()
  const role = useStore((s) => s.roles.find((r) => r.id === user.role))
  const can = (m: ModuleKey, min: Access = 'view') => !!role && rank[role.permissions[m]] >= rank[min]
  const scopeOffice = role?.scope === 'office' ? user.officeId : null
  return { can, role, user, scopeOffice }
}

export const useUser = () => {
  const id = useStore((s) => s.userId)
  const users = useStore((s) => s.users)
  return users.find((u) => u.id === id) ?? users[0]
}

export { daysFromNow }
