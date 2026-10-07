// Server JSON → the shapes the screens already use. Amounts become numbers here (screens show whole dollars;
// the server keeps the exact decimals and does every calculation that matters).
import type {
  Account,
  ActivityType,
  Advance,
  ApprovalRule,
  ApprovalStep,
  Beneficiary,
  Bi,
  Deadline,
  Employee,
  Expense,
  FieldActivity,
  FuelLog,
  Item,
  JournalEntry,
  JournalSource,
  LeaveRequest,
  Office,
  OrgSettings,
  PayrollRun,
  Project,
  RateEntry,
  Reallocation,
  Role,
  Shipment,
  SpendRequest,
  StockLevel,
  StockMove,
  User,
  Vehicle,
  Voucher,
  ModuleKey,
  NotifRule,
  NotifEvent,
  AppNotification,
  Delivery,
  Lang,
} from '../data/types'
import { MODULE_KEYS } from '../data/types'
import type * as T from './dto'

export const n = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v))
const bi = (ar: string, en: string): Bi => ({ ar, en })
const opt = <X>(v: X | null | undefined) => (v === null || v === undefined ? undefined : v)

export function mapPermissions(p: Record<string, string>): Role['permissions'] {
  const out = {} as Role['permissions']
  for (const m of MODULE_KEYS) out[m] = ((p[m] as Role['permissions'][ModuleKey]) ?? 'none') as Role['permissions'][ModuleKey]
  return out
}

export const mapRole = (r: T.RoleDto): Role => ({ id: r.id, name: bi(r.nameAr, r.nameEn), description: bi(r.descAr, r.descEn), permissions: mapPermissions(r.permissions), scope: r.scope, canApprove: r.canApprove, system: r.system || undefined })

export const mapOffice = (o: T.OfficeDto): Office => ({
  id: o.id,
  name: bi(o.nameAr, o.nameEn),
  state: bi(o.stateAr, o.stateEn),
  lat: o.lat ?? 0,
  lon: o.lon ?? 0,
  isHQ: o.type === 'hq',
  type: o.type,
  managerId: opt(o.managerId),
  phone: opt(o.phone),
  active: o.active,
})

export const mapUser = (u: T.UserDto): User => ({ id: u.id, name: bi(u.nameAr, u.nameEn), role: u.roleId, officeId: u.officeId, email: u.email, phone: opt(u.phone), active: u.active })

export const mapOrg = (o: T.OrgDto, prev: OrgSettings): OrgSettings => ({
  name: bi(o.nameAr, o.nameEn),
  shortName: bi(o.shortNameAr, o.shortNameEn),
  logo: o.logoUrl ?? prev.logo,
  hqName: bi(o.hqNameAr, o.hqNameEn),
  localCurrency: o.localCurrency,
  baseCurrency: o.baseCurrency,
  fiscalYearStartMonth: o.fiscalYearStartMonth,
  defaultLang: (o.defaultLang === 'en' ? 'en' : 'ar') as Lang,
  weekStartsOn: prev.weekStartsOn,
})

export const mapProject = (p: T.ProjectDto): Project => ({
  id: p.id,
  code: p.code,
  name: bi(p.nameAr, p.nameEn),
  donor: bi(p.donorAr, p.donorEn),
  fundId: p.fundId ?? '',
  start: p.startDate,
  end: p.endDate,
  controlMode: p.controlMode,
  tolerancePct: n(p.tolerancePct),
  pillars: p.pillars.map((pl) => ({
    id: pl.id,
    code: pl.code,
    name: bi(pl.nameAr, pl.nameEn),
    ceilingUSD: n(pl.ceilingUsd),
    lines: pl.lines.map((l) => ({ id: l.id, code: l.code, name: bi(l.nameAr, l.nameEn), ceilingUSD: n(l.ceilingUsd) })),
  })),
})

