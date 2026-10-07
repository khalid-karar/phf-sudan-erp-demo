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
