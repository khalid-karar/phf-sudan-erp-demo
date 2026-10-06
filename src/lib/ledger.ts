import type { Account, AccountType, JournalEntry, JournalLine } from '../data/types'

export const debitNormal = (t: AccountType) => t === 'asset' || t === 'expense'

export interface Bal {
  debit: number
  credit: number
  balance: number // in the account's normal direction
  sdg: number // SDG held (cash and bank accounts only)
}

type Filter = { officeId?: string; projectId?: string; to?: string; from?: string }

export function lineMatches(l: JournalLine, e: JournalEntry, f: Filter) {
  if (f.officeId && l.officeId !== f.officeId) return false
  if (f.projectId && l.projectId !== f.projectId) return false
  if (f.to && +new Date(e.date) > +new Date(f.to)) return false
  if (f.from && +new Date(e.date) < +new Date(f.from)) return false
  return true
}

/** Balances for every account, with header accounts rolled up from their children. */
export function balances(accounts: Account[], journal: JournalEntry[], f: Filter = {}) {
  const map = new Map<string, Bal>()
  for (const a of accounts) map.set(a.code, { debit: 0, credit: 0, balance: 0, sdg: 0 })
  for (const e of journal)
    for (const l of e.lines) {
      if (!lineMatches(l, e, f)) continue
      const b = map.get(l.account)
      if (!b) continue
      b.debit += l.debit
      b.credit += l.credit
      b.sdg += l.sdg ?? 0
    }
  // roll up, deepest first
  const depth = (a: Account): number => (a.parent ? 1 + depth(accounts.find((x) => x.code === a.parent)!) : 0)
  const ordered = [...accounts].sort((a, b) => depth(b) - depth(a))
  for (const a of ordered) {
    if (!a.parent) continue
    const b = map.get(a.code)!
    const p = map.get(a.parent)!
    p.debit += b.debit
    p.credit += b.credit
    p.sdg += b.sdg
  }
  for (const a of accounts) {
    const b = map.get(a.code)!
    b.balance = debitNormal(a.type) ? b.debit - b.credit : b.credit - b.debit
  }
  return map
}

export function children(accounts: Account[], code: string | null) {
  return accounts.filter((a) => a.parent === code).sort((a, b) => a.code.localeCompare(b.code))
}

export function entryTotals(e: JournalEntry) {
  const d = e.lines.reduce((s, l) => s + l.debit, 0)
  const c = e.lines.reduce((s, l) => s + l.credit, 0)
  return { debit: d, credit: c, balanced: Math.abs(d - c) < 0.01 }
}

/** Unrealised FX difference on SDG cash and bank accounts at the current rate. Negative = loss. */
export function revaluation(accounts: Account[], journal: JournalEntry[], rate: number) {
  const bal = balances(accounts, journal)
  return accounts
    .filter((a) => a.postable && a.currency === 'SDG')
    .map((a) => {
      const b = bal.get(a.code)!
      const current = b.sdg / rate
      return { account: a, sdg: b.sdg, book: b.balance, current, diff: current - b.balance }
    })
    .filter((x) => Math.abs(x.sdg) > 0)
}

export function nextAccountCode(accounts: Account[], parent: string) {
  const kids = children(accounts, parent)
  if (!kids.length) return parent.length >= 4 ? `${parent}-01` : `${parent}01`
  const last = kids[kids.length - 1].code
  const m = last.match(/^(.*?)(\d+)$/)
  if (!m) return `${last}1`
  return m[1] + String(+m[2] + 1).padStart(m[2].length, '0')
}

/** The month being closed: the calendar month before today. */
export function closingPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
  return { start: start.toISOString(), end: end.toISOString() }
}