/** Server-side budget position of every line, so every screen shows the figure the server will enforce. */
export function mapUsage(ps: T.ProjectDto[]) {
  const out: Record<string, { ceiling: number; original: number; spent: number; inKind: number; committed: number; pending: number; available: number }> = {}
  for (const p of ps)
    for (const pl of p.pillars)
      for (const l of pl.lines) {
        const u = l.usage
        out[l.id] = { ceiling: n(u.ceiling), original: n(u.original), spent: n(u.spent), inKind: n(u.inKind), committed: n(u.committed), pending: n(u.pending), available: n(u.available) }
      }
  return out
}

const mapSteps = (steps: T.StepDto[]): ApprovalStep[] =>
  [...steps]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => ({ role: s.roleId, status: (s.status === 'skipped' ? 'approved' : s.status) as ApprovalStep['status'], by: opt(s.byId), at: opt(s.at), note: opt(s.note) }))

export const mapRequest = (r: T.RequestDto, activityCode: (id: string | null) => string | undefined): SpendRequest => ({
  id: r.id,
  code: r.code,
  officeId: r.officeId,
  projectId: r.projectId,
  lineId: r.lineId,
  activityCode: r.activityCode ?? activityCode(r.activityId),
  purpose: bi(r.purpose, r.purpose),
  amount: n(r.amount),
  currency: r.currency,
  rate: n(r.rate),
  amountUSD: n(r.amountUsd),
  requesterId: r.requesterId,
  createdAt: r.createdAt,
  status: (r.status === 'cancelled' ? 'rejected' : r.status) as SpendRequest['status'],
  overCeiling: r.overCeiling,
  ruleId: opt(r.ruleId),
  steps: mapSteps(r.steps),
})

export const mapReallocation = (r: T.ReallocationDto): Reallocation => ({
  id: r.id,
  code: r.code,
  projectId: r.projectId,
  fromLineId: r.fromLineId,
  toLineId: r.toLineId,
  amountUSD: n(r.amountUsd),
  reason: bi(r.reason, r.reason),
  requesterId: r.requesterId,
  createdAt: r.createdAt,
  status: (r.status === 'cancelled' ? 'rejected' : r.status) as Reallocation['status'],
  steps: mapSteps(r.steps),
})

export const mapRule = (r: T.RuleDto): ApprovalRule => ({ id: r.id, name: bi(r.nameAr, r.nameEn), minUSD: n(r.minUsd), maxUSD: r.maxUsd === null ? null : n(r.maxUsd), appliesTo: r.kind, officeId: r.officeId, chain: r.chain, active: r.active })

export const mapExpense = (e: T.ExpenseDto): Expense => ({ id: e.id, activityCode: opt(e.activityCode), lineId: e.lineId, projectId: e.projectId, officeId: e.officeId, requestId: opt(e.requestId), amountUSD: n(e.amountUsd), date: e.date, hasTechReport: e.hasTechReport })

export const mapActivity = (a: T.ActivityDto): FieldActivity => ({
  id: a.id,
  code: a.code,
  officeId: a.officeId,
  projectId: a.projectId,
  lineId: a.lineId,
  title: bi(a.titleAr, a.titleEn),
  date: a.plannedDate,
  type: a.type as ActivityType,
  location: opt(a.location),
  plannedUSD: a.plannedUsd === null ? undefined : n(a.plannedUsd),
  createdBy: opt(a.createdById),
  inKind: a.inKind || undefined,
  report: a.report
    ? {
        no: a.report.no,
        submittedAt: a.report.submittedAt,
        doneOn: opt(a.report.doneOn),
        beneficiaries: a.report.beneficiaries,
        men: opt(a.report.men),
        women: opt(a.report.women),
        children: opt(a.report.children),
        summary: bi(a.report.summary, a.report.summary),
        issues: opt(a.report.issues),
        actualUSD: a.report.actualUsd === null ? undefined : n(a.report.actualUsd),
        lat: opt(a.report.lat),
        lon: opt(a.report.lon),
        submittedBy: opt(a.report.submittedById),
        via: a.report.via,
      }
    : undefined,
})

