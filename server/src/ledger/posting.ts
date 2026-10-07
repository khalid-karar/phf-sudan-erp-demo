import { eq, inArray } from 'drizzle-orm'
import type { AuthUser } from '../auth/auth-user'
import { unprocessable } from '../common/errors'
import { nextNo } from '../common/numbering'
import type { DbOrTx } from '../db/client'
import { accounts, journalEntries, journalLines, ledgerAccounts, offices } from '../db/schema'
import { fromCents, sumCents, type Cents } from '../lib/money'

export interface PostLine {
  account: string
  debit?: Cents
  credit?: Cents
  sdg?: Cents | null // signed SDG cents for SDG accounts
  officeId: string
  projectId?: string | null
  budgetLineId?: string | null
  activityId?: string | null
  memo?: string | null
}

export interface PostEntry {
  date: string // YYYY-MM-DD
  memo: string
  source: 'opening' | 'payment' | 'receipt' | 'advance' | 'settlement' | 'fx' | 'transfer' | 'payroll' | 'stock' | 'manual' | 'reversal'
  ref?: string | null
  reversalOfId?: string | null
  lines: PostLine[]
}

/**
 * The single way anything reaches the books. Checks here give clear messages; the database
 * triggers (migrations/0001) enforce the same rules as a backstop.
 */
export async function post(tx: DbOrTx, user: AuthUser | null, e: PostEntry) {
  const lines = e.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0)
  for (const l of lines) {
    if ((l.debit ?? 0) < 0 || (l.credit ?? 0) < 0) throw new Error('Journal amounts must be positive; use the other side')
    if ((l.debit ?? 0) > 0 && (l.credit ?? 0) > 0) throw new Error('A journal line is either a debit or a credit')
  }
  const d = sumCents(lines.map((l) => l.debit ?? 0))
  const c = sumCents(lines.map((l) => l.credit ?? 0))
  if (lines.length < 2 || d !== c)
    throw unprocessable('LEDGER_UNBALANCED', { ar: 'القيد غير متوازن: المدين لا يساوي الدائن', en: 'The entry does not balance: debits do not equal credits' }, { debit: fromCents(d), credit: fromCents(c) })

  const codes = [...new Set(lines.map((l) => l.account))]
  const accs = await tx.select().from(accounts).where(inArray(accounts.code, codes))
  for (const code of codes) {
    const a = accs.find((x) => x.code === code)
    if (!a) throw unprocessable('UNKNOWN_ACCOUNT', { ar: `الحساب ${code} غير موجود`, en: `Account ${code} does not exist` })
    if (!a.postable) throw unprocessable('LEDGER_HEADER_ACCOUNT', { ar: `الحساب ${code} حساب رئيسي`, en: `Account ${code} is a header account` })
    if (!a.active) throw unprocessable('LEDGER_INACTIVE_ACCOUNT', { ar: `الحساب ${code} موقوف`, en: `Account ${code} is inactive` })
  }
  const sdgCodes = new Set(accs.filter((a) => a.currency === 'SDG').map((a) => a.code))
  for (const l of lines) {
    if (!sdgCodes.has(l.account)) continue
    // SDG cash and banks must say how many pounds moved, in the same direction as the USD side
    // (0 is allowed only for pure USD adjustments such as revaluation).
    if (l.sdg === null || l.sdg === undefined)
      throw unprocessable('LEDGER_SDG_MISSING', { ar: `الحساب ${l.account} بالجنيه: أدخل مبلغ الجنيه`, en: `Account ${l.account} is in SDG: enter the SDG amount` })
    if (((l.debit ?? 0) > 0 && l.sdg < 0) || ((l.credit ?? 0) > 0 && l.sdg > 0))
      throw unprocessable('LEDGER_SDG_SIGN', { ar: `اتجاه مبلغ الجنيه في الحساب ${l.account} يخالف المدين/الدائن`, en: `The SDG amount on ${l.account} goes the opposite way to the debit/credit` })
  }

  const no = await nextNo(tx, 'JE')
  const [entry] = await tx
    .insert(journalEntries)
    .values({ no, date: e.date, period: e.date.slice(0, 7), memo: e.memo, source: e.source, ref: e.ref ?? null, reversalOfId: e.reversalOfId ?? null, createdById: user?.id ?? null })
    .returning()
  await tx.insert(journalLines).values(
    lines.map((l) => ({
      entryId: entry.id,
      accountCode: l.account,
      debit: fromCents(l.debit ?? 0),
      credit: fromCents(l.credit ?? 0),
      // SDG accounts always carry an SDG figure (0 for pure USD adjustments such as revaluation).
      sdg: sdgCodes.has(l.account) ? fromCents(l.sdg!) : null,
      officeId: l.officeId,
      projectId: l.projectId ?? null,
      budgetLineId: l.budgetLineId ?? null,
      activityId: l.activityId ?? null,
      memo: l.memo ?? null,
    })),
  )
  return entry
}

export type LedgerKey = 'cash_boxes' | 'banks' | 'advances' | 'fx_gain' | 'fx_loss' | 'inventory' | 'inkind_revenue' | 'salaries' | 'payroll_deductions'

/** The account configured for a system role (see ledger_accounts). */
export async function ledgerAccount(tx: DbOrTx, key: LedgerKey): Promise<string> {
  const [r] = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.key, key))
  if (!r) throw unprocessable('LEDGER_NOT_CONFIGURED', { ar: `لم يُحدد حساب «${key}» في إعدادات الحسابات`, en: `No account is configured for "${key}"` })
  return r.accountCode
}

/** The headquarters office, used for organisation-wide journal lines. */
export async function hqOfficeId(tx: DbOrTx): Promise<string> {
  const [o] = await tx.select({ id: offices.id }).from(offices).where(eq(offices.type, 'hq')).limit(1)
  if (!o) throw unprocessable('NO_HQ', { ar: 'لم يُحدد مكتب الرئاسة', en: 'No headquarters office is set up' })
  return o.id
}
