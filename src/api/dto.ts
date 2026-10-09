// The shapes the API sends (only the fields the app reads). Money arrives as exact decimal strings.
export type D = string // a decimal such as "1234.50"

export interface RoleDto {
  id: string
  nameAr: string
  nameEn: string
  descAr: string
  descEn: string
  permissions: Record<string, 'none' | 'view' | 'edit' | 'manage'>
  scope: 'office' | 'all'
  canApprove: boolean
  system: boolean
}
export interface MeDto {
  id: string
  email: string
  nameAr: string
  nameEn: string
  officeId: string
  mustChangePassword: boolean
  donorId?: string | null
  role: { id: string; nameAr: string; nameEn: string; scope: 'office' | 'all'; canApprove: boolean; permissions: Record<string, 'none' | 'view' | 'edit' | 'manage'> }
}
export interface OrgDto {
  nameAr: string
  nameEn: string
  shortNameAr: string
  shortNameEn: string
  hqNameAr: string
  hqNameEn: string
  logoUrl: string | null
  baseCurrency: string
  localCurrency: string
  fiscalYearStartMonth: number
  defaultLang: string
  payrollDeductionPct: D
}
export interface OfficeDto {
  id: string
  nameAr: string
  nameEn: string
  stateAr: string
  stateEn: string
  type: 'hq' | 'office' | 'warehouse'
  lat: number | null
  lon: number | null
  phone: string | null
  managerId: string | null
  active: boolean
}
export interface UserDto {
  id: string
  email: string
  nameAr: string
  nameEn: string
  phone?: string | null
  roleId: string
  officeId: string
  active: boolean
}
export interface UsageDto {
  original: D
  ceiling: D
  spent: D
  inKind: D
  committed: D
  pending: D
  available: D
}
export interface LineDto {
  id: string
  code: string
  nameAr: string
  nameEn: string
  ceilingUsd: D
  expenseAccountCode: string | null
  usage: UsageDto
}
export interface PillarDto {
  id: string
  code: string
  nameAr: string
  nameEn: string
  ceilingUsd: D
  usage: UsageDto
  lines: LineDto[]
}
export interface ProjectDto {
  id: string
  code: string
  nameAr: string
  nameEn: string
  donorAr: string
  donorEn: string
  fundId: string | null
  startDate: string
  endDate: string
  ceilingUsd: D
  controlMode: 'hard' | 'soft'
  tolerancePct: D
  active: boolean
  usage: UsageDto
  pillars: PillarDto[]
}
export interface StepDto {
  seq: number
  roleId: string
  status: 'waiting' | 'pending' | 'approved' | 'rejected' | 'skipped'
  byId: string | null
  at: string | null
  note: string | null
}
export interface RequestDto {
  id: string
  code: string
  officeId: string
  projectId: string
  lineId: string
  activityId: string | null
  activityCode?: string | null
  purpose: string
  amount: D
  currency: 'SDG' | 'USD'
  rate: D
  amountUsd: D
  overCeiling: boolean
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled'
  ruleId: string | null
  requesterId: string
  createdAt: string
  decidedAt: string | null
  steps: StepDto[]
}
export interface ReallocationDto {
  id: string
  code: string
  projectId: string
  fromLineId: string
  toLineId: string
  amountUsd: D
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled'
  requesterId: string
  createdAt: string
  steps: StepDto[]
}
export interface RuleDto {
  id: string
  nameAr: string
  nameEn: string
  kind: 'spend' | 'reallocation'
  minUsd: D
  maxUsd: D | null
  officeId: string | null
  chain: string[]
  active: boolean
}
export interface ExpenseDto {
  id: string
  date: string
  lineId: string
  projectId: string
  officeId: string
  amountUsd: D
  activityCode: string | null
  requestId: string | null
  hasTechReport: boolean
}
export interface FieldReportDto {
  id: string
  no: string
  doneOn: string | null
  beneficiaries: number
  men: number | null
  women: number | null
  children: number | null
  summary: string
  issues: string | null
  actualUsd: D | null
  lat: number | null
  lon: number | null
  via: 'online' | 'offline' | 'excel'
  submittedById: string | null
  submittedAt: string
}
export interface ActivityDto {
  id: string
  code: string
  officeId: string
  projectId: string
  lineId: string
  titleAr: string
  titleEn: string
  type: string
  plannedDate: string
  location: string | null
  plannedUsd: D | null
  inKind: boolean
  createdById: string | null
  report: FieldReportDto | null
}
export interface AccountDto {
  code: string
  parentCode: string | null
  nameAr: string
  nameEn: string
  type: 'asset' | 'liability' | 'net_assets' | 'revenue' | 'expense'
  postable: boolean
  currency: 'SDG' | 'USD'
  officeId: string | null
  active: boolean
}
export interface JournalLineDto {
  accountCode: string
  debit: D
  credit: D
  sdg: D | null
  officeId: string
  projectId: string | null
  budgetLineId: string | null
}
export interface JournalDto {
  id: string
  no: string
  date: string
  memo: string
  source: string
  ref: string | null
  lines: JournalLineDto[]
}
export interface VoucherDto {
  id: string
  no: string
  kind: 'payment' | 'receipt'
  date: string
  method: string
  accountCode: string
  currency: 'SDG' | 'USD'
  amount: D
  rate: D
  amountUsd: D
  party: string
  memo: string
  officeId: string
  projectId: string | null
  lineId: string | null
  requestId: string | null
  journalEntryId: string
}
export interface AdvanceDto {
  id: string
  no: string
  holderName: string
  holderUserId: string | null
  officeId: string
  projectId: string
  lineId: string
  requestId: string | null
  amountUsd: D
  issuedAt: string
  dueAt: string
  status: 'open' | 'settled'
  settledAt: string | null
  spentUsd: D | null
  returnedUsd: D | null
  reimbursedUsd: D | null
  activityCode: string | null
  fieldReportNo: string | null
  items?: { description: string; receiptNo: string | null; amount: D }[]
}
export interface RateDto {
  date: string
  rate: D
  source: string
}
export interface CloseRowDto {
  officeId: string
  closed: boolean
  closedAt: string | null
  checks: { cashCounted: boolean }
}
export interface ItemDto {
  id: string
  code: string
  nameAr: string
  nameEn: string
  unitAr: string
  unitEn: string
  category: 'nutrition' | 'medicine' | 'medical_supply' | 'equipment'
  unitValue: D
  minQty: number
  active: boolean
}
export interface StockDto {
  itemId: string
  officeId: string
  qty: number
}
export interface MoveDto {
  id: string
  no: string
  kind: 'receipt' | 'issue' | 'transfer_out' | 'transfer_in' | 'loss'
  date: string
  itemId: string
  officeId: string
  qty: number
  valueUsd: D
  ref: string | null
  source: string | null
  activityId: string | null
  expiry: string | null
  createdById: string | null
}
export interface ShipmentDto {
  id: string
  no: string
  fromOfficeId: string
  toOfficeId: string
  vehicleId: string | null
  driver: string | null
  status: 'preparing' | 'in_transit' | 'delivered'
  note: string | null
  createdAt: string
  departedAt: string | null
  deliveredAt: string | null
  receivedById: string | null
  lines: { itemId: string; qty: number; received: number | null }[]
}
export interface VehicleDto {
  id: string
  plate: string
  modelAr: string
  modelEn: string
  kind: 'pickup' | 'suv' | 'truck' | 'ambulance'
  officeId: string
  driver: string | null
  status: 'available' | 'on_trip' | 'maintenance'
  odometer: number
  nextServiceKm: number
}
export interface FuelDto {
  id: string
  date: string
  liters: D
  costSdg: D
  odometer: number
  officeId: string
}
export interface AllocationDto {
  projectId: string
  lineId: string
  pct: D | number
}
export interface EmployeeDto {
  id: string
  no: string
  nameAr: string
  nameEn: string
  officeId: string
  positionAr: string
  positionEn: string
  department: 'medical' | 'field' | 'finance' | 'admin' | 'supply' | 'logistics'
  contract: 'permanent' | 'fixed' | 'daily' | 'volunteer'
  startDate: string
  endDate: string | null
  salarySdg: D
  phone: string | null
  status: 'active' | 'ended'
  userId: string | null
  leaveBalance: number
  allocations: AllocationDto[]
}
export interface LeaveDto {
  leave: { id: string; employeeId: string; type: 'annual' | 'sick' | 'emergency' | 'unpaid'; fromDate: string; toDate: string; days: number; note: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; decidedById: string | null; createdAt: string }
}
export interface PayrollDto {
  id: string
  period: string
  status: 'posted' | 'voided'
  rate: D
  totalSdg: D
  journalEntryId: string
  postedById: string | null
  postedAt: string
}
export interface PatientDto {
  id: string
  no: string
  nameAr: string
  nameEn: string
  gender: 'm' | 'f'
  birthYear: number
  officeId: string
  locality: string | null
  displaced: boolean
  phone: string | null
  registeredAt: string
  registeredById: string | null
}
export interface DeadlineDto {
  id: string
  titleAr: string
  titleEn: string
  projectId: string | null
  due: string
  notifyDaysBefore: number
  ownerRoleId: string
  recurrence: 'none' | 'monthly' | 'quarterly' | 'yearly'
  done: boolean
}
export interface NotifRuleDto {
  id: string
  event: string
  nameAr: string
  nameEn: string
  threshold: number | null
  recipients: { concerned: boolean; roles: string[]; users: string[] }
  channels: { inapp: boolean; email: boolean; whatsapp: boolean; sms: boolean }
  enabled: boolean
}
export interface InboxDto {
  id: string
  event: string
  severity: 'info' | 'warn' | 'critical'
  titleAr: string
  titleEn: string
  bodyAr: string
  bodyEn: string
  link: string | null
  createdAt: string
  read: boolean
}
export interface DeliveryDto {
  id: string
  createdAt: string
  notificationId: string | null
  channel: 'email' | 'whatsapp' | 'sms'
  toAddress: string
  subject: string
  status: 'queued' | 'sent' | 'failed' | 'skipped'
  error: string | null
}
export interface Bi {
  ar: string
  en: string
}
export interface SentReportDto {
  id: string
  kind: 'hq' | 'donor'
  period: string
  projectId: string | null
  toAddresses: string[]
  ccAddresses: string[]
  subject: string
  sentById: string | null
  sentAt: string
}
