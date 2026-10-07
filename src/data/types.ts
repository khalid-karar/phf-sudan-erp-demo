// Domain model for the demo. Shaped like the future backend API so the mock layer can be swapped out.

export type Lang = 'ar' | 'en'
export type Bi = { ar: string; en: string }

export type RoleKey = string

export type ModuleKey = 'dashboard' | 'projects' | 'activities' | 'finance' | 'supply' | 'logistics' | 'patients' | 'hr' | 'reports' | 'alerts' | 'settings'
export type Access = 'none' | 'view' | 'edit' | 'manage'
export const MODULE_KEYS: ModuleKey[] = ['dashboard', 'projects', 'activities', 'finance', 'supply', 'logistics', 'patients', 'hr', 'reports', 'alerts', 'settings']

export interface Role {
  id: RoleKey
  name: Bi
  description: Bi
  permissions: Record<ModuleKey, Access>
  scope: 'office' | 'all' // office = sees only their own office's records
  canApprove: boolean // can appear as a step in approval routes
  system?: boolean // cannot be deleted
}

export interface User {
  id: string
  name: Bi
  role: RoleKey
  officeId: string
  email?: string
  phone?: string
  active?: boolean
}

export interface Office {
  id: string
  name: Bi
  state: Bi
  lat: number
  lon: number
  isHQ?: boolean
  type?: 'hq' | 'office' | 'warehouse'
  managerId?: string
  phone?: string
  active?: boolean
}

export interface OrgSettings {
  name: Bi
  shortName: Bi
  logo: string // URL or data URL
  hqName: Bi // headquarters the monthly report goes to
  localCurrency: string
  baseCurrency: string
  fiscalYearStartMonth: number // 1–12
  defaultLang: Lang
  weekStartsOn: 'sat' | 'sun' | 'mon'
}

export type FundType = 'cash' | 'inkind' // دعم نقدي → Finance ; التغذية → Supply chain

export interface Fund {
  id: string
  type: FundType
  name: Bi
  donor: Bi
  receivedUSD: number
}

export type ControlMode = 'hard' | 'soft'

export interface BudgetLine {
  id: string
  code: string
  name: Bi
  ceilingUSD: number
}

export interface Pillar {
  id: string
  code: string
  name: Bi
  ceilingUSD: number
  lines: BudgetLine[]
}

export interface Project {
  id: string
  code: string
  name: Bi
  donor: Bi
  fundId: string
  start: string
  end: string
  controlMode: ControlMode
  tolerancePct: number
  pillars: Pillar[]
}

export type StepStatus = 'waiting' | 'pending' | 'approved' | 'rejected'