export const mapAccount = (a: T.AccountDto): Account => ({ code: a.code, parent: a.parentCode, name: bi(a.nameAr, a.nameEn), type: a.type, postable: a.postable, currency: a.currency, officeId: opt(a.officeId) })

export const mapJournal = (e: T.JournalDto): JournalEntry => ({
  id: e.id,
  no: e.no,
  date: e.date,
  memo: bi(e.memo, e.memo),
  source: e.source as JournalSource,
  ref: opt(e.ref),
  lines: e.lines.map((l) => ({ account: l.accountCode, debit: n(l.debit), credit: n(l.credit), sdg: l.sdg === null ? undefined : n(l.sdg), officeId: opt(l.officeId), projectId: opt(l.projectId), lineId: opt(l.budgetLineId) })),
})

export const mapVoucher = (v: T.VoucherDto): Voucher => ({
  id: v.id,
  no: v.no,
  kind: v.kind,
  date: v.date,
  method: v.method as Voucher['method'],
  account: v.accountCode,
  amountUSD: n(v.amountUsd),
  currency: v.currency,
  amount: n(v.amount),
  rate: n(v.rate),
  party: bi(v.party, v.party),
  memo: bi(v.memo, v.memo),
  officeId: v.officeId,
  projectId: opt(v.projectId),
  lineId: opt(v.lineId),
  requestId: opt(v.requestId),
  journalId: v.journalEntryId,
})

export const mapAdvance = (a: T.AdvanceDto): Advance => ({
  id: a.id,
  no: a.no,
  staffId: a.holderUserId ?? `name:${a.holderName}`,
  holderName: a.holderName,
  officeId: a.officeId,
  projectId: a.projectId,
  lineId: a.lineId,
  activityCode: a.activityCode ?? '',
  requestId: opt(a.requestId),
  amountUSD: n(a.amountUsd),
  issuedAt: a.issuedAt,
  dueAt: a.dueAt,
  status: a.status,
  settlement:
    a.status === 'settled' && a.settledAt
      ? { at: a.settledAt, items: (a.items ?? []).map((i) => ({ description: i.description, receiptNo: i.receiptNo ?? '', amountUSD: n(i.amount) })), returnedUSD: n(a.returnedUsd), reimbursedUSD: n(a.reimbursedUsd), reportNo: a.fieldReportNo ?? '' }
      : undefined,
})

export const mapRate = (r: T.RateDto): RateEntry => ({ date: r.date, rate: n(r.rate), source: bi(r.source, r.source) })

export const mapItem = (i: T.ItemDto): Item => ({ id: i.id, code: i.code, name: bi(i.nameAr, i.nameEn), unit: bi(i.unitAr, i.unitEn), category: i.category, unitValueUSD: n(i.unitValue), min: i.minQty, active: i.active })
export const mapStock = (s: T.StockDto): StockLevel => ({ itemId: s.itemId, officeId: s.officeId, qty: s.qty })
export const mapMove = (m: T.MoveDto): StockMove => ({ id: m.id, no: m.no, kind: m.kind, date: m.date, itemId: m.itemId, officeId: m.officeId, qty: m.qty, valueUSD: n(m.valueUsd), ref: opt(m.ref), source: m.source ? bi(m.source, m.source) : undefined, activityId: opt(m.activityId), expiry: opt(m.expiry), by: opt(m.createdById) })
export const mapShipment = (s: T.ShipmentDto): Shipment => ({
  id: s.id,
  no: s.no,
  fromOfficeId: s.fromOfficeId,
  toOfficeId: s.toOfficeId,
  lines: s.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, received: opt(l.received) })),
  vehicleId: opt(s.vehicleId),
  driver: opt(s.driver),
  status: s.status,
  createdAt: s.createdAt,
  departedAt: opt(s.departedAt),
  deliveredAt: opt(s.deliveredAt),
  receivedBy: opt(s.receivedById),
  note: opt(s.note),
})
export const mapFuel = (f: T.FuelDto): FuelLog => ({ id: f.id, date: f.date, liters: n(f.liters), costSDG: n(f.costSdg), odometer: f.odometer, officeId: f.officeId })
export const mapVehicle = (v: T.VehicleDto, fuel: T.FuelDto[]): Vehicle => ({ id: v.id, plate: v.plate, model: bi(v.modelAr, v.modelEn), kind: v.kind, officeId: v.officeId, driver: bi(v.driver ?? '', v.driver ?? ''), status: v.status, odometer: v.odometer, fuel: fuel.map(mapFuel), nextServiceKm: v.nextServiceKm })

