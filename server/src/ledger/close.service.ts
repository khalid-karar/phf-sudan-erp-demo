import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, unprocessable } from '../common/errors'
import { projectUsage, usageJson } from '../budget/usage'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { budgetLines, offices, periodCloses, projects } from '../db/schema'
import { fromCents, sdgToUsd, sumCents, toCents, toRate4 } from '../lib/money'
import { hqOfficeId, ledgerAccount, post } from './posting'
import { rateOn, today } from './rates'

const periodEnd = (p: string) => {
  const [y, m] = p.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

@Injectable()
export class CloseService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ─── FX revaluation ───────────────────────────────────────────────────────

  /** What revaluing SDG balances at the rate on `date` would post, per account. */
  async revaluationPreview(date = today(), db: DbOrTx = this.db) {
    const rate = await rateOn(db, date)
    const r4 = toRate4(rate)
    const r = await db.execute<{ code: string; name_en: string; name_ar: string; office_id: string | null; usd: string; sdg: string }>(sql`
      select a.code, a.name_en, a.name_ar, a.office_id, coalesce(sum(jl.debit - jl.credit), 0) as usd, coalesce(sum(jl.sdg), 0) as sdg
      from accounts a join journal_lines jl on jl.account_code = a.code join journal_entries je on je.id = jl.entry_id
      where a.currency = 'SDG' and je.date <= ${date}
      group by a.code order by a.code`)
    const rows = r.rows.map((x) => {
      const book = toCents(x.usd)
      const target = sdgToUsd(toCents(x.sdg), r4)
      return { code: x.code, nameAr: x.name_ar, nameEn: x.name_en, officeId: x.office_id, sdg: x.sdg, bookUsd: x.usd, revaluedUsd: fromCents(target), diff: target - book }
    })
    return { date, rate, rows: rows.filter((x) => x.diff !== 0), net: sumCents(rows.map((x) => x.diff)) }
  }

  async revalue(user: AuthUser, date = today()) {
    return this.db.transaction(async (tx) => {
      // Re-read inside the transaction with the ledger locked against concurrent revaluations.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fx-revaluation'))`)
      const p = await this.revaluationPreview(date, tx)
      if (!p.rows.length) throw unprocessable('NOTHING_TO_REVALUE', { ar: 'لا توجد فروق عملة للترحيل', en: 'There is no exchange difference to post' })
      const hq = await hqOfficeId(tx)
      const lines = p.rows.map((x) => ({ account: x.code, debit: x.diff > 0 ? x.diff : 0, credit: x.diff < 0 ? -x.diff : 0, sdg: 0, officeId: x.officeId ?? hq }))
      if (p.net < 0) lines.push({ account: await ledgerAccount(tx, 'fx_loss'), debit: -p.net, credit: 0, sdg: 0, officeId: hq })
      else lines.push({ account: await ledgerAccount(tx, 'fx_gain'), debit: 0, credit: p.net, sdg: 0, officeId: hq })
      const e = await post(tx, user, { date, memo: `Revaluation of SDG balances at ${p.rate}`, source: 'fx', ref: `FX-${date}`, lines })
      await audit(tx, user, 'fx.revalue', 'journal_entry', e.id, { rate: p.rate, net: fromCents(p.net) })
      return { entry: e, net: fromCents(p.net), rate: p.rate }
    })
  }

  // ─── Month close ──────────────────────────────────────────────────────────

  /** Per-office checklist for a month. An office can close when every check passes. */
  async status(period: string, db: DbOrTx = this.db) {
    const end = periodEnd(period)
    const os = await db.select().from(offices).where(eq(offices.active, true)).orderBy(asc(offices.id))
    const closes = await db.select().from(periodCloses).where(eq(periodCloses.period, period))
    const counts = await db.execute<{ office_id: string; overdue: number; unreported: number; awaiting_pay: number; sdg_accounts: number }>(sql`
      select o.id as office_id,
        (select count(*)::int from advances a where a.office_id = o.id and a.status = 'open' and a.due_at <= ${end}) as overdue,
        (select count(*)::int from journal_lines jl
           join journal_entries je on je.id = jl.entry_id
           join accounts ac on ac.code = jl.account_code
           left join field_reports fr on fr.activity_id = jl.activity_id
         where jl.office_id = o.id and je.period = ${period} and ac.type = 'expense'
           and jl.activity_id is not null and fr.id is null) as unreported,
        (select count(*)::int from spend_requests s where s.office_id = o.id and s.status = 'approved') as awaiting_pay,
        (select count(*)::int from accounts ac where ac.office_id = o.id and ac.currency = 'SDG' and ac.postable) as sdg_accounts
      from offices o where o.active`)
    // Revalued = nothing left to revalue for the office's SDG accounts as of the last day of the month.
    const hq = (await db.select({ id: offices.id }).from(offices).where(eq(offices.type, 'hq')))[0]?.id
    const pendingFx = new Set<string>()
    try {
      for (const row of (await this.revaluationPreview(end, db)).rows) pendingFx.add(row.officeId ?? hq ?? '')
    } catch {
      // No rate recorded up to that date: there is nothing to revalue.
    }
    const finished = end < today()
    return os.map((o) => {
      const c = counts.rows.find((x) => x.office_id === o.id)!
      const pc = closes.find((x) => x.officeId === o.id)
      const checks = {
        advancesSettled: c.overdue === 0,
        expensesReported: c.unreported === 0,
        cashCounted: !!pc?.cashCounted,
        revalued: c.sdg_accounts === 0 || !pendingFx.has(o.id),
        monthEnded: finished,
      }
      return {
        officeId: o.id,
        nameAr: o.nameAr,
        nameEn: o.nameEn,
        closed: !!pc?.closedAt,
        closedAt: pc?.closedAt ?? null,
        checks,
        counts: { overdueAdvances: c.overdue, unreportedExpenses: c.unreported, awaitingPayment: c.awaiting_pay },
        canClose: !pc?.closedAt && Object.values(checks).every(Boolean),
      }
    })
  }

  async setCashCounted(user: AuthUser, period: string, officeId: string, counted: boolean) {
    return this.db.transaction(async (tx) => {
      const [pc] = await tx.select().from(periodCloses).where(and(eq(periodCloses.period, period), eq(periodCloses.officeId, officeId)))
      if (pc?.closedAt) throw conflict('PERIOD_CLOSED', { ar: 'الشهر مُقفل', en: 'The month is closed' })
      await tx.insert(periodCloses).values({ period, officeId, cashCounted: counted }).onConflictDoUpdate({ target: [periodCloses.period, periodCloses.officeId], set: { cashCounted: counted } })
      await audit(tx, user, 'close.cash_counted', 'period_close', `${period}/${officeId}`, { counted })
      return { ok: true }
    })
  }

  async close(user: AuthUser, period: string, officeId: string) {
    return this.db.transaction(async (tx) => {
      // Exclusive lock: waits for postings to this office/month in flight, and holds new ones until we commit.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'close:' + period + ':' + officeId}))`)
      const s = (await this.status(period, tx)).find((x) => x.officeId === officeId)
      if (!s) throw unprocessable('UNKNOWN_OFFICE', { ar: 'المكتب غير موجود', en: 'Unknown office' })
      if (s.closed) throw conflict('PERIOD_CLOSED', { ar: 'الشهر مُقفل مسبقاً', en: 'Already closed' })
      if (!s.canClose) throw unprocessable('CLOSE_CHECKS_FAILED', { ar: 'لم تكتمل قائمة التحقق للإقفال', en: 'The close checklist is not complete' }, s)
      await tx
        .insert(periodCloses)
        .values({ period, officeId, cashCounted: true, closedAt: new Date(), closedById: user.id })
        .onConflictDoUpdate({ target: [periodCloses.period, periodCloses.officeId], set: { closedAt: new Date(), closedById: user.id } })
      await audit(tx, user, 'close.lock', 'period_close', `${period}/${officeId}`)
      return { ok: true }
    })
  }

  async reopen(user: AuthUser, period: string, officeId: string, reason: string) {
    if (!reason?.trim()) throw unprocessable('NOTE_REQUIRED', { ar: 'اكتب سبب إعادة الفتح', en: 'Give a reason for reopening' })
    return this.db.transaction(async (tx) => {
      await tx.update(periodCloses).set({ closedAt: null, closedById: null }).where(and(eq(periodCloses.period, period), eq(periodCloses.officeId, officeId)))
      await audit(tx, user, 'close.reopen', 'period_close', `${period}/${officeId}`, { reason })
      return { ok: true }
    })
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  async trialBalance(q: { to?: string; officeId?: string; projectId?: string }) {
    const r = await this.db.execute<{ code: string; name_ar: string; name_en: string; type: string; debit: string; credit: string }>(sql`
      select a.code, a.name_ar, a.name_en, a.type, coalesce(sum(jl.debit), 0) as debit, coalesce(sum(jl.credit), 0) as credit
      from journal_lines jl
        join journal_entries je on je.id = jl.entry_id
        join accounts a on a.code = jl.account_code
      where je.date <= ${q.to ?? '9999-12-31'}
        ${q.officeId ? sql`and jl.office_id = ${q.officeId}` : sql``}
        ${q.projectId ? sql`and jl.project_id = ${q.projectId}` : sql``}
      group by a.code order by a.code`)
    const rows = r.rows.map((x) => {
      const bal = toCents(x.debit) - toCents(x.credit)
      return { code: x.code, nameAr: x.name_ar, nameEn: x.name_en, type: x.type, debit: fromCents(bal > 0 ? bal : 0), credit: fromCents(bal < 0 ? -bal : 0) }
    })
    const td = sumCents(rows.map((x) => toCents(x.debit)))
    const tc = sumCents(rows.map((x) => toCents(x.credit)))
    // Filtered by office or project, only whole entries balance, so "balanced" is meaningful unfiltered.
    return { rows, totalDebit: fromCents(td), totalCredit: fromCents(tc), balanced: td === tc, filtered: !!(q.officeId || q.projectId) }
  }

  /** Revenue and expenses for a date range, by account. */
  async activities(q: { from?: string; to?: string; projectId?: string }) {
    const r = await this.db.execute<{ code: string; name_ar: string; name_en: string; type: string; amount: string }>(sql`
      select a.code, a.name_ar, a.name_en, a.type,
        case when a.type = 'revenue' then sum(jl.credit - jl.debit) else sum(jl.debit - jl.credit) end as amount
      from journal_lines jl join journal_entries je on je.id = jl.entry_id join accounts a on a.code = jl.account_code
      where a.type in ('revenue', 'expense') and je.date between ${q.from ?? '0001-01-01'} and ${q.to ?? '9999-12-31'}
        ${q.projectId ? sql`and jl.project_id = ${q.projectId}` : sql``}
      group by a.code order by a.code`)
    const rev = sumCents(r.rows.filter((x) => x.type === 'revenue').map((x) => toCents(x.amount)))
    const exp = sumCents(r.rows.filter((x) => x.type === 'expense').map((x) => toCents(x.amount)))
    return { rows: r.rows, revenue: fromCents(rev), expenses: fromCents(exp), surplus: fromCents(rev - exp) }
  }

  async budgetVsActual(projectId: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, projectId))
    if (!p) throw unprocessable('UNKNOWN_PROJECT', { ar: 'المشروع غير موجود', en: 'Unknown project' })
    const u = await projectUsage(this.db, projectId)
    const ls = await this.db.select({ id: budgetLines.id, account: budgetLines.expenseAccountCode }).from(budgetLines).where(eq(budgetLines.projectId, projectId))
    return {
      project: { id: p.id, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, usage: usageJson(u.project) },
      lines: [...u.lines.values()].map((l) => {
        const spentPct = l.usage.ceiling > 0 ? Math.round((l.usage.spent / l.usage.ceiling) * 1000) / 10 : 0
        return { id: l.id, code: l.code, nameAr: l.nameAr, nameEn: l.nameEn, pillarId: l.pillarId, expenseAccount: ls.find((x) => x.id === l.id)?.account ?? null, usage: usageJson(l.usage), spentPct }
      }),
    }
  }
}
