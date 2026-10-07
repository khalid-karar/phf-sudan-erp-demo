// Fills the app's data from the API after sign-in. What a person's role cannot open comes back empty,
// not as an error: a storekeeper has no finance data to load and does not need it.
import type { ChannelConfig, ReportSettings, SentReport } from '../data/types'
import { defaultChannels } from '../lib/notify'
import { api, ApiError } from './http'
import type * as T from './dto'
import * as M from './map'

async function soft<X>(path: string, fallback: X): Promise<X> {
  try {
    return await api.get<X>(path)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return fallback
    throw e
  }
}

/** The journal arrives in pages of 500; stop at a sensible size (the finance screens will move to server totals). */
async function journal(): Promise<T.JournalDto[]> {
  const out: T.JournalDto[] = []
  for (let offset = 0; offset < 5000; offset += 500) {
    const page = await soft<T.JournalDto[]>(`/finance/journal?limit=500&offset=${offset}`, [])
    out.push(...page)
    if (page.length < 500) break
  }
  return out
}

const thisClosingPeriod = () => {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface Core {
  org: ReturnType<typeof M.mapOrg>
  offices: ReturnType<typeof M.mapOffice>[]
  roles: ReturnType<typeof M.mapRole>[]
  users: ReturnType<typeof M.mapUser>[]
}

/** Sign-in details, organisation, offices, roles and the people directory. Needed before anything can be shown. */
export async function loadCore(prevOrg: Parameters<typeof M.mapOrg>[1]): Promise<Core & { me: T.MeDto }> {
  const me = await api.get<T.MeDto>('/auth/me')
  const [org, offices, roles, dir, full] = await Promise.all([
    api.get<T.OrgDto>('/org/settings'),
    api.get<T.OfficeDto[]>('/offices'),
    api.get<T.RoleDto[]>('/roles'),
    api.get<T.UserDto[]>('/users/directory'),
    me.role.permissions.settings === 'manage' ? soft<T.UserDto[]>('/users', []) : Promise.resolve([] as T.UserDto[]), // settings managers also get phone numbers
  ])
  const phones = new Map(full.map((u) => [u.id, u.phone]))
  return { me, org: M.mapOrg(org, prevOrg), offices: offices.map(M.mapOffice), roles: roles.map(M.mapRole), users: dir.map((u) => M.mapUser({ ...u, phone: phones.get(u.id) })) }
}

/** Everything the screens read, as the store's data. */
export async function loadData(userId: string, perms: Record<string, string>) {
  // A module the role cannot open is not even asked for: nothing to load, and no refused requests.
  const g = <X>(m: string, path: string, fallback: X) => ((perms[m] ?? 'none') === 'none' ? Promise.resolve(fallback) : soft<X>(path, fallback))
  const [trees, expenses, requests, reallocations, rules, activities, accounts, jr, vouchers, advances, rates, close, items, stock, moves, shipments, vehicles, employees, leave, payrolls, deadlines, notifRules, inbox, deliveries, channels, reportSettings, sent] = await Promise.all([
    g<T.ProjectDto[]>('projects', '/projects/tree', []),
    g<T.ExpenseDto[]>('projects', '/projects/expenses', []),
    g<T.RequestDto[]>('projects', '/requests?limit=500', []),
    g<T.ReallocationDto[]>('projects', '/reallocations', []),
    g<{ rules: T.RuleDto[] }>('projects', '/approval-rules', { rules: [] }),
    g<T.ActivityDto[]>('activities', '/activities?limit=500', []),
    g<{ accounts: T.AccountDto[]; systemAccounts: Record<string, string> }>('finance', '/finance/accounts', { accounts: [], systemAccounts: {} }),
    (perms.finance ?? 'none') === 'none' ? Promise.resolve([] as T.JournalDto[]) : journal(),
    g<T.VoucherDto[]>('finance', '/finance/vouchers?limit=500', []),
    g<T.AdvanceDto[]>('finance', '/finance/advances', []),
    soft<T.RateDto[]>('/finance/rates', []),
    g<T.CloseRowDto[]>('finance', `/finance/close/${thisClosingPeriod()}`, []),
    g<T.ItemDto[]>('supply', '/supply/items', []),
    g<T.StockDto[]>('supply', '/supply/stock', []),
    g<T.MoveDto[]>('supply', '/supply/moves?limit=500', []),
    g<T.ShipmentDto[]>('supply', '/supply/shipments', []),
    g<T.VehicleDto[]>('logistics', '/logistics/vehicles', []),
    g<T.EmployeeDto[]>('hr', '/hr/employees', []),
    soft<T.LeaveDto[]>('/hr/leave', []),
    g<T.PayrollDto[]>('hr', '/hr/payroll', []),
    g<T.DeadlineDto[]>('alerts', '/deadlines', []),
    g<T.NotifRuleDto[]>('alerts', '/notification-rules', []),
    soft<T.InboxDto[]>('/notifications?limit=100', []),
    g<T.DeliveryDto[]>('settings', '/deliveries?limit=200', []),
    g<Record<string, unknown> | null>('settings', '/channels', null),
    g<{ hq: ReportSettings['hq']; donor: ReportSettings['donor'] } | null>('reports', '/report-settings', null),
    g<(T.SentReportDto & { sentByEn?: string | null })[]>('reports', '/reports/sent?limit=200', []),
  ])
  const vehicleDetails = await Promise.all(vehicles.map((v) => g<{ fuel?: T.FuelDto[] }>('logistics', `/logistics/vehicles/${v.id}`, {})))
  const actCode = new Map(activities.map((a) => [a.id, a.code]))
  const lineMap: Record<string, string> = {}
  for (const p of trees) for (const pl of p.pillars) for (const l of pl.lines) if (l.expenseAccountCode) lineMap[l.id] = l.expenseAccountCode

  const closes = close.map((c) => ({ officeId: c.officeId, cashCounted: c.checks.cashCounted, closedAt: c.closedAt ?? undefined, closedBy: undefined }))
  const sentReports: SentReport[] = sent.map((r) => {
    const proj = r.projectId ? trees.find((p) => p.id === r.projectId)?.code : undefined
    const title = r.kind === 'hq' ? { ar: `التقرير الشهري — ${r.period}`, en: `Monthly report — ${r.period}` } : { ar: `تقرير المانح — ${proj ?? ''} ${r.period}`, en: `Donor report — ${proj ?? ''} ${r.period}` }
    return { id: r.id, kind: r.kind, title, period: r.period, projectId: r.projectId ?? undefined, to: r.toAddresses, cc: r.ccAddresses, subject: r.subject, fileName: r.kind === 'hq' ? `PHF-Sudan-monthly-report-${r.period}.pdf` : `PHF-donor-report-${proj ?? ''}-${r.period}.pdf`, sizeKB: 0, at: r.sentAt, by: r.sentById ?? '' }
  })
  void deliveries

  return {
    projects: trees.map(M.mapProject),
    serverUsage: M.mapUsage(trees),
    lineMap,
    expenses: expenses.map(M.mapExpense),
    requests: requests.map((r) => M.mapRequest(r, (id) => (id ? actCode.get(id) : undefined))),
    reallocations: reallocations.map(M.mapReallocation),
    rules: rules.rules.map(M.mapRule),
    activities: activities.map(M.mapActivity),
    accounts: accounts.accounts.map(M.mapAccount),
    journal: jr.map(M.mapJournal),
    vouchers: vouchers.map(M.mapVoucher),
    advances: advances.map(M.mapAdvance),
    rates: rates.map(M.mapRate).sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    closes,
    items: items.map(M.mapItem),
    stock: stock.map(M.mapStock),
    stockMoves: moves.map(M.mapMove),
    shipments: shipments.map(M.mapShipment),
    vehicles: vehicles.map((v, i) => M.mapVehicle(v, vehicleDetails[i].fuel ?? [])),
    employees: employees.map(M.mapEmployee),
    leaves: leave.map((l) => M.mapLeave(l.leave)),
    payrolls: payrolls.filter((p) => p.status === 'posted').map(M.mapPayroll),
    deadlines: deadlines.map(M.mapDeadline),
    notifRules: notifRules.map(M.mapNotifRule),
    notifications: inbox.map((x) => M.mapInbox(x, userId)),
    deliveries: deliveries.map(M.mapDelivery),
    channels: (channels ? mergeChannels(channels) : defaultChannels) as ChannelConfig,
    reportSettings: reportSettings ?? undefined,
    sentReports,
  }
}

function mergeChannels(c: Record<string, unknown>): ChannelConfig {
  const out = structuredClone(defaultChannels) as unknown as Record<string, Record<string, unknown>>
  for (const k of Object.keys(out)) {
    const v = (c[k] ?? {}) as Record<string, unknown>
    out[k] = { ...out[k], ...v, lastTest: v.lastTest ?? undefined }
  }
  return out as unknown as ChannelConfig
}