export const mapEmployee = (e: T.EmployeeDto): Employee => ({
  id: e.id,
  no: e.no,
  name: bi(e.nameAr, e.nameEn),
  officeId: e.officeId,
  position: bi(e.positionAr, e.positionEn),
  department: e.department,
  contract: e.contract,
  startDate: e.startDate,
  endDate: opt(e.endDate),
  salarySDG: n(e.salarySdg),
  phone: opt(e.phone),
  status: e.status,
  userId: opt(e.userId),
  allocations: e.allocations.map((a) => ({ projectId: a.projectId, lineId: a.lineId, pct: n(a.pct) })),
  leaveBalance: e.leaveBalance,
})
export const mapLeave = (l: T.LeaveDto['leave']): LeaveRequest => ({ id: l.id, employeeId: l.employeeId, type: l.type, from: l.fromDate, to: l.toDate, days: l.days, note: opt(l.note), status: (l.status === 'cancelled' ? 'rejected' : l.status) as LeaveRequest['status'], decidedBy: opt(l.decidedById), createdAt: l.createdAt })
export const mapPayroll = (p: T.PayrollDto): PayrollRun => ({ period: p.period, postedAt: p.postedAt, postedBy: p.postedById ?? '', rate: n(p.rate), totalSDG: n(p.totalSdg), journalId: p.journalEntryId })
export const mapPatient = (p: T.PatientDto): Beneficiary => ({ id: p.id, no: p.no, name: bi(p.nameAr, p.nameEn), gender: p.gender, birthYear: p.birthYear, officeId: p.officeId, locality: p.locality ?? '', displaced: p.displaced, phone: opt(p.phone), registeredAt: p.registeredAt, registeredBy: opt(p.registeredById), services: [] })

export const mapDeadline = (d: T.DeadlineDto): Deadline => ({ id: d.id, title: bi(d.titleAr, d.titleEn), projectId: opt(d.projectId), due: d.due, notifyDaysBefore: d.notifyDaysBefore, owner: d.ownerRoleId, recurrence: d.recurrence, done: d.done })
export const mapNotifRule = (r: T.NotifRuleDto): NotifRule => ({ id: r.id, event: r.event as NotifEvent, name: bi(r.nameAr, r.nameEn), threshold: opt(r.threshold), recipients: r.recipients, channels: r.channels, enabled: r.enabled })
export const mapInbox = (x: T.InboxDto, userId: string): AppNotification => ({ id: x.id, key: x.id, ruleId: '', event: x.event as NotifEvent, severity: x.severity, title: bi(x.titleAr, x.titleEn), body: bi(x.bodyAr, x.bodyEn), link: x.link ?? '/alerts', createdAt: x.createdAt, userIds: [userId], readBy: x.read ? [userId] : [] })
export const mapDelivery = (d: T.DeliveryDto): Delivery => ({ id: d.id, at: d.createdAt, notificationId: opt(d.notificationId), channel: d.channel, to: d.toAddress, subject: d.subject, status: d.status === 'queued' ? 'skipped' : d.status, reason: d.error ? bi(d.error, d.error) : undefined })
