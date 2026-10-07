import { describe, expect, it } from 'vitest'
import { routeApproval, ruleWarnings } from '../src/approvals/routing'
import { fromCents, pctOf, sdgToUsd, toCents, toRate4, usdToSdg } from '../src/lib/money'

describe('money', () => {
  it('parses and prints exact amounts', () => {
    expect(toCents('1234.5')).toBe(123450)
    expect(toCents('0.005')).toBe(1) // half away from zero
    expect(toCents('-2.345')).toBe(-235)
    expect(fromCents(-5)).toBe('-0.05')
    expect(() => toCents('12,5')).toThrow()
  })

  it('converts SDG and USD at a rate without float drift', () => {
    const r = toRate4('2450')
    expect(sdgToUsd(toCents('4500000'), r)).toBe(183673) // $1,836.73
    expect(usdToSdg(toCents('1836.73'), r)).toBe(449998850)
    expect(sdgToUsd(-toCents('2450'), r)).toBe(-100)
    expect(pctOf(toCents('1000'), '10')).toBe(10000)
  })
})

describe('approval routing', () => {
  const rules = [
    { id: 'a', kind: 'spend' as const, minUsd: '0', maxUsd: '500', officeId: null, chain: ['supervisor'], active: true },
    { id: 'b', kind: 'spend' as const, minUsd: '500', maxUsd: null, officeId: null, chain: ['supervisor', 'finance_manager'], active: true },
    { id: 'k', kind: 'spend' as const, minUsd: '0', maxUsd: null, officeId: 'ksl', chain: ['finance_manager'], active: true },
  ]
  it('uses the band [min, max) and lets an office rule win', () => {
    expect(routeApproval(rules, 'spend', 49999, 'gdf').chain).toEqual(['supervisor'])
    expect(routeApproval(rules, 'spend', 50000, 'gdf').chain).toEqual(['supervisor', 'finance_manager'])
    expect(routeApproval(rules, 'spend', 100, 'ksl').rule?.id).toBe('k')
    expect(routeApproval(rules, 'spend', 100, 'gdf', true).chain).toEqual(['supervisor', 'executive_director'])
  })
  it('flags gaps and overlaps', () => {
    const w = ruleWarnings([
      { id: 'x', kind: 'spend', minUsd: '0', maxUsd: '500', officeId: null, chain: ['s'], active: true },
      { id: 'y', kind: 'spend', minUsd: '600', maxUsd: null, officeId: null, chain: ['s'], active: true },
    ])
    expect(w).toEqual([{ kind: 'spend', officeId: null, problem: 'gap', from: '500', to: '600' }])
  })
})
