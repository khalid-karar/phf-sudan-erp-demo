import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { accounts, budgetLines, exchangeRates, journalEntries, journalLines, ledgerAccounts } from '../db/schema'
import { lockProject } from '../budget/budget.service'
import { checkCeiling, checkJson, projectUsage } from '../budget/usage'
import { fromCents, toCents } from '../lib/money'
import type { accountBody, accountPatch, journalQuery, ledgerAccountsBody, manualEntryBody, rateBody, reverseBody } from './ledger.schemas'
import { ledgerAccount, post } from './posting'
import { today } from './rates'

@Injectable()
export class AccountsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ─── Chart of accounts ────────────────────────────────────────────────────

  /** Every account with its own and rolled-up balance (debit − credit, USD) and SDG balance. */
  async chart(asOf?: string) {
    const rows = await this.db.select().from(accounts).orderBy(asc(accounts.code))
    const bal = await this.db.execute<{ account_code: string; usd: string; sdg: string | null }>(sql`
      select jl.account_code, sum(jl.debit - jl.credit) as usd, sum(jl.sdg) as sdg
      from journal_lines jl join journal_entries je on je.id = jl.entry_id
      where je.date <= ${asOf ?? '9999-12-31'}
      group by jl.account_code`)
    const own = new Map(bal.rows.map((b) => [b.account_code, { usd: toCents(b.usd), sdg: b.sdg === null ? null : toCents(b.sdg) }]))
    const rolled = new Map<string, number>()
    const byCode = new Map(rows.map((r) => [r.code, r]))
    for (const r of rows) {
      const v = own.get(r.code)?.usd ?? 0
      if (!v) continue
      for (let cur: string | null = r.code; cur; cur = byCode.get(cur)?.parentCode ?? null) rolled.set(cur, (rolled.get(cur) ?? 0) + v)
    }
    const keys = await this.db.select().from(ledgerAccounts)
    return {
      accounts: rows.map((r) => ({
        ...r,
        balanceUsd: fromCents(own.get(r.code)?.usd ?? 0),
        totalUsd: fromCents(rolled.get(r.code) ?? 0),
        balanceSdg: r.currency === 'SDG' ? fromCents(own.get(r.code)?.sdg ?? 0) : null,
      })),
      systemAccounts: Object.fromEntries(keys.map((k) => [k.key, k.accountCode])),
    }
  }

  async createAccount(user: AuthUser, b: z.infer<typeof accountBody>) {
    return this.db.transaction(async (tx) => {
      const [parent] = await tx.select().from(accounts).where(eq(accounts.code, b.parentCode))
      if (!parent) throw notFound({ ar: 'الحساب الأب', en: 'Parent account' })
      if (parent.postable) {
        // A parent with postings can't become a header: its balance would be stranded.
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(journalLines).where(eq(journalLines.accountCode, parent.code))
        if (n > 0) throw conflict('PARENT_HAS_ENTRIES', { ar: 'الحساب الأب عليه قيود؛ اختر حساباً رئيسياً', en: 'The parent has entries; choose a header account' })
        await tx.update(accounts).set({ postable: false }).where(eq(accounts.code, parent.code))
      }
      const [a] = await tx
        .insert(accounts)
        .values({ code: b.code, parentCode: parent.code, nameAr: b.nameAr, nameEn: b.nameEn, type: parent.type, postable: b.postable, currency: b.currency, officeId: b.officeId ?? null })
        .returning()
      await audit(tx, user, 'account.create', 'account', a.code, b)
      return a
    })
  }

  /** First free code under a parent: 52 with 5201–5209 and 5299 → 5210; 1101 with 1101-01…12 → 1101-13. */
  async suggestCode(parentCode: string) {
    const kids = await this.db.select({ code: accounts.code }).from(accounts).where(eq(accounts.parentCode, parentCode))
    const dash = kids.some((k) => k.code.startsWith(parentCode + '-'))
    const prefix = dash ? parentCode + '-' : parentCode
    const suffixes = kids.map((k) => k.code.slice(prefix.length)).filter((s) => /^\d+$/.test(s))
    const width = Math.max(2, ...suffixes.map((s) => s.length))
    const used = new Set(suffixes.map(Number))
    let n = 1
    while (used.has(n)) n++
    return { code: `${prefix}${String(n).padStart(width, '0')}` }
  }

  async updateAccount(user: AuthUser, code: string, b: z.infer<typeof accountPatch>) {
    return this.db.transaction(async (tx) => {
      if (b.active === false) {
        const [r] = await tx.select({ bal: sql<string>`coalesce(sum(debit - credit), 0)` }).from(journalLines).where(eq(journalLines.accountCode, code))
        if (toCents(r.bal) !== 0) throw conflict('ACCOUNT_HAS_BALANCE', { ar: 'لا يمكن إيقاف حساب عليه رصيد', en: 'An account with a balance cannot be deactivated' }, { balance: r.bal })
        const used = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.accountCode, code))
        if (used.length) throw conflict('SYSTEM_ACCOUNT', { ar: 'الحساب مستخدم في إعدادات النظام', en: 'The account is used by a system setting' }, { keys: used.map((u) => u.key) })
      }
      const [a] = await tx.update(accounts).set(b).where(eq(accounts.code, code)).returning()
      if (!a) throw notFound({ ar: 'الحساب', en: 'Account' })
      await audit(tx, user, 'account.update', 'account', code, b)
      return a
    })
  }

  async setLedgerAccounts(user: AuthUser, b: z.infer<typeof ledgerAccountsBody>) {
    return this.db.transaction(async (tx) => {
      for (const [key, code] of Object.entries(b)) {
        const [a] = await tx.select().from(accounts).where(eq(accounts.code, code))
        if (!a) throw notFound({ ar: `الحساب ${code}`, en: `Account ${code}` })
        const header = key === 'cash_boxes' || key === 'banks'
        if (header === a.postable)
          throw unprocessable('WRONG_ACCOUNT_KIND', { ar: header ? 'اختر حساباً رئيسياً' : 'اختر حساباً قابلاً للترحيل', en: header ? 'Choose a header account' : 'Choose a postable account' }, { key })
        await tx.insert(ledgerAccounts).values({ key, accountCode: code }).onConflictDoUpdate({ target: ledgerAccounts.key, set: { accountCode: code } })
      }
      await audit(tx, user, 'ledger_accounts.update', 'ledger_accounts', null, b)
      return tx.select().from(ledgerAccounts)
    })
  }

  // ─── Exchange rates ───────────────────────────────────────────────────────

  rates() {
    return this.db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)).limit(400)
  }

  async addRate(user: AuthUser, b: z.infer<typeof rateBody>) {
    return this.db.transaction(async (tx) => {
      // A month that an office has closed keeps the rates it was closed with.
      const closed = await tx.execute<{ n: number }>(sql`select count(*)::int as n from period_closes where period = ${b.date.slice(0, 7)} and closed_at is not null`)
      if (closed.rows[0].n > 0) throw unprocessable('RATE_PERIOD_CLOSED', { ar: 'الشهر مقفل في أحد المكاتب؛ لا يمكن تغيير سعر الصرف فيه', en: 'An office has closed that month, so its exchange rate cannot be changed' })
      const [r] = await tx.insert(exchangeRates).values(b).onConflictDoUpdate({ target: exchangeRates.date, set: { rate: b.rate, source: b.source } }).returning()
      await audit(tx, user, 'rate.set', 'exchange_rate', b.date, b)
      return r
    })
  }

  // ─── Journal ──────────────────────────────────────────────────────────────

  async journal(q: z.infer<typeof journalQuery>) {
    const where: SQL[] = []
    if (q.period) where.push(eq(journalEntries.period, q.period))
    if (q.from) where.push(gte(journalEntries.date, q.from))
    if (q.to) where.push(lte(journalEntries.date, q.to))
    if (q.source) where.push(sql`${journalEntries.source} = ${q.source}`)
    const lineFilter: SQL[] = []
    if (q.account) lineFilter.push(sql`(jl.account_code = ${q.account} or jl.account_code like ${q.account + '-%'})`)
    if (q.officeId) lineFilter.push(sql`jl.office_id = ${q.officeId}`)
    if (q.projectId) lineFilter.push(sql`jl.project_id = ${q.projectId}`)
    if (lineFilter.length) where.push(sql`exists (select 1 from journal_lines jl where jl.entry_id = ${journalEntries.id} and ${sql.join(lineFilter, sql` and `)})`)
    const entries = await this.db
      .select()
      .from(journalEntries)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(journalEntries.date), desc(journalEntries.no))
      .limit(q.limit)
      .offset(q.offset)
    const lines = entries.length ? await this.db.select().from(journalLines).where(inArray(journalLines.entryId, entries.map((e) => e.id))).orderBy(asc(journalLines.id)) : []
    return entries.map((e) => ({ ...e, lines: lines.filter((l) => l.entryId === e.id) }))
  }

  async entry(id: string) {
    const [e] = await this.db.select().from(journalEntries).where(eq(journalEntries.id, id))
    if (!e) throw notFound({ ar: 'القيد', en: 'Entry' })
    const lines = await this.db.select().from(journalLines).where(eq(journalLines.entryId, id)).orderBy(asc(journalLines.id))
    return { ...e, lines }
  }

  async manualEntry(user: AuthUser, b: z.infer<typeof manualEntryBody>) {
    const limited = scopeOffice(user)
    if (limited && b.lines.some((l) => l.officeId !== limited)) throw forbidden({ ar: 'يمكنك القيد على مكتبك فقط', en: 'You can only post to your own office' })
    return this.db.transaction(async (tx) => {
      // Staff advances are only moved by issuing and settling advances, so the books match the advances list.
      const adv = await ledgerAccount(tx, 'advances')
      if (b.lines.some((l) => l.account === adv))
        throw unprocessable('MANUAL_CONTROL_ACCOUNT', { ar: 'حساب العهد يتحرك فقط من شاشة العهد', en: 'The staff advances account only moves through advances' })
      // Expense charged to a budget line by hand still has to fit under its ceiling.
      const exp = new Set((await tx.select({ code: accounts.code }).from(accounts).where(eq(accounts.type, 'expense'))).map((a) => a.code))
      const net = new Map<string, number>()
      for (const l of b.lines) if (l.budgetLineId && exp.has(l.account)) net.set(l.budgetLineId, (net.get(l.budgetLineId) ?? 0) + toCents(l.debit) - toCents(l.credit))
      for (const [lineId, amount] of net) {
        if (amount <= 0) continue
        const [bl] = await tx.select({ projectId: budgetLines.projectId }).from(budgetLines).where(eq(budgetLines.id, lineId))
        if (!bl) throw notFound({ ar: 'البند', en: 'Budget line' })
        await lockProject(tx, bl.projectId)
        const c = checkCeiling(await projectUsage(tx, bl.projectId), lineId, amount)
        if (c.verdict !== 'ok') throw unprocessable('CEILING_EXCEEDED', { ar: 'القيد يتجاوز سقف البند', en: 'This entry would take the budget line over its ceiling' }, checkJson(c))
      }
      const e = await post(tx, user, {
        date: b.date,
        memo: b.memo,
        source: 'manual',
        ref: b.ref,
        lines: b.lines.map((l) => ({ ...l, debit: toCents(l.debit), credit: toCents(l.credit), sdg: l.sdg === undefined ? null : toCents(l.sdg) })),
      })
      await audit(tx, user, 'journal.manual', 'journal_entry', e.id, { no: e.no })
      return e
    })
  }

  /** Posts the mirror image of an entry. The original stays, so the audit trail is complete. */
  async reverse(user: AuthUser, id: string, b: z.infer<typeof reverseBody>) {
    return this.db.transaction(async (tx) => {
      const [orig] = await tx.select().from(journalEntries).where(eq(journalEntries.id, id))
      if (!orig) throw notFound({ ar: 'القيد', en: 'Entry' })
      if (orig.source === 'reversal') throw unprocessable('REVERSE_REVERSAL', { ar: 'لا يمكن عكس قيد عكسي', en: 'A reversal cannot be reversed' })
      // Entries created by vouchers, advances, payroll or stock moves are corrected through those documents,
      // so the document and the books never disagree.
      if (!['manual', 'opening', 'fx'].includes(orig.source))
        throw unprocessable('REVERSE_VIA_DOCUMENT', { ar: 'هذا القيد ناتج عن مستند؛ يُصحَّح من المستند نفسه', en: 'This entry comes from a document; correct it through that document' })
      const [already] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.reversalOfId, orig.id))
      if (already) throw conflict('ALREADY_REVERSED', { ar: 'القيد معكوس مسبقاً', en: 'This entry is already reversed' })
      const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, id))
      const e = await post(tx, user, {
        date: b.date ?? today(),
        memo: `Reversal of ${orig.no}: ${b.reason}`,
        source: 'reversal',
        ref: orig.no,
        reversalOfId: orig.id,
        lines: lines.map((l) => ({
          account: l.accountCode,
          debit: toCents(l.credit),
          credit: toCents(l.debit),
          sdg: l.sdg === null ? null : -toCents(l.sdg),
          officeId: l.officeId,
          projectId: l.projectId,
          budgetLineId: l.budgetLineId,
          activityId: l.activityId,
        })),
      })
      await audit(tx, user, 'journal.reverse', 'journal_entry', orig.id, { reversal: e.no, reason: b.reason })
      return e
    })
  }
}
