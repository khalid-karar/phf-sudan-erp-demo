import { sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { fromCents, pctOf, toCents, type Cents } from '../lib/money'

/** Budget position of a line, pillar or project, in USD cents. */
export interface Usage {
  original: Cents // ceiling as budgeted
  ceiling: Cents // after approved reallocations
  spent: Cents // cash spending posted to expense accounts in the ledger
  inKind: Cents // in-kind supplies issued to the line (shown, but not counted against the cash ceiling)
  committed: Cents // approved but unpaid requests + open cash advances
  pending: Cents // in approval (requests) or promised away (pending reallocations out)
  available: Cents // ceiling − spent − committed − pending
}

export interface LineRow {
  id: string
  pillarId: string
  code: string
  nameAr: string
  nameEn: string
  usage: Usage
}

export interface ProjectUsage {
  projectId: string
  controlMode: 'hard' | 'soft'
  tolerancePct: string
  project: Usage
  pillars: Map<string, Usage>
  lines: Map<string, LineRow>
}

const zero = (): Usage => ({ original: 0, ceiling: 0, spent: 0, inKind: 0, committed: 0, pending: 0, available: 0 })
const addInto = (a: Usage, b: Usage) => {
  a.spent += b.spent
  a.inKind += b.inKind
  a.committed += b.committed
  a.pending += b.pending
}

/**
 * Computes usage for every line, pillar and the project in one query.
 * `excludeRequestId` leaves one request out (to re-check it against everything else).
 */
export async function projectUsage(db: DbOrTx, projectId: string, excludeRequestId?: string): Promise<ProjectUsage> {
  const ex = excludeRequestId ?? ''
  const r = await db.execute<{
    id: string
    pillar_id: string
    code: string
    name_ar: string
    name_en: string
    ceiling: string
    realloc_in: string
    realloc_out: string
    realloc_pending_out: string
    spent: string
    in_kind: string
    committed_req: string
    committed_adv: string
    pending_req: string
  }>(sql`
    select l.id, l.pillar_id, l.code, l.name_ar, l.name_en, l.ceiling_usd as ceiling,
      coalesce((select sum(amount_usd) from reallocations r where r.to_line_id = l.id and r.status = 'approved'), 0) as realloc_in,
      coalesce((select sum(amount_usd) from reallocations r where r.from_line_id = l.id and r.status = 'approved'), 0) as realloc_out,
      coalesce((select sum(amount_usd) from reallocations r where r.from_line_id = l.id and r.status = 'pending'), 0) as realloc_pending_out,
      coalesce((select sum(jl.debit - jl.credit) from journal_lines jl join accounts a on a.code = jl.account_code
                join journal_entries je on je.id = jl.entry_id
                where jl.budget_line_id = l.id and a.type = 'expense' and je.source <> 'stock'), 0) as spent,
      coalesce((select sum(jl.debit - jl.credit) from journal_lines jl join accounts a on a.code = jl.account_code
                join journal_entries je on je.id = jl.entry_id
                where jl.budget_line_id = l.id and a.type = 'expense' and je.source = 'stock'), 0) as in_kind,
      coalesce((select sum(amount_usd) from spend_requests s where s.line_id = l.id and s.status = 'approved' and s.id <> ${ex}), 0) as committed_req,
      coalesce((select sum(amount_usd) from advances a where a.line_id = l.id and a.status = 'open'), 0) as committed_adv,
      coalesce((select sum(amount_usd) from spend_requests s where s.line_id = l.id and s.status = 'pending' and s.id <> ${ex}), 0) as pending_req
    from budget_lines l
    where l.project_id = ${projectId}
    order by l.sort, l.code`)

  const meta = await db.execute<{ ceiling_usd: string; control_mode: 'hard' | 'soft'; tolerance_pct: string }>(
    sql`select ceiling_usd, control_mode, tolerance_pct from projects where id = ${projectId}`,
  )
  const pillarRows = await db.execute<{ id: string; ceiling_usd: string }>(sql`select id, ceiling_usd from pillars where project_id = ${projectId}`)

  const lines = new Map<string, LineRow>()
  const pillars = new Map<string, Usage>()
  for (const p of pillarRows.rows) {
    const u = zero()
    u.original = u.ceiling = toCents(p.ceiling_usd)
    pillars.set(p.id, u)
  }
  const lineToPillar = new Map(r.rows.map((x) => [x.id, x.pillar_id]))

  for (const x of r.rows) {
    const original = toCents(x.ceiling)
    const ceiling = original + toCents(x.realloc_in) - toCents(x.realloc_out)
    const spent = toCents(x.spent)
    const committed = toCents(x.committed_req) + toCents(x.committed_adv)
    const pending = toCents(x.pending_req) + toCents(x.realloc_pending_out)
    const usage: Usage = { original, ceiling, spent, inKind: toCents(x.in_kind), committed, pending, available: ceiling - spent - committed - pending }
    lines.set(x.id, { id: x.id, pillarId: x.pillar_id, code: x.code, nameAr: x.name_ar, nameEn: x.name_en, usage })
    addInto(pillars.get(x.pillar_id)!, usage)
  }

  // Approved reallocations that cross pillars move pillar ceilings too; within a project the total is unchanged.
  const cross = await db.execute<{ from_line_id: string; to_line_id: string; amount_usd: string }>(
    sql`select from_line_id, to_line_id, amount_usd from reallocations where project_id = ${projectId} and status = 'approved'`,
  )
  for (const c of cross.rows) {
    const from = lineToPillar.get(c.from_line_id)
    const to = lineToPillar.get(c.to_line_id)
    if (from && to && from !== to) {
      pillars.get(from)!.ceiling -= toCents(c.amount_usd)
      pillars.get(to)!.ceiling += toCents(c.amount_usd)
    }
  }
  // A pending reallocation reserves money on the giving line, but it doesn't leave the pillar
  // (same-pillar move) or the project (any move), so it must not reduce what's available there.
  const pendingMoves = await db.execute<{ from_line_id: string; to_line_id: string; amount_usd: string }>(
    sql`select from_line_id, to_line_id, amount_usd from reallocations where project_id = ${projectId} and status = 'pending'`,
  )
  let projectPendingMoves = 0
  for (const m of pendingMoves.rows) {
    const from = lineToPillar.get(m.from_line_id)
    const to = lineToPillar.get(m.to_line_id)
    const a = toCents(m.amount_usd)
    if (from && from === to) pillars.get(from)!.pending -= a // already out of the pillar total, so also out of the project's
    else projectPendingMoves += a
  }
  const project = zero()
  project.original = project.ceiling = toCents(meta.rows[0]?.ceiling_usd ?? '0')
  for (const p of pillars.values()) {
    p.available = p.ceiling - p.spent - p.committed - p.pending
    addInto(project, p)
  }
  project.pending -= projectPendingMoves
  project.available = project.ceiling - project.spent - project.committed - project.pending

  return { projectId, controlMode: meta.rows[0]?.control_mode ?? 'hard', tolerancePct: meta.rows[0]?.tolerance_pct ?? '0', project, pillars, lines }
}

export type Level = 'line' | 'pillar' | 'project'
export type Verdict = 'ok' | 'needs_extra_approval' | 'blocked'

export interface LevelCheck {
  level: Level
  usage: Usage
  after: Cents // available after this amount
  allowance: Cents // tolerance on top (soft mode)
  ok: boolean
  withinTolerance: boolean
}

export interface CeilingCheck {
  verdict: Verdict
  shortfall: Cents // how much more the line needs
  levels: LevelCheck[]
}

/** Checks an amount against the line, its pillar and the project (same rules as the demo UI). */
export function checkCeiling(u: ProjectUsage, lineId: string, amount: Cents): CeilingCheck {
  const line = u.lines.get(lineId)
  if (!line) throw new Error(`Line ${lineId} is not in project ${u.projectId}`)
  const soft = u.controlMode === 'soft'
  const mk = (level: Level, usage: Usage): LevelCheck => {
    const after = usage.available - amount
    const allowance = soft ? pctOf(usage.ceiling, u.tolerancePct) : 0
    return { level, usage, after, allowance, ok: after >= 0, withinTolerance: after >= -allowance }
  }
  const levels = [mk('line', line.usage), mk('pillar', u.pillars.get(line.pillarId)!), mk('project', u.project)]
  const verdict: Verdict = levels.every((l) => l.ok) ? 'ok' : soft && levels.every((l) => l.withinTolerance) ? 'needs_extra_approval' : 'blocked'
  return { verdict, shortfall: Math.max(0, -levels[0].after), levels }
}

/** JSON shape for the API (amounts as exact decimal strings). */
export const usageJson = (u: Usage) => ({
  original: fromCents(u.original),
  ceiling: fromCents(u.ceiling),
  spent: fromCents(u.spent),
  inKind: fromCents(u.inKind),
  committed: fromCents(u.committed),
  pending: fromCents(u.pending),
  available: fromCents(u.available),
})

export const checkJson = (c: CeilingCheck) => ({
  verdict: c.verdict,
  shortfall: fromCents(c.shortfall),
  levels: c.levels.map((l) => ({ level: l.level, ok: l.ok, withinTolerance: l.withinTolerance, after: fromCents(l.after), allowance: fromCents(l.allowance), usage: usageJson(l.usage) })),
})
