// PHF Sudan ERP — core schema: organisation, access, budgets, approvals, field work, ledger.
// Money is numeric (exact): USD numeric(18,2), SDG numeric(20,2), rates numeric(14,4).
// Drizzle returns numerics as strings; services convert them with lib/money.ts.
// Ledger integrity (balanced entries, immutable lines, closed periods) is enforced by
// database triggers in migrations/0001_ledger_guards.sql, not only by application code.
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { createId } from '../lib/id'

const id = () => text('id').primaryKey().$defaultFn(createId)
const usd = (name: string) => numeric(name, { precision: 18, scale: 2 })
const sdg = (name: string) => numeric(name, { precision: 20, scale: 2 })
const rate = (name: string) => numeric(name, { precision: 14, scale: 4 })
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()

// ─── Organisation & access ───────────────────────────────────────────────────

export const orgSettings = pgTable('org_settings', {
  id: integer('id').primaryKey().default(1),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  shortNameAr: text('short_name_ar').notNull(),
  shortNameEn: text('short_name_en').notNull(),
  hqNameAr: text('hq_name_ar').notNull(),
  hqNameEn: text('hq_name_en').notNull(),
  logoUrl: text('logo_url'),
  baseCurrency: text('base_currency').notNull().default('USD'),
  localCurrency: text('local_currency').notNull().default('SDG'),
  fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
  defaultLang: text('default_lang').notNull().default('ar'),
  payrollDeductionPct: numeric('payroll_deduction_pct', { precision: 5, scale: 2 }).notNull().default('8.00'), // employee social insurance withheld from salaries
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const officeType = pgEnum('office_type', ['hq', 'office', 'warehouse'])

export const offices = pgTable('offices', {
  id: text('id').primaryKey(), // short code, e.g. "ksl"
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  stateAr: text('state_ar').notNull(),
  stateEn: text('state_en').notNull(),
  type: officeType('type').notNull().default('office'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  phone: text('phone'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const dataScope = pgEnum('data_scope', ['office', 'all'])

/** permissions: { [module]: "none" | "view" | "edit" | "manage" } */
export const roles = pgTable('roles', {
  id: text('id').primaryKey(), // e.g. "finance_manager"
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  descAr: text('desc_ar').notNull().default(''),
  descEn: text('desc_en').notNull().default(''),
  permissions: jsonb('permissions').$type<Record<string, 'none' | 'view' | 'edit' | 'manage'>>().notNull(),
  scope: dataScope('scope').notNull().default('office'),
  canApprove: boolean('can_approve').notNull().default(false),
  system: boolean('system').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  roleId: text('role_id').notNull().references(() => roles.id),
  officeId: text('office_id').notNull().references(() => offices.id),
  active: boolean('active').notNull().default(true),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    family: text('family').notNull(), // reuse of a rotated token revokes the whole family
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId), index('refresh_tokens_family_idx').on(t.family)],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: createdAt(),
    userId: text('user_id'),
    action: text('action').notNull(), // e.g. request.approve, voucher.pay, user.create
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    data: jsonb('data'),
    ip: text('ip'),
  },
  (t) => [index('audit_entity_idx').on(t.entity, t.entityId), index('audit_user_idx').on(t.userId, t.at)],
)

/** Gapless document numbers (SR-0001, PV-0001, JE-0001 …), incremented under a row lock. */
export const docCounters = pgTable('doc_counters', {
  key: text('key').primaryKey(),
  next: integer('next').notNull().default(1),
})

// ─── Funds, projects & budgets ───────────────────────────────────────────────

export const fundType = pgEnum('fund_type', ['cash', 'inkind'])
export const controlMode = pgEnum('control_mode', ['hard', 'soft'])

export const funds = pgTable('funds', {
  id: text('id').primaryKey(),
  type: fundType('type').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  donorAr: text('donor_ar').notNull(),
  donorEn: text('donor_en').notNull(),
})

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  donorAr: text('donor_ar').notNull(),
  donorEn: text('donor_en').notNull(),
  fundId: text('fund_id').references(() => funds.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  ceilingUsd: usd('ceiling_usd').notNull(),
  /** hard: anything over a ceiling is blocked. soft: up to tolerance_pct over, with the Executive Director added. */
  controlMode: controlMode('control_mode').notNull().default('hard'),
  tolerancePct: numeric('tolerance_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const pillars = pgTable(
  'pillars',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    ceilingUsd: usd('ceiling_usd').notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [uniqueIndex('pillars_project_code').on(t.projectId, t.code)],
)

// ─── Ledger accounts (needed by budget lines) ────────────────────────────────

export const accountType = pgEnum('account_type', ['asset', 'liability', 'net_assets', 'revenue', 'expense'])
export const currency = pgEnum('currency', ['USD', 'SDG'])

export const accounts = pgTable('accounts', {
  code: text('code').primaryKey(),
  parentCode: text('parent_code'),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  type: accountType('type').notNull(),
  postable: boolean('postable').notNull().default(true), // header accounts only group others
  currency: currency('currency').notNull().default('USD'), // SDG for cash boxes and SDG banks
  officeId: text('office_id').references(() => offices.id),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const budgetLines = pgTable(
  'budget_lines',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    pillarId: text('pillar_id').notNull().references(() => pillars.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    ceilingUsd: usd('ceiling_usd').notNull(),
    expenseAccountCode: text('expense_account_code').references(() => accounts.code), // charged when the line is spent
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [uniqueIndex('budget_lines_project_code').on(t.projectId, t.code), index('budget_lines_pillar_idx').on(t.pillarId)],
)

// ─── Approvals ───────────────────────────────────────────────────────────────

export const approvalKind = pgEnum('approval_kind', ['spend', 'reallocation'])
export const requestStatus = pgEnum('request_status', ['pending', 'approved', 'rejected', 'paid', 'cancelled'])
export const stepStatus = pgEnum('step_status', ['waiting', 'pending', 'approved', 'rejected', 'skipped'])

export const approvalRules = pgTable('approval_rules', {
  id: id(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  kind: approvalKind('kind').notNull(),
  minUsd: usd('min_usd').notNull(),
  maxUsd: usd('max_usd'), // null = no upper limit; the band is [min, max)
  officeId: text('office_id').references(() => offices.id), // null = every office; an office rule wins
  chain: text('chain').array().notNull(), // role ids, in order
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

// ─── Field work ──────────────────────────────────────────────────────────────

export const activityType = pgEnum('activity_type', ['medical_day', 'clinic', 'distribution', 'training', 'transport', 'awareness', 'other'])
export const reportChannel = pgEnum('report_channel', ['online', 'offline', 'excel'])

export const activities = pgTable(
  'activities',
  {
    id: id(),
    code: text('code').notNull().unique(),
    officeId: text('office_id').notNull().references(() => offices.id),
    projectId: text('project_id').notNull().references(() => projects.id),
    lineId: text('line_id').notNull().references(() => budgetLines.id),
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull(),
    type: activityType('type').notNull().default('other'),
    plannedDate: date('planned_date').notNull(),
    location: text('location'),
    plannedUsd: usd('planned_usd'),
    inKind: boolean('in_kind').notNull().default(false), // funded with supplies only; no cash spending expected
    createdById: text('created_by_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('activities_office_idx').on(t.officeId)],
)

export const fieldReports = pgTable('field_reports', {
  id: id(),
  no: text('no').notNull().unique(),
  activityId: text('activity_id').notNull().unique().references(() => activities.id),
  clientId: text('client_id').unique(), // idempotency key from the device: a re-sent offline report is not duplicated
  doneOn: date('done_on'),
  beneficiaries: integer('beneficiaries').notNull(),
  men: integer('men'),
  women: integer('women'),
  children: integer('children'),
  summary: text('summary').notNull(),
  issues: text('issues'),
  actualUsd: usd('actual_usd'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  via: reportChannel('via').notNull().default('online'),
  submittedById: text('submitted_by_id').references(() => users.id),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
})

// ─── Requests & reallocations ────────────────────────────────────────────────

export const spendRequests = pgTable(
  'spend_requests',
  {
    id: id(),
    code: text('code').notNull().unique(),
    officeId: text('office_id').notNull().references(() => offices.id),
    projectId: text('project_id').notNull().references(() => projects.id),
    lineId: text('line_id').notNull().references(() => budgetLines.id),
    activityId: text('activity_id').references(() => activities.id),
    purpose: text('purpose').notNull(),
    amount: sdg('amount').notNull(),
    currency: currency('currency').notNull(),
    rate: rate('rate').notNull(), // SDG per USD on the request date
    amountUsd: usd('amount_usd').notNull(),
    overCeiling: boolean('over_ceiling').notNull().default(false),
    status: requestStatus('status').notNull().default('pending'),
    ruleId: text('rule_id').references(() => approvalRules.id),
    requesterId: text('requester_id').notNull().references(() => users.id),
    createdAt: createdAt(),
    decidedAt: ts('decided_at'),
  },
  (t) => [index('spend_requests_line_status').on(t.lineId, t.status), index('spend_requests_office_status').on(t.officeId, t.status), check('spend_requests_amount_pos', sql`${t.amountUsd} > 0`)],
)

export const reallocations = pgTable(
  'reallocations',
  {
    id: id(),
    code: text('code').notNull().unique(),
    projectId: text('project_id').notNull().references(() => projects.id),
    fromLineId: text('from_line_id').notNull().references(() => budgetLines.id),
    toLineId: text('to_line_id').notNull().references(() => budgetLines.id),
    amountUsd: usd('amount_usd').notNull(),
    reason: text('reason').notNull(),
    status: requestStatus('status').notNull().default('pending'),
    requesterId: text('requester_id').notNull().references(() => users.id),
    createdAt: createdAt(),
    decidedAt: ts('decided_at'),
  },
  (t) => [check('reallocations_amount_pos', sql`${t.amountUsd} > 0`), check('reallocations_distinct_lines', sql`${t.fromLineId} <> ${t.toLineId}`)],
)

export const approvalSteps = pgTable(
  'approval_steps',
  {
    id: id(),
    requestId: text('request_id').references(() => spendRequests.id, { onDelete: 'cascade' }),
    reallocationId: text('reallocation_id').references(() => reallocations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    roleId: text('role_id').notNull().references(() => roles.id),
    status: stepStatus('status').notNull(),
    byId: text('by_id').references(() => users.id),
    at: ts('at'),
    note: text('note'),
  },
  (t) => [
    uniqueIndex('approval_steps_request_seq').on(t.requestId, t.seq),
    uniqueIndex('approval_steps_realloc_seq').on(t.reallocationId, t.seq),
    index('approval_steps_role_status').on(t.roleId, t.status),
    check('approval_steps_one_parent', sql`(${t.requestId} is null) <> (${t.reallocationId} is null)`),
  ],
)

// ─── Ledger ──────────────────────────────────────────────────────────────────

export const journalSource = pgEnum('journal_source', ['opening', 'payment', 'receipt', 'advance', 'settlement', 'fx', 'transfer', 'payroll', 'stock', 'manual', 'reversal'])

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: id(),
    no: text('no').notNull().unique(),
    date: date('date').notNull(),
    period: text('period').notNull(), // YYYY-MM, set from date by trigger
    memo: text('memo').notNull(),
    source: journalSource('source').notNull(),
    ref: text('ref'),
    reversalOfId: text('reversal_of_id').unique(),
    createdById: text('created_by_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('journal_entries_period').on(t.period)],
)

export const journalLines = pgTable(
  'journal_lines',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entryId: text('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'restrict' }),
    accountCode: text('account_code').notNull().references(() => accounts.code),
    debit: usd('debit').notNull().default('0'),
    credit: usd('credit').notNull().default('0'),
    sdg: sdg('sdg'), // signed original SDG amount, for SDG accounts
    officeId: text('office_id').notNull().references(() => offices.id), // HQ for organisation-wide lines
    projectId: text('project_id').references(() => projects.id),
    budgetLineId: text('budget_line_id').references(() => budgetLines.id),
    activityId: text('activity_id').references(() => activities.id),
    memo: text('memo'),
  },
  (t) => [
    index('journal_lines_account').on(t.accountCode),
    index('journal_lines_budget_line').on(t.budgetLineId),
    index('journal_lines_entry').on(t.entryId),
    check('journal_lines_non_negative', sql`${t.debit} >= 0 and ${t.credit} >= 0`),
    check('journal_lines_one_side', sql`(${t.debit} = 0) <> (${t.credit} = 0)`),
  ],
)

export const exchangeRates = pgTable('exchange_rates', {
  date: date('date').primaryKey(),
  rate: rate('rate').notNull(), // SDG per USD
  source: text('source').notNull(),
  createdAt: createdAt(),
})

/** Month close per office. A closed (period, office) rejects new journal lines for that office. */
export const periodCloses = pgTable(
  'period_closes',
  {
    period: text('period').notNull(),
    officeId: text('office_id').notNull().references(() => offices.id),
    cashCounted: boolean('cash_counted').notNull().default(false),
    closedAt: ts('closed_at'),
    closedById: text('closed_by_id').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.period, t.officeId] })],
)

export const voucherKind = pgEnum('voucher_kind', ['payment', 'receipt'])
export const payMethod = pgEnum('pay_method', ['cash', 'bank', 'bankak', 'advance', 'transfer'])

export const vouchers = pgTable('vouchers', {
  id: id(),
  no: text('no').notNull().unique(),
  kind: voucherKind('kind').notNull(),
  date: date('date').notNull(),
  method: payMethod('method').notNull(),
  accountCode: text('account_code').notNull().references(() => accounts.code),
  currency: currency('currency').notNull(),
  amount: sdg('amount').notNull(),
  rate: rate('rate').notNull(),
  amountUsd: usd('amount_usd').notNull(),
  party: text('party').notNull(),
  memo: text('memo').notNull(),
  officeId: text('office_id').notNull().references(() => offices.id),
  projectId: text('project_id').references(() => projects.id),
  lineId: text('line_id').references(() => budgetLines.id),
  requestId: text('request_id').unique().references(() => spendRequests.id),
  journalEntryId: text('journal_entry_id').notNull().unique().references(() => journalEntries.id),
  createdById: text('created_by_id').references(() => users.id),
  createdAt: createdAt(),
})

export const advanceStatus = pgEnum('advance_status', ['open', 'settled'])

export const advances = pgTable(
  'advances',
  {
    id: id(),
    no: text('no').notNull().unique(),
    holderName: text('holder_name').notNull(),
    holderUserId: text('holder_user_id').references(() => users.id),
    officeId: text('office_id').notNull().references(() => offices.id),
    projectId: text('project_id').notNull().references(() => projects.id),
    lineId: text('line_id').notNull().references(() => budgetLines.id),
    activityId: text('activity_id').references(() => activities.id),
    requestId: text('request_id').unique().references(() => spendRequests.id),
    amountUsd: usd('amount_usd').notNull(), // book value of the advance
    currency: currency('currency').notNull().default('USD'), // currency the cash was handed out in
    amount: sdg('amount').notNull().default('0'), // amount handed out, in that currency
    issueRate: rate('issue_rate'), // SDG per USD when issued (SDG advances)
    issuedAt: ts('issued_at').notNull().defaultNow(),
    dueAt: date('due_at').notNull(),
    status: advanceStatus('status').notNull().default('open'),
    settledAt: ts('settled_at'),
    spent: sdg('spent'), // receipts, in the advance currency
    spentUsd: usd('spent_usd'),
    returnedUsd: usd('returned_usd'),
    reimbursedUsd: usd('reimbursed_usd'),
    reportId: text('report_id').references(() => fieldReports.id),
    issueEntryId: text('issue_entry_id').references(() => journalEntries.id),
    settleEntryId: text('settle_entry_id').references(() => journalEntries.id),
  },
  (t) => [index('advances_status_line').on(t.status, t.lineId)],
)

export const advanceItems = pgTable('advance_items', {
  id: id(),
  advanceId: text('advance_id').notNull().references(() => advances.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  receiptNo: text('receipt_no'),
  amount: sdg('amount').notNull(), // in the advance currency
})

/**
 * Which account plays each system role, so the chart of accounts stays editable:
 * cash_boxes and banks (parent headers), advances, fx_gain, fx_loss, inventory, inkind_revenue,
 * salaries, payroll_deductions.
 */
export const ledgerAccounts = pgTable('ledger_accounts', {
  key: text('key').primaryKey(),
  accountCode: text('account_code').notNull().references(() => accounts.code),
})

// ─── Supply chain & logistics ────────────────────────────────────────────────
// Stock is tracked per item per store (an office). stock_levels can never go negative (CHECK),
// and every change is a stock_move, so the quantity can always be explained from the history.

export const itemCategory = pgEnum('item_category', ['nutrition', 'medicine', 'medical_supply', 'equipment'])

export const items = pgTable('items', {
  id: id(),
  code: text('code').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  unitAr: text('unit_ar').notNull(),
  unitEn: text('unit_en').notNull(),
  category: itemCategory('category').notNull(),
  unitValue: usd('unit_value').notNull(), // book value per unit, USD
  minQty: integer('min_qty').notNull().default(0), // per store; below it raises an alert
  expenseAccountCode: text('expense_account_code').notNull().references(() => accounts.code), // where an issue (or loss) is expensed
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const stockLevels = pgTable(
  'stock_levels',
  {
    itemId: text('item_id').notNull().references(() => items.id),
    officeId: text('office_id').notNull().references(() => offices.id),
    qty: integer('qty').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.officeId] }), check('stock_levels_non_negative', sql`${t.qty} >= 0`)],
)

export const moveKind = pgEnum('move_kind', ['receipt', 'issue', 'transfer_out', 'transfer_in', 'loss'])

export const stockMoves = pgTable(
  'stock_moves',
  {
    id: id(),
    no: text('no').notNull(),
    kind: moveKind('kind').notNull(),
    date: date('date').notNull(),
    itemId: text('item_id').notNull().references(() => items.id),
    officeId: text('office_id').notNull().references(() => offices.id),
    qty: integer('qty').notNull(), // always positive; kind gives the direction
    valueUsd: usd('value_usd').notNull(),
    ref: text('ref'),
    source: text('source'), // donor / sender for receipts, reason for losses
    activityId: text('activity_id').references(() => activities.id),
    shipmentId: text('shipment_id'),
    expiry: date('expiry'),
    entryId: text('entry_id').references(() => journalEntries.id),
    createdById: text('created_by_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('stock_moves_item_office').on(t.itemId, t.officeId), index('stock_moves_activity').on(t.activityId), check('stock_moves_positive', sql`${t.qty} > 0`)],
)

export const vehicleKind = pgEnum('vehicle_kind', ['pickup', 'suv', 'truck', 'ambulance'])
export const vehicleStatus = pgEnum('vehicle_status', ['available', 'on_trip', 'maintenance'])

export const vehicles = pgTable('vehicles', {
  id: id(),
  plate: text('plate').notNull().unique(),
  modelAr: text('model_ar').notNull(),
  modelEn: text('model_en').notNull(),
  kind: vehicleKind('kind').notNull(),
  officeId: text('office_id').notNull().references(() => offices.id),
  driver: text('driver'),
  status: vehicleStatus('status').notNull().default('available'),
  odometer: integer('odometer').notNull().default(0),
  nextServiceKm: integer('next_service_km'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const fuelLogs = pgTable(
  'fuel_logs',
  {
    id: id(),
    vehicleId: text('vehicle_id').notNull().references(() => vehicles.id),
    date: date('date').notNull(),
    liters: numeric('liters', { precision: 10, scale: 2 }).notNull(),
    costSdg: sdg('cost_sdg').notNull(),
    odometer: integer('odometer').notNull(),
    officeId: text('office_id').notNull().references(() => offices.id),
    createdById: text('created_by_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('fuel_logs_vehicle').on(t.vehicleId, t.date)],
)

export const shipmentStatus = pgEnum('shipment_status', ['preparing', 'in_transit', 'delivered'])

export const shipments = pgTable(
  'shipments',
  {
    id: id(),
    no: text('no').notNull().unique(),
    fromOfficeId: text('from_office_id').notNull().references(() => offices.id),
    toOfficeId: text('to_office_id').notNull().references(() => offices.id),
    vehicleId: text('vehicle_id').references(() => vehicles.id),
    driver: text('driver'),
    status: shipmentStatus('status').notNull().default('preparing'),
    note: text('note'),
    createdById: text('created_by_id').references(() => users.id),
    createdAt: createdAt(),
    departedAt: ts('departed_at'),
    deliveredAt: ts('delivered_at'),
    receivedById: text('received_by_id').references(() => users.id),
    sentEntryId: text('sent_entry_id'),
  },
  (t) => [index('shipments_status').on(t.status), check('shipments_different_offices', sql`${t.fromOfficeId} <> ${t.toOfficeId}`)],
)

export const shipmentLines = pgTable(
  'shipment_lines',
  {
    id: id(),
    shipmentId: text('shipment_id').notNull().references(() => shipments.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull().references(() => items.id),
    qty: integer('qty').notNull(),
    received: integer('received'), // set on delivery; may be less than qty (damage, loss)
  },
  (t) => [uniqueIndex('shipment_lines_unique').on(t.shipmentId, t.itemId), check('shipment_lines_qty', sql`${t.qty} > 0 and (${t.received} is null or (${t.received} >= 0 and ${t.received} <= ${t.qty}))`)],
)

// ─── Human resources & payroll ───────────────────────────────────────────────

export const department = pgEnum('department', ['medical', 'field', 'finance', 'admin', 'supply', 'logistics'])
export const contractType = pgEnum('contract_type', ['permanent', 'fixed', 'daily', 'volunteer'])
export const employeeStatus = pgEnum('employee_status', ['active', 'ended'])

export const employees = pgTable(
  'employees',
  {
    id: id(),
    no: text('no').notNull().unique(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    officeId: text('office_id').notNull().references(() => offices.id),
    positionAr: text('position_ar').notNull(),
    positionEn: text('position_en').notNull(),
    department: department('department').notNull(),
    contract: contractType('contract').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    salarySdg: sdg('salary_sdg').notNull().default('0'), // monthly gross
    phone: text('phone'),
    status: employeeStatus('status').notNull().default('active'),
    userId: text('user_id').unique().references(() => users.id), // the system account, when they have one
    leaveBalance: integer('leave_balance').notNull().default(0), // annual leave days left
    createdAt: createdAt(),
  },
  (t) => [index('employees_office_idx').on(t.officeId), check('employees_salary_non_negative', sql`${t.salarySdg} >= 0`), check('employees_leave_non_negative', sql`${t.leaveBalance} >= 0`)],
)

/** The share (%) of an employee's salary charged to a project budget line. */
export const employeeAllocations = pgTable(
  'employee_allocations',
  {
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull().references(() => projects.id),
    lineId: text('line_id').notNull().references(() => budgetLines.id),
    pct: integer('pct').notNull(),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.lineId] }), check('allocation_pct', sql`${t.pct} between 1 and 100`)],
)

export const leaveType = pgEnum('leave_type', ['annual', 'sick', 'emergency', 'unpaid'])
export const leaveStatus = pgEnum('leave_status', ['pending', 'approved', 'rejected', 'cancelled'])

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    employeeId: text('employee_id').notNull().references(() => employees.id),
    type: leaveType('type').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    days: integer('days').notNull(), // calendar days, inclusive
    note: text('note'),
    status: leaveStatus('status').notNull().default('pending'),
    requestedById: text('requested_by_id').references(() => users.id),
    decidedById: text('decided_by_id').references(() => users.id),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  (t) => [index('leave_employee_idx').on(t.employeeId, t.fromDate), check('leave_dates', sql`${t.toDate} >= ${t.fromDate} and ${t.days} >= 1`)],
)

export const payrollStatus = pgEnum('payroll_status', ['posted', 'voided'])

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: id(),
    period: text('period').notNull(), // YYYY-MM
    date: date('date').notNull(),
    rate: rate('rate').notNull(), // SDG per USD used
    headcount: integer('headcount').notNull(),
    grossSdg: sdg('gross_sdg').notNull(),
    deductionsSdg: sdg('deductions_sdg').notNull(),
    netSdg: sdg('net_sdg').notNull(),
    grossUsd: usd('gross_usd').notNull(),
    accountCode: text('account_code').notNull().references(() => accounts.code), // where the net pay left from
    status: payrollStatus('status').notNull().default('posted'),
    entryId: text('entry_id').notNull().references(() => journalEntries.id),
    voidEntryId: text('void_entry_id').references(() => journalEntries.id),
    postedById: text('posted_by_id').references(() => users.id),
    postedAt: ts('posted_at').notNull().defaultNow(),
    voidedAt: ts('voided_at'),
    voidReason: text('void_reason'),
    detail: jsonb('detail').$type<unknown>().notNull(), // per-employee breakdown as paid
  },
  (t) => [uniqueIndex('payroll_one_posted_per_period').on(t.period).where(sql`${t.status} = 'posted'`)],
)

// ─── Patients (beneficiaries) ────────────────────────────────────────────────
// Personal data: reads and writes go through the "patients" permission and office scope.

export const serviceType = pgEnum('service_type', ['consultation', 'surgery', 'medicines', 'nutrition', 'vaccination', 'referral', 'maternal'])

export const beneficiaries = pgTable(
  'beneficiaries',
  {
    id: id(),
    no: text('no').notNull().unique(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en'),
    nameKey: text('name_key').notNull(), // normalised Arabic + English name, for search and duplicate checks
    gender: text('gender').notNull(), // 'm' | 'f'
    birthYear: integer('birth_year').notNull(),
    officeId: text('office_id').notNull().references(() => offices.id), // where they were registered
    locality: text('locality'),
    displaced: boolean('displaced').notNull().default(false),
    phone: text('phone'),
    phoneDigits: text('phone_digits'), // digits only, for matching
    registeredAt: date('registered_at').notNull(),
    registeredById: text('registered_by_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('beneficiaries_office_idx').on(t.officeId),
    index('beneficiaries_birth_gender_idx').on(t.birthYear, t.gender),
    index('beneficiaries_phone_idx').on(t.phoneDigits),
    check('beneficiaries_gender', sql`${t.gender} in ('m', 'f')`),
    check('beneficiaries_birth_year', sql`${t.birthYear} between 1900 and 2100`),
  ],
)

export const beneficiaryServices = pgTable(
  'beneficiary_services',
  {
    id: id(),
    beneficiaryId: text('beneficiary_id').notNull().references(() => beneficiaries.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    type: serviceType('type').notNull(),
    officeId: text('office_id').notNull().references(() => offices.id), // where the service was given
    activityId: text('activity_id').references(() => activities.id),
    note: text('note'),
    createdById: text('created_by_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('services_beneficiary_idx').on(t.beneficiaryId, t.date), index('services_office_date_idx').on(t.officeId, t.date)],
)

// ─── Alerts, deadlines and notifications ─────────────────────────────────────

export const recurrence = pgEnum('recurrence', ['none', 'monthly', 'quarterly', 'yearly'])

export const deadlines = pgTable('deadlines', {
  id: id(),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en').notNull(),
  projectId: text('project_id').references(() => projects.id),
  due: date('due').notNull(),
  notifyDaysBefore: integer('notify_days_before').notNull().default(5), // the "X days before" warning
  ownerRoleId: text('owner_role_id').notNull().references(() => roles.id),
  recurrence: recurrence('recurrence').notNull().default('none'),
  done: boolean('done').notNull().default(false),
  doneAt: ts('done_at'),
  doneById: text('done_by_id').references(() => users.id),
  createdById: text('created_by_id').references(() => users.id),
  createdAt: createdAt(),
})

/** One row per notification rule: what to watch for, who to tell, and by which channels. */
export const notifRules = pgTable('notif_rules', {
  id: id(),
  event: text('event').notNull(), // see notifications/events.ts
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  threshold: integer('threshold'), // hours, days or percent depending on the event
  recipients: jsonb('recipients').$type<{ concerned: boolean; roles: string[]; users: string[] }>().notNull(),
  channels: jsonb('channels').$type<{ inapp: boolean; email: boolean; whatsapp: boolean; sms: boolean }>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: createdAt(),
})

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    key: text('key').notNull().unique(), // the same situation is only ever announced once
    ruleId: text('rule_id').references(() => notifRules.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    severity: text('severity').notNull(), // info | warn | critical
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull(),
    bodyAr: text('body_ar').notNull().default(''),
    bodyEn: text('body_en').notNull().default(''),
    link: text('link'),
    officeId: text('office_id').references(() => offices.id),
    inapp: boolean('inapp').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_created_idx').on(t.createdAt)],
)

export const notificationRecipients = pgTable(
  'notification_recipients',
  {
    notificationId: text('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    readAt: ts('read_at'),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] }), index('notification_recipients_user_idx').on(t.userId, t.readAt)],
)

export const deliveryChannel = pgEnum('delivery_channel', ['email', 'whatsapp', 'sms'])
export const deliveryStatus = pgEnum('delivery_status', ['queued', 'sent', 'failed', 'skipped'])

/** An outgoing message to one person by one channel. A worker sends the queued ones, retrying with a delay. */
export const deliveries = pgTable(
  'deliveries',
  {
    id: id(),
    notificationId: text('notification_id').references(() => notifications.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    channel: deliveryChannel('channel').notNull(),
    toAddr: text('to_addr').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    lang: text('lang').notNull().default('ar'),
    status: deliveryStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: createdAt(),
    sentAt: ts('sent_at'),
  },
  (t) => [index('deliveries_queue_idx').on(t.status, t.nextAttemptAt)],
)

/** Email / WhatsApp / SMS settings. Secrets are encrypted before they are stored (see notifications/secrets.ts). */
export const channelSettings = pgTable('channel_settings', {
  channel: text('channel').primaryKey(), // email | whatsapp | sms
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  lastTest: jsonb('last_test').$type<{ at: string; ok: boolean; message: string } | null>(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// ─── Attachments ─────────────────────────────────────────────────────────────
// Files live on disk (UPLOAD_DIR/<first two hex of sha256>/<sha256>); this table says what each one is and who may see it.

export const attachmentOwner = pgEnum('attachment_owner', ['activity', 'field_report', 'spend_request', 'voucher', 'advance', 'report'])

export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    ownerType: attachmentOwner('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
    officeId: text('office_id').references(() => offices.id), // the owner's office, for scoping (null for organisation-wide records)
    fileName: text('file_name').notNull(),
    mime: text('mime').notNull(), // detected from the file's content, not from what the browser claimed
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    note: text('note'),
    uploadedById: text('uploaded_by_id').references(() => users.id),
    createdAt: createdAt(),
    deletedAt: ts('deleted_at'),
    deletedById: text('deleted_by_id').references(() => users.id),
  },
  (t) => [index('attachments_owner_idx').on(t.ownerType, t.ownerId)],
)