export interface ApprovalStep {
  role: RoleKey
  status: StepStatus
  by?: string
  at?: string
  note?: string
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface SpendRequest {
  id: string
  code: string
  officeId: string
  projectId: string
  lineId: string
  activityCode?: string
  purpose: Bi
  amount: number
  currency: 'SDG' | 'USD'
  rate: number // SDG per USD at request date
  amountUSD: number
  requesterId: string
  createdAt: string
  status: RequestStatus
  overCeiling: boolean
  ruleId?: string
  steps: ApprovalStep[]
}

export interface Reallocation {
  id: string
  code: string
  projectId: string
  fromLineId: string
  toLineId: string
  amountUSD: number
  reason: Bi
  requesterId: string
  createdAt: string
  status: RequestStatus
  steps: ApprovalStep[]
}

export interface Expense {
  id: string
  activityCode?: string
  lineId: string
  projectId: string
  officeId: string
  requestId?: string
  amountUSD: number
  date: string
  hasTechReport: boolean
}

export interface ApprovalRule {
  id: string
  name: Bi
  minUSD: number
  maxUSD: number | null // null = no upper limit
  appliesTo: 'spend' | 'reallocation'
  officeId: string | null // null = all offices; an office-specific rule wins over a general one
  chain: RoleKey[]
  active: boolean
}

export interface Deadline {
  id: string
  title: Bi
  projectId?: string
  due: string
  notifyDaysBefore: number
  owner: RoleKey
  recurrence?: 'none' | 'monthly' | 'quarterly' | 'yearly'
  done?: boolean
}

export interface ActivityLog {
  id: string
  at: string
  text: Bi
}

// --- Finance ---------------------------------------------------------------

export type AccountType = 'asset' | 'liability' | 'net_assets' | 'revenue' | 'expense'

export interface Account {
  code: string
  parent: string | null
  name: Bi
  type: AccountType
  postable: boolean // headers group accounts; only postable accounts take entries
  currency?: 'SDG' | 'USD' // cash and bank accounts hold a specific currency
  officeId?: string
}

export interface JournalLine {
  account: string
  debit: number // USD
  credit: number // USD
  sdg?: number // original SDG amount (signed: + debit, − credit) for SDG cash/bank accounts
  officeId?: string
  projectId?: string
  lineId?: string
}

export type JournalSource = 'opening' | 'payment' | 'receipt' | 'advance' | 'settlement' | 'fx' | 'transfer' | 'payroll' | 'stock' | 'manual' | 'reversal'

export interface JournalEntry {
  id: string
  no: string
  date: string
  memo: Bi
  source: JournalSource
  ref?: string // voucher / advance number
  lines: JournalLine[]
}

export type PayMethod = 'cash' | 'bank' | 'bankak' | 'advance'

export interface Voucher {
  id: string
  no: string
  kind: 'payment' | 'receipt'
  date: string
  method: PayMethod | 'transfer'
  account: string // cash box or bank account used
  amountUSD: number
  currency: 'SDG' | 'USD'
  amount: number
  rate: number
  party: Bi // payee or payer
  memo: Bi
  officeId: string
  projectId?: string
  lineId?: string
  requestId?: string
  journalId: string
}

export interface Staff {
  id: string
  name: Bi
  officeId: string
  title: Bi
}

export type ActivityType = 'medical_day' | 'clinic' | 'distribution' | 'training' | 'transport' | 'awareness' | 'other'

export interface FieldReport {
  id?: string // live mode: the server's id, used to fetch the photos
  no: string
  submittedAt: string
  doneOn?: string
  beneficiaries: number
  men?: number
  women?: number
  children?: number
  summary: Bi
  issues?: string
  actualUSD?: number
  photos?: string[] // data URLs (compressed)
  lat?: number
  lon?: number
  submittedBy?: string
  via?: 'online' | 'offline' | 'excel'
}

export interface FieldActivity {
  id: string
  code: string
  officeId: string
  projectId: string
  lineId: string
  title: Bi
  date: string // planned date
  type?: ActivityType
  location?: string
  plannedUSD?: number
  createdBy?: string
  inKind?: boolean // funded with in-kind supplies only — no cash spending expected
  report?: FieldReport
}

export interface OutboxItem {
  id: string
  activityId: string
  report: FieldReport
  savedAt: string
  userId?: string // live mode: whose report it is, so another person signing in on the same device never sends it
  error?: string // live mode: the server refused it; it stays here for the person to see and is not retried automatically
}

export interface SettlementItem {
  description: string
  receiptNo: string
  amountUSD: number
}

export interface Advance {
  id: string
  no: string
  staffId: string
  holderName?: string // who holds the cash (live mode: the name given when it was issued)
  officeId: string
  projectId: string
  lineId: string
  activityCode: string
  requestId?: string
  amountUSD: number
  issuedAt: string
  dueAt: string
  status: 'open' | 'settled'
  settlement?: { at: string; items: SettlementItem[]; returnedUSD: number; reimbursedUSD: number; reportNo: string }
}

export interface RateEntry {
  date: string
  rate: number // SDG per USD
  source: Bi
}

export interface MonthClose {
  officeId: string
  cashCounted: boolean
  closedAt?: string
  closedBy?: string
}

// --- Notifications -----------------------------------------------------------

export type NotifEvent =
  | 'approval_waiting'
  | 'request_stale'
  | 'request_decided'
  | 'deadline_near'
  | 'deadline_overdue'
  | 'advance_overdue'
  | 'report_overdue'
  | 'line_threshold'
  | 'spend_no_report'
  | 'month_close'
  | 'low_stock'

export type Channel = 'email' | 'whatsapp' | 'sms'

export interface NotifRule {
  id: string
  event: NotifEvent
  name: Bi
  threshold?: number // hours, days or percent depending on the event
  recipients: { concerned: boolean; roles: string[]; users: string[] } // concerned = the person the event is about (approver, requester, owner…)
  channels: { inapp: boolean } & Record<Channel, boolean>
  enabled: boolean
}

export interface AppNotification {
  id: string
  key: string // de-duplication key
  ruleId: string
  event: NotifEvent
  severity: 'info' | 'warn' | 'critical'
  title: Bi
  body: Bi
  link: string
  createdAt: string
  userIds: string[]
  readBy: string[]
}

export interface Delivery {
  id: string
  at: string
  notificationId?: string
  channel: Channel
  to: string
  toName?: Bi
  subject: string
  status: 'sent' | 'failed' | 'skipped'
  reason?: Bi
}

export interface ChannelTest {
  at: string
  ok: boolean
  message: Bi
}

export interface ChannelConfig {
  email: {
    enabled: boolean
    provider: 'microsoft365' | 'google' | 'smtp' | 'sendgrid'
    host: string
    port: number
    security: 'starttls' | 'ssl' | 'none'
    username: string
    password: string
    fromName: string
    fromAddress: string
    replyTo: string
    lastTest?: ChannelTest
  }
  whatsapp: {
    enabled: boolean
    mode: 'cloud_api' | 'click_to_chat'
    phoneNumberId: string
    businessAccountId: string
    accessToken: string
    senderNumber: string
    templateName: string
    templateLanguage: 'ar' | 'en'
    lastTest?: ChannelTest
  }
  sms: {
    enabled: boolean
    provider: 'twilio' | 'http'
    accountSid: string
    authToken: string
    fromNumber: string
    apiUrl: string
    apiKey: string
    senderId: string
    lastTest?: ChannelTest
  }
}

// --- Reports -------------------------------------------------------------------

export interface ReportDelivery {
  to: string[]
  cc: string[]
  subject: Bi
  body: Bi
}

export interface ReportSettings {
  hq: ReportDelivery & { requireApproval: boolean; approverRole: string; autoSendDay: number | null; includeSections: Record<string, boolean> }
  donor: Record<string, ReportDelivery> // per project
}

export interface HqDraft {
  period: string // YYYY-MM
  summary?: Bi
  challenges?: Bi
  plan?: Bi
  status: 'draft' | 'approved' | 'sent'
  approvedBy?: string
  approvedAt?: string
}

export interface SentReport {
  id: string
  kind: 'hq' | 'donor'
  title: Bi
  period: string
  projectId?: string
  to: string[]
  cc: string[]
  subject: string
  fileName: string
  sizeKB: number
  at: string
  by: string
}

// --- Supply chain & logistics ------------------------------------------------

export type ItemCategory = 'nutrition' | 'medicine' | 'medical_supply' | 'equipment'

export interface Item {
  id: string
  code: string
  name: Bi
  unit: Bi
  category: ItemCategory
  unitValueUSD: number
  min: number // minimum level per store; below it triggers an alert
  active?: boolean
}

export interface StockLevel {
  itemId: string
  officeId: string
  qty: number
}

export type MoveKind = 'receipt' | 'issue' | 'transfer_out' | 'transfer_in' | 'loss'

export interface StockMove {
  id: string
  no: string
  kind: MoveKind
  date: string
  itemId: string
  officeId: string
  qty: number // always positive; the kind gives the direction
  valueUSD: number
  ref?: string // shipment, activity or receipt number
  source?: Bi // donor or sender for receipts
  activityId?: string
  expiry?: string
  by?: string
}

export interface ShipmentLine {
  itemId: string
  qty: number
  received?: number
}

export interface Shipment {
  id: string
  no: string
  fromOfficeId: string
  toOfficeId: string
  lines: ShipmentLine[]
  vehicleId?: string
  driver?: string
  status: 'preparing' | 'in_transit' | 'delivered'
  createdAt: string
  departedAt?: string
  deliveredAt?: string
  receivedBy?: string
  note?: string
}

export interface FuelLog {
  id: string
  date: string
  liters: number
  costSDG: number
  odometer: number
  officeId: string
}

export interface Vehicle {
  id: string
  plate: string
  model: Bi
  kind: 'pickup' | 'suv' | 'truck' | 'ambulance'
  officeId: string
  driver: Bi
  status: 'available' | 'on_trip' | 'maintenance'
  odometer: number
  fuel: FuelLog[]
  nextServiceKm: number
}

// --- Human resources & beneficiaries -------------------------------------------

export type Department = 'medical' | 'field' | 'finance' | 'admin' | 'supply' | 'logistics'
export type Contract = 'permanent' | 'fixed' | 'daily' | 'volunteer'

export interface Allocation {
  projectId: string
  lineId: string
  pct: number
}

export interface Employee {
  id: string
  no: string
  name: Bi
  officeId: string
  position: Bi
  department: Department
  contract: Contract
  startDate: string
  endDate?: string
  salarySDG: number // monthly gross
  phone?: string
  status: 'active' | 'on_leave' | 'ended'
  userId?: string
  allocations: Allocation[] // share of salary charged to project lines
  leaveBalance: number // annual leave days left
}

export interface LeaveRequest {
  id: string
  employeeId: string
  type: 'annual' | 'sick' | 'emergency' | 'unpaid'
  from: string
  to: string
  days: number
  note?: string
  status: 'pending' | 'approved' | 'rejected'
  decidedBy?: string
  createdAt: string
}

export interface PayrollRun {
  period: string // YYYY-MM
  postedAt: string
  postedBy: string
  rate: number
  totalSDG: number
  journalId: string
}

export type ServiceType = 'consultation' | 'surgery' | 'medicines' | 'nutrition' | 'vaccination' | 'referral' | 'maternal'

export interface Service {
  id: string
  date: string
  type: ServiceType
  activityId?: string
  officeId: string
  note?: string
}

export interface Beneficiary {
  id: string
  no: string
  name: Bi
  gender: 'm' | 'f'
  birthYear: number
  officeId: string
  locality: string
  displaced: boolean
  phone?: string
  registeredAt: string
  registeredBy?: string
  services: Service[]
  /** Live mode: the register list carries only a count and the latest service; the full history is opened on demand. */
  serviceCount?: number
  lastService?: { type: ServiceType; date: string }
}
