import type { Advance, ApprovalRule, BudgetLine, Expense, Pillar, Project, Reallocation, RoleKey, SpendRequest } from '../data/types'

export interface Usage {
  ceiling: number // after approved reallocations
  original: number
  spent: number // paid expenses
  committed: number // approved, not yet paid
  pending: number // in the approval chain (reserved so two requests can't both pass)
  available: number // ceiling − spent − committed − pending
}

export interface BudgetData {
  /** Live mode: the server's own figure for every line. It already counts every office's spending, which a field officer's screen does not carry. */
  serverUsage?: Record<string, Usage> | null
  expenses: Expense[]
  requests: SpendRequest[]
  reallocations: Reallocation[]
  advances?: Advance[] // open cash advances count as committed until settled
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function reallocDelta(lineId: string, d: BudgetData) {
  return sum(
    d.reallocations
      .filter((r) => r.status === 'approved')
      .map((r) => (r.toLineId === lineId ? r.amountUSD : r.fromLineId === lineId ? -r.amountUSD : 0)),
  )
}

export function lineUsage(line: BudgetLine, d: BudgetData, excludeRequestId?: string): Usage {
  const server = d.serverUsage?.[line.id]
  if (server) {
    // Re-checking one request against everything else: take its own amount back out of what is reserved.
    const own = excludeRequestId ? d.requests.find((r) => r.id === excludeRequestId && r.lineId === line.id) : undefined
    if (!own) return server
    const pending = server.pending - (own.status === 'pending' ? own.amountUSD : 0)
    const committed = server.committed - (own.status === 'approved' ? own.amountUSD : 0)
    return { ...server, pending, committed, available: server.ceiling - server.spent - committed - pending }
  }
  const ceiling = line.ceilingUSD + reallocDelta(line.id, d)
  const spent = sum(d.expenses.filter((e) => e.lineId === line.id).map((e) => e.amountUSD))
  const reqs = d.requests.filter((r) => r.lineId === line.id && r.id !== excludeRequestId)
  const committed =
    sum(reqs.filter((r) => r.status === 'approved').map((r) => r.amountUSD)) +
    sum((d.advances ?? []).filter((a) => a.status === 'open' && a.lineId === line.id).map((a) => a.amountUSD))
  const pendingReq = sum(reqs.filter((r) => r.status === 'pending').map((r) => r.amountUSD))
  // Money promised away by a pending reallocation is reserved on the giving line too.
  const pendingOut = sum(
    d.reallocations.filter((r) => r.status === 'pending' && r.fromLineId === line.id).map((r) => r.amountUSD),
  )
  const pending = pendingReq + pendingOut
  return { ceiling, original: line.ceilingUSD, spent, committed, pending, available: ceiling - spent - committed - pending }
}

const add = (a: Usage, b: Usage): Usage => ({
  ceiling: a.ceiling + b.ceiling,
  original: a.original + b.original,
  spent: a.spent + b.spent,
  committed: a.committed + b.committed,
  pending: a.pending + b.pending,
  available: a.available + b.available,
})
const zero: Usage = { ceiling: 0, original: 0, spent: 0, committed: 0, pending: 0, available: 0 }

export function pillarUsage(p: Pillar, d: BudgetData, exclude?: string): Usage {
  return p.lines.map((l) => lineUsage(l, d, exclude)).reduce(add, zero)
}

export function projectUsage(p: Project, d: BudgetData, exclude?: string): Usage {
  return p.pillars.map((pl) => pillarUsage(pl, d, exclude)).reduce(add, zero)
}

export function findLine(projects: Project[], lineId: string) {
  for (const project of projects)
    for (const pillar of project.pillars)
      for (const line of pillar.lines) if (line.id === lineId) return { project, pillar, line }
  return null
}

export type Level = 'line' | 'pillar' | 'project'
export interface LevelCheck {
  level: Level
  usage: Usage
  after: number // available after this request
  allowance: number // tolerance on top of available (soft mode)
  ok: boolean // fits within available
  withinTolerance: boolean
}

export type Verdict = 'ok' | 'needs_extra_approval' | 'blocked'

export interface CeilingCheck {
  levels: LevelCheck[]
  verdict: Verdict
  shortfall: number // how much more budget the line needs
}

/** Checks a requested amount against the line, its pillar, and the whole project. */
export function checkCeiling(project: Project, pillar: Pillar, line: BudgetLine, amountUSD: number, d: BudgetData, excludeRequestId?: string): CeilingCheck {
  const tol = project.controlMode === 'soft' ? project.tolerancePct / 100 : 0
  const mk = (level: Level, usage: Usage): LevelCheck => {
    const after = usage.available - amountUSD
    const allowance = usage.ceiling * tol
    return { level, usage, after, allowance, ok: after >= -0.005, withinTolerance: after >= -allowance - 0.005 }
  }
  const levels = [
    mk('line', lineUsage(line, d, excludeRequestId)),
    mk('pillar', pillarUsage(pillar, d, excludeRequestId)),
    mk('project', projectUsage(project, d, excludeRequestId)),
  ]
  const allOk = levels.every((l) => l.ok)
  const allTol = levels.every((l) => l.withinTolerance)
  const verdict: Verdict = allOk ? 'ok' : project.controlMode === 'soft' && allTol ? 'needs_extra_approval' : 'blocked'
  const shortfall = Math.max(0, -levels[0].after)
  return { levels, verdict, shortfall }
}

/** Picks the approval chain for an amount. Over-ceiling requests in soft mode add the Executive Director. */
export function routeApproval(rules: ApprovalRule[], kind: 'spend' | 'reallocation', amountUSD: number, overCeiling = false, officeId?: string) {
  const matches = rules.filter(
    (r) => r.active && r.appliesTo === kind && amountUSD >= r.minUSD && (r.maxUSD === null || amountUSD < r.maxUSD) && (r.officeId === null || r.officeId === officeId),
  )
  const rule = matches.find((r) => r.officeId !== null) ?? matches[0]
  const chain: RoleKey[] = rule ? [...rule.chain] : ['finance_manager']
  if (overCeiling && !chain.includes('executive_director')) chain.push('executive_director')
  return { rule, chain }
}

/** Lines in the same project with room to give, best candidates first. */
export function reallocationSources(project: Project, toLineId: string, needed: number, d: BudgetData) {
  const out: { line: BudgetLine; pillar: Pillar; available: number }[] = []
  for (const pillar of project.pillars)
    for (const line of pillar.lines) {
      if (line.id === toLineId) continue
      const u = lineUsage(line, d)
      if (u.available > 0) out.push({ line, pillar, available: u.available })
    }
  const target = findLine([project], toLineId)
  return out.sort((a, b) => {
    // Prefer lines in the same pillar (keeps pillar totals unchanged), then those that can cover the full amount.
    const sameA = a.pillar.id === target?.pillar.id ? 0 : 1
    const sameB = b.pillar.id === target?.pillar.id ? 0 : 1
    if (sameA !== sameB) return sameA - sameB
    const coverA = a.available >= needed ? 0 : 1
    const coverB = b.available >= needed ? 0 : 1
    if (coverA !== coverB) return coverA - coverB
    return b.available - a.available
  })
}

export const pct = (part: number, whole: number) => (whole <= 0 ? 0 : Math.max(0, Math.min(1, part / whole)))
