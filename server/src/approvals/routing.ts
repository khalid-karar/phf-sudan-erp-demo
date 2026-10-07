import { toCents, type Cents } from '../lib/money'

export interface RuleLike {
  id: string
  kind: 'spend' | 'reallocation'
  minUsd: string
  maxUsd: string | null
  officeId: string | null
  chain: string[]
  active: boolean
}

export const EXTRA_APPROVER = 'executive_director'
export const FALLBACK_APPROVER = 'finance_manager'

/**
 * Picks the approval chain for an amount: active rules of that kind whose band [min, max) holds
 * the amount; an office-specific rule wins over a general one. Over-ceiling requests in soft
 * mode get the Executive Director added at the end.
 */
export function routeApproval(rules: RuleLike[], kind: RuleLike['kind'], amount: Cents, officeId: string | null, overCeiling = false) {
  const matches = rules.filter(
    (r) => r.active && r.kind === kind && amount >= toCents(r.minUsd) && (r.maxUsd === null || amount < toCents(r.maxUsd)) && (r.officeId === null || r.officeId === officeId),
  )
  const rule = matches.find((r) => r.officeId !== null) ?? matches.find((r) => r.officeId === null) ?? null
  const chain = rule ? [...rule.chain] : [FALLBACK_APPROVER]
  if (overCeiling && !chain.includes(EXTRA_APPROVER)) chain.push(EXTRA_APPROVER)
  return { rule, chain }
}

/** Bands for one kind/office that overlap or leave gaps — shown as warnings in the rule editor. */
export function ruleWarnings(rules: RuleLike[]) {
  const out: { kind: string; officeId: string | null; problem: 'gap' | 'overlap'; from: string; to: string | null }[] = []
  const groups = new Map<string, RuleLike[]>()
  for (const r of rules.filter((x) => x.active)) {
    const k = `${r.kind}|${r.officeId ?? ''}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const [k, rs] of groups) {
    const [kind, office] = k.split('|')
    const sorted = [...rs].sort((a, b) => toCents(a.minUsd) - toCents(b.minUsd))
    if (!office && toCents(sorted[0].minUsd) > 0) out.push({ kind, officeId: null, problem: 'gap', from: '0.00', to: sorted[0].minUsd })
    for (let i = 1; i < sorted.length; i++) {
      const prevMax = sorted[i - 1].maxUsd
      const cur = toCents(sorted[i].minUsd)
      if (prevMax === null || toCents(prevMax) > cur) out.push({ kind, officeId: office || null, problem: 'overlap', from: sorted[i].minUsd, to: prevMax })
      else if (toCents(prevMax) < cur) out.push({ kind, officeId: office || null, problem: 'gap', from: prevMax, to: sorted[i].minUsd })
    }
    if (!office && sorted[sorted.length - 1].maxUsd !== null) out.push({ kind, officeId: null, problem: 'gap', from: sorted[sorted.length - 1].maxUsd!, to: null })
  }
  return out
}
