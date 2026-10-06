// Domain model for the demo. Shaped like the future backend API so the mock layer can be swapped out.

export type Lang = 'ar' | 'en'
export type Bi = { ar: string; en: string }

export type RoleKey = 'field_officer' | 'supervisor' | 'finance_manager' | 'executive_director'

export interface User {
  id: string
  name: Bi
  role: RoleKey
  officeId: string
}

export interface Office {
  id: string
  name: Bi
  state: Bi
  lat: number
  lon: number
  isHQ?: boolean
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

export type JournalSource = 'opening' | 'payment' | 'receipt' | 'advance' | 'settlement' | 'fx' | 'transfer'

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

export interface FieldActivity {
  id: string
  code: string
  officeId: string
  projectId: string
  lineId: string
  title: Bi
  date: string
  report?: { no: string; submittedAt: string; beneficiaries: number; summary: Bi }
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
