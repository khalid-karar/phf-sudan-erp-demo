import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import { checkCeiling, checkJson, projectUsage } from '../budget/usage'
import { nextNo } from '../common/numbering'
import { lockProject } from '../budget/budget.service'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { accounts, activities, advanceItems, advances, budgetLines, fieldReports, spendRequests, users, vouchers } from '../db/schema'
import { fromCents, sdgToUsd, sumCents, toCents, toRate4, usdToSdg } from '../lib/money'
import type { payBody, receiptBody, settleBody } from './ledger.schemas'
import { hqOfficeId, ledgerAccount, post } from './posting'
import { rateOn, today } from './rates'

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)

@Injectable()
export class PaymentsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** A cash box or bank account (child of the configured cash_boxes / banks headers). */
  private async moneyAccount(tx: DbOrTx, code: string, kind: 'cash' | 'bank' | 'any') {
    const [a] = await tx.select().from(accounts).where(eq(accounts.code, code))
    if (!a || !a.postable || !a.active) throw unprocessable('BAD_MONEY_ACCOUNT', { ar: 'حساب النقدية أو البنك غير صالح', en: 'Not a usable cash or bank account' })
    const parents = kind === 'any' ? [await ledgerAccount(tx, 'cash_boxes'), await ledgerAccount(tx, 'banks')] : [await ledgerAccount(tx, kind === 'cash' ? 'cash_boxes' : 'banks')]
    if (!a.parentCode || !parents.includes(a.parentCode))
      throw unprocessable('BAD_MONEY_ACCOUNT', { ar: kind === 'cash' ? 'اختر صندوق نقدية' : 'اختر حساباً بنكياً', en: kind === 'cash' ? 'Choose a cash box' : 'Choose a bank account' })
    return a
  }

  private async officeCashBox(tx: DbOrTx, officeId: string) {
    const parent = await ledgerAccount(tx, 'cash_boxes')
    const [a] = await tx.select().from(accounts).where(and(eq(accounts.parentCode, parent), eq(accounts.officeId, officeId), eq(accounts.active, true)))
    if (!a) throw unprocessable('NO_CASH_BOX', { ar: 'لا يوجد صندوق نقدية لهذا المكتب', en: 'This office has no cash box account' }, { officeId })
    return a
  }

  // ─── Payments ─────────────────────────────────────────────────────────────

  /**
   * Pays an approved request. Cash/bank: Dr the line's expense account, Cr the cash box or bank.
   * Advance: Dr staff advances, Cr the office cash box; the expense is booked at settlement.
   */
  async pay(user: AuthUser, requestId: string, b: z.infer<typeof payBody>) {
    return this.db.transaction(async (tx) => {
      const [req] = await tx.select().from(spendRequests).where(eq(spendRequests.id, requestId)).for('update')
      if (!req) throw notFound({ ar: 'الطلب', en: 'Request' })
      if (req.status !== 'approved') throw conflict('NOT_APPROVED', { ar: 'لا يُدفع إلا الطلب المعتمد نهائياً', en: 'Only fully approved requests can be paid' }, { status: req.status })
      const limited = scopeOffice(user)
      if (limited && req.officeId !== limited) throw forbidden({ ar: 'الطلب لا يتبع مكتبك', en: 'This request belongs to another office' })
      await lockProject(tx, req.projectId)
      const [line] = await tx.select().from(budgetLines).where(eq(budgetLines.id, req.lineId))
      const date = b.date ?? today()
      const rate = await rateOn(tx, date)
      const r4 = toRate4(rate)

      const account =
        b.method === 'cash' || b.method === 'advance'
          ? b.accountCode
            ? await this.moneyAccount(tx, b.accountCode, 'cash')
            : await this.officeCashBox(tx, req.officeId)
          : b.accountCode
            ? await this.moneyAccount(tx, b.accountCode, 'bank')
            : (() => {
                throw unprocessable('ACCOUNT_REQUIRED', { ar: 'اختر الحساب البنكي', en: 'Choose the bank account' })
              })()
      if (limited && account.officeId && account.officeId !== limited) throw forbidden({ ar: 'ادفع من صندوق مكتبك', en: 'Pay from your own office’s accounts' })

      // What leaves the account, in its own currency, and its USD value at today's rate.
      const reqAmount = toCents(req.amount)
      const usd = req.currency === 'USD' ? reqAmount : sdgToUsd(reqAmount, r4)
      const sdgOut = account.currency === 'SDG' ? (req.currency === 'SDG' ? reqAmount : usdToSdg(reqAmount, r4)) : null
      const dims = { officeId: req.officeId, projectId: req.projectId, budgetLineId: req.lineId, activityId: req.activityId }

      // An SDG request reserved its USD value on the request date. If the pound has strengthened
      // since, paying costs more dollars: the extra must still fit under the ceiling.
      const extra = usd - toCents(req.amountUsd)
      if (extra > 0) {
        const c = checkCeiling(await projectUsage(tx, req.projectId), req.lineId, extra)
        if (c.verdict !== 'ok')
          throw unprocessable('RATE_MOVED_OVER_CEILING', { ar: 'تغيّر سعر الصرف فأصبح المبلغ يتجاوز سقف البند', en: 'The exchange rate has moved and the payment would now exceed the line ceiling' }, checkJson(c))
      }
      const pvNo = await nextNo(tx, 'PV')

      let advanceId: string | null = null
      let entry
      if (b.method === 'advance') {
        if (!req.activityId)
          throw unprocessable('ACTIVITY_REQUIRED', { ar: 'العهدة تُصرف لنشاط محدد حتى تُسوّى بتقريره الفني', en: 'An advance must be tied to an activity so it can be settled against its field report' })
        const holder = b.holderUserId ? (await tx.select().from(users).where(eq(users.id, b.holderUserId)))[0] : undefined
        const holderName = b.party?.trim() || holder?.nameEn
        if (!holderName) throw unprocessable('HOLDER_REQUIRED', { ar: 'حدد الموظف المستلم للعهدة', en: 'Name the staff member receiving the advance' })
        const advNo = await nextNo(tx, 'ADV')
        entry = await post(tx, user, {
          date,
          memo: `Advance ${advNo} — ${req.code}`,
          source: 'advance',
          ref: advNo,
          lines: [
            { account: await ledgerAccount(tx, 'advances'), debit: usd, ...dims },
            { account: account.code, credit: usd, sdg: sdgOut === null ? null : -sdgOut, officeId: account.officeId ?? req.officeId },
          ],
        })
        const [adv] = await tx
          .insert(advances)
          .values({
            no: advNo,
            holderName,
            holderUserId: holder?.id ?? null,
            officeId: req.officeId,
            projectId: req.projectId,
            lineId: req.lineId,
            activityId: req.activityId,
            requestId: req.id,
            amountUsd: fromCents(usd),
            currency: account.currency,
            amount: fromCents(account.currency === 'SDG' ? sdgOut! : usd),
            issueRate: account.currency === 'SDG' ? rate : null,
            dueAt: b.dueDate ?? addDays(date, 14),
            issueEntryId: entry.id,
          })
          .returning()
        advanceId = adv.id
      } else {
        if (!line.expenseAccountCode)
          throw unprocessable('LINE_NOT_MAPPED', { ar: 'البند غير مربوط بحساب مصروفات في دليل الحسابات', en: 'The budget line is not mapped to an expense account' }, { lineId: line.id })
        entry = await post(tx, user, {
          date,
          memo: `${req.code} — ${line.code} ${line.nameEn}`,
          source: 'payment',
          ref: pvNo,
          lines: [
            { account: line.expenseAccountCode, debit: usd, ...dims },
            { account: account.code, credit: usd, sdg: sdgOut === null ? null : -sdgOut, officeId: account.officeId ?? req.officeId },
          ],
        })
      }

      const [v] = await tx
        .insert(vouchers)
        .values({
          no: pvNo,
          kind: 'payment',
          date,
          method: b.method,
          accountCode: account.code,
          currency: req.currency,
          amount: req.amount,
          rate,
          amountUsd: fromCents(usd),
          party: b.party?.trim() || (b.method === 'advance' ? 'Staff advance' : 'Supplier'),
          memo: req.purpose,
          officeId: req.officeId,
          projectId: req.projectId,
          lineId: req.lineId,
          requestId: req.id,
          journalEntryId: entry.id,
          createdById: user.id,
        })
        .returning()
      await tx.update(spendRequests).set({ status: 'paid' }).where(eq(spendRequests.id, req.id))
      await audit(tx, user, 'voucher.pay', 'voucher', v.id, { request: req.code, method: b.method, usd: fromCents(usd), entry: entry.no, advanceId })
      return { voucher: v, entry, advanceId }
    })
  }

  /** Money received (grant, donation): Dr cash/bank, Cr a revenue account. */
  async receipt(user: AuthUser, b: z.infer<typeof receiptBody>) {
    const limited = scopeOffice(user)
    if (limited && b.officeId && b.officeId !== limited) throw forbidden({ ar: 'يمكنك التسجيل لمكتبك فقط', en: 'You can only record receipts for your own office' })
    return this.db.transaction(async (tx) => {
      const acc = await this.moneyAccount(tx, b.accountCode, 'any')
      const [rev] = await tx.select().from(accounts).where(eq(accounts.code, b.revenueAccountCode))
      if (!rev || rev.type !== 'revenue') throw unprocessable('NOT_REVENUE_ACCOUNT', { ar: 'اختر حساب إيرادات', en: 'Choose a revenue account' })
      const date = b.date ?? today()
      const r4 = toRate4(await rateOn(tx, date))
      const amount = toCents(b.amount)
      const usd = b.currency === 'USD' ? amount : sdgToUsd(amount, r4)
      const sdgIn = acc.currency === 'SDG' ? (b.currency === 'SDG' ? amount : usdToSdg(amount, r4)) : null
      if (limited && acc.officeId !== limited) throw forbidden({ ar: 'استخدم حسابات مكتبك', en: 'Use your own office’s accounts' })
      const officeId = b.officeId ?? limited ?? acc.officeId ?? (await hqOfficeId(tx))
      const rvNo = await nextNo(tx, 'RV')
      const entry = await post(tx, user, {
        date,
        memo: b.memo,
        source: 'receipt',
        ref: rvNo,
        lines: [
          { account: acc.code, debit: usd, sdg: sdgIn, officeId: acc.officeId ?? officeId, projectId: b.projectId ?? null },
          { account: rev.code, credit: usd, officeId, projectId: b.projectId ?? null },
        ],
      })
      const [v] = await tx
        .insert(vouchers)
        .values({
          no: rvNo,
          kind: 'receipt',
          date,
          method: 'transfer',
          accountCode: acc.code,
          currency: b.currency,
          amount: b.amount,
          rate: await rateOn(tx, date),
          amountUsd: fromCents(usd),
          party: b.party,
          memo: b.memo,
          officeId,
          projectId: b.projectId ?? null,
          journalEntryId: entry.id,
          createdById: user.id,
        })
        .returning()
      await audit(tx, user, 'voucher.receipt', 'voucher', v.id, { usd: fromCents(usd), entry: entry.no })
      return { voucher: v, entry }
    })
  }

  async listVouchers(user: AuthUser, q: { kind?: 'payment' | 'receipt'; officeId?: string; limit?: number }) {
    const where: SQL[] = []
    const limited = scopeOffice(user)
    if (limited) where.push(eq(vouchers.officeId, limited))
    else if (q.officeId) where.push(eq(vouchers.officeId, q.officeId))
    if (q.kind) where.push(eq(vouchers.kind, q.kind))
    return this.db.select().from(vouchers).where(where.length ? and(...where) : undefined).orderBy(desc(vouchers.date), desc(vouchers.no)).limit(q.limit ?? 200)
  }

  /** Approved requests waiting to be paid. */
  async awaitingPayment(user: AuthUser) {
    const limited = scopeOffice(user)
    return this.db
      .select()
      .from(spendRequests)
      .where(and(eq(spendRequests.status, 'approved'), limited ? eq(spendRequests.officeId, limited) : undefined))
      .orderBy(asc(spendRequests.decidedAt))
  }

  // ─── Advances ─────────────────────────────────────────────────────────────

  async listAdvances(user: AuthUser, status?: 'open' | 'settled') {
    const limited = scopeOffice(user)
    const rows = await this.db
      .select({ a: advances, reportNo: fieldReports.no, activityCode: activities.code })
      .from(advances)
      .leftJoin(activities, eq(activities.id, advances.activityId))
      .leftJoin(fieldReports, eq(fieldReports.activityId, advances.activityId))
      .where(and(status ? eq(advances.status, status) : undefined, limited ? eq(advances.officeId, limited) : undefined))
      .orderBy(asc(advances.dueAt))
    const now = today()
    return rows.map((r) => ({
      ...r.a,
      activityCode: r.activityCode,
      fieldReportNo: r.reportNo,
      canSettle: r.a.status === 'open' && !!r.reportNo,
      overdue: r.a.status === 'open' && r.a.dueAt < now,
    }))
  }

  async getAdvance(user: AuthUser, id: string) {
    const [a] = await this.db.select().from(advances).where(eq(advances.id, id))
    const limited = scopeOffice(user)
    if (!a || (limited && a.officeId !== limited)) throw notFound({ ar: 'العهدة', en: 'Advance' })
    const items = await this.db.select().from(advanceItems).where(eq(advanceItems.advanceId, id))
    return { ...a, items }
  }

  /**
   * Settles an advance against receipts — only once the activity's field report is in, so the
   * technical and financial reports are matched here.
   *
   * Receipts and change are counted in the currency the cash was handed out in. For an SDG
   * advance the expense is valued at the issue rate (the dollars that actually left the books),
   * the change goes back into the cash box as the exact pounds returned, and any top-up paid to
   * the staff member is valued at today's rate. Month-end revaluation then takes care of the box.
   *
   *   Dr expense (line)          spent
   *   Dr cash box                change returned        (if under-spent)
   *       Cr staff advances      book value of the advance
   *       Cr cash box            top-up paid out        (if over-spent)
   */
  async settle(user: AuthUser, id: string, b: z.infer<typeof settleBody>) {
    return this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(advances).where(eq(advances.id, id)).for('update')
      const limited = scopeOffice(user)
      if (!a || (limited && a.officeId !== limited)) throw notFound({ ar: 'العهدة', en: 'Advance' })
      if (a.status !== 'open') throw conflict('ALREADY_SETTLED', { ar: 'العهدة مُسوّاة مسبقاً', en: 'This advance is already settled' })
      await lockProject(tx, a.projectId)
      const [report] = a.activityId ? await tx.select().from(fieldReports).where(eq(fieldReports.activityId, a.activityId)) : []
      if (!report)
        throw unprocessable('REPORT_REQUIRED', { ar: 'لا تُسوّى العهدة قبل رفع التقرير الفني للنشاط', en: 'The activity’s field report must be in before the advance can be settled' })
      const [line] = await tx.select().from(budgetLines).where(eq(budgetLines.id, a.lineId))
      if (!line.expenseAccountCode) throw unprocessable('LINE_NOT_MAPPED', { ar: 'البند غير مربوط بحساب مصروفات', en: 'The budget line is not mapped to an expense account' })

      const date = b.date ?? today()
      const sdgAdvance = a.currency === 'SDG'
      const nowR4 = sdgAdvance ? toRate4(await rateOn(tx, date)) : 0
      const toUsdNow = (c: number) => (sdgAdvance ? sdgToUsd(c, nowR4) : c)

      const book = toCents(a.amountUsd)
      const handedOut = toCents(a.amount) // in the advance currency
      const spent = sumCents(b.items.map((i) => toCents(i.amount)))
      const change = Math.max(0, handedOut - spent)
      const topUp = Math.max(0, spent - handedOut)
      // The change is the same share of the advance's book value as of the cash handed out.
      const changeUsd = handedOut > 0 ? Number((BigInt(book) * BigInt(change) * 2n + BigInt(handedOut)) / (2n * BigInt(handedOut))) : 0
      const topUpUsd = toUsdNow(topUp)
      const expenseUsd = book - changeUsd + topUpUsd

      // A top-up is new spending on the line: it must fit under the ceiling.
      if (topUpUsd > 0) {
        const c = checkCeiling(await projectUsage(tx, a.projectId), a.lineId, topUpUsd)
        if (c.verdict !== 'ok')
          throw unprocessable('CEILING_EXCEEDED', { ar: 'المصروف الزائد عن العهدة يتجاوز سقف البند — قدّم طلب صرف إضافياً', en: 'Spending above the advance would exceed the line ceiling — raise an additional request' }, checkJson(c))
      }

      const cash = await this.officeCashBox(tx, a.officeId)
      if (cash.currency !== a.currency) throw unprocessable('CASH_BOX_CURRENCY', { ar: 'عملة صندوق المكتب تختلف عن عملة العهدة', en: 'The office cash box is in a different currency from the advance' })
      const dims = { officeId: a.officeId, projectId: a.projectId, budgetLineId: a.lineId, activityId: a.activityId }

      const entry = await post(tx, user, {
        date,
        memo: `Settlement of advance ${a.no}`,
        source: 'settlement',
        ref: a.no,
        lines: [
          { account: line.expenseAccountCode, debit: expenseUsd, ...dims },
          { account: cash.code, debit: changeUsd, sdg: sdgAdvance ? change : null, officeId: a.officeId },
          { account: await ledgerAccount(tx, 'advances'), credit: book, ...dims },
          { account: cash.code, credit: topUpUsd, sdg: sdgAdvance ? -topUp : null, officeId: a.officeId },
        ],
      })
      if (b.items.length) await tx.insert(advanceItems).values(b.items.map((i) => ({ advanceId: a.id, description: i.description, receiptNo: i.receiptNo ?? null, amount: i.amount })))
      await tx
        .update(advances)
        .set({ status: 'settled', settledAt: new Date(), spent: fromCents(spent), spentUsd: fromCents(expenseUsd), returnedUsd: fromCents(changeUsd), reimbursedUsd: fromCents(topUpUsd), reportId: report.id, settleEntryId: entry.id })
        .where(eq(advances.id, a.id))
      await audit(tx, user, 'advance.settle', 'advance', a.id, { currency: a.currency, spent: fromCents(spent), change: fromCents(change), topUp: fromCents(topUp), expenseUsd: fromCents(expenseUsd), report: report.no, entry: entry.no })
      return { ...(await this.getAdvanceTx(tx, a.id)), entry }
    })
  }

  private async getAdvanceTx(tx: DbOrTx, id: string) {
    const [a] = await tx.select().from(advances).where(eq(advances.id, id))
    const items = await tx.select().from(advanceItems).where(eq(advanceItems.advanceId, id))
    return { ...a, items }
  }

  /** Cash boxes and banks with USD and SDG balances. */
  async cashPosition(user: AuthUser) {
    const limited = scopeOffice(user)
    const parents = [await ledgerAccount(this.db, 'cash_boxes'), await ledgerAccount(this.db, 'banks')]
    const r = await this.db.execute<{ code: string; name_ar: string; name_en: string; currency: string; office_id: string | null; parent_code: string; usd: string; sdg: string | null }>(sql`
      select a.code, a.name_ar, a.name_en, a.currency, a.office_id, a.parent_code,
        coalesce(sum(jl.debit - jl.credit), 0) as usd, sum(jl.sdg) as sdg
      from accounts a left join journal_lines jl on jl.account_code = a.code
      where a.parent_code in (${sql.join(parents.map((p) => sql`${p}`), sql`, `)}) and a.postable
        ${limited ? sql`and a.office_id = ${limited}` : sql``}
      group by a.code order by a.code`)
    return r.rows.map((x) => ({ ...x, kind: x.parent_code === parents[0] ? 'cash' : 'bank', sdg: x.currency === 'SDG' ? (x.sdg ?? '0.00') : null }))
  }
}
