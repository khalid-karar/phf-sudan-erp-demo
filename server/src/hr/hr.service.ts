import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { can, scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import { nextNo } from '../common/numbering'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { accounts, budgetLines, employeeAllocations, employees, journalLines, leaveRequests, offices, orgSettings, payrollRuns, users } from '../db/schema'
import { lockProject } from '../budget/budget.service'
import { checkCeiling, checkJson, projectUsage } from '../budget/usage'
import { hqOfficeId, ledgerAccount, post, type PostLine } from '../ledger/posting'
import { rateOn } from '../ledger/rates'
import { fromCents, toCents } from '../lib/money'
import { computePayroll, inclusiveDays, periodEnd, periodStart, type PayrollCalc } from './payroll'
import type { employeeBody, employeePatch, employeeQuery, leaveBody, leaveDecision, leaveQuery, payrollBody, voidBody } from './hr.schemas'

const today = () => new Date().toISOString().slice(0, 10)
type Emp = typeof employees.$inferSelect

@Injectable()
export class HrService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ─── helpers ───────────────────────────────────────────────────────────────

  /** Salaries are visible to people who can edit HR records, not to everyone who can view the list. */
  private canSeeSalary = (u: AuthUser) => can(u, 'hr', 'edit')

  private async shape(db: DbOrTx, user: AuthUser, rows: Emp[]) {
    if (!rows.length) return []
    const ids = rows.map((r) => r.id)
    const allocs = await db.select().from(employeeAllocations).where(inArray(employeeAllocations.employeeId, ids))
    const away = await db
      .select({ employeeId: leaveRequests.employeeId })
      .from(leaveRequests)
      .where(and(inArray(leaveRequests.employeeId, ids), eq(leaveRequests.status, 'approved'), sql`${leaveRequests.fromDate} <= current_date and ${leaveRequests.toDate} >= current_date`))
    const onLeave = new Set(away.map((a) => a.employeeId))
    const seeSalary = this.canSeeSalary(user)
    return rows.map((e) => ({
      ...e,
      salarySdg: seeSalary ? e.salarySdg : null,
      status: e.status === 'ended' ? 'ended' : onLeave.has(e.id) ? 'on_leave' : 'active',
      allocations: allocs.filter((a) => a.employeeId === e.id).map(({ projectId, lineId, pct }) => ({ projectId, lineId, pct })),
    }))
  }

  private async loadEmployee(db: DbOrTx, user: AuthUser, id: string, lock = false) {
    const q = db.select().from(employees).where(eq(employees.id, id))
    const [e] = lock ? await q.for('update') : await q
    const limited = scopeOffice(user)
    if (!e || (limited && e.officeId !== limited)) throw notFound({ ar: 'الموظف', en: 'Employee' })
    return e
  }

  private async checkAllocations(tx: DbOrTx, list: { lineId: string; pct: number }[]) {
    if (new Set(list.map((a) => a.lineId)).size !== list.length) throw unprocessable('DUPLICATE_LINE', { ar: 'البند مكرر في الحصص', en: 'A budget line appears twice in the allocations' })
    if (list.reduce((t, a) => t + a.pct, 0) > 100) throw unprocessable('ALLOCATION_OVER_100', { ar: 'مجموع حصص المشاريع يتجاوز 100٪', en: 'Project shares add up to more than 100%' })
    if (!list.length) return []
    const ls = await tx.select({ id: budgetLines.id, projectId: budgetLines.projectId }).from(budgetLines).where(inArray(budgetLines.id, list.map((a) => a.lineId)))
    if (ls.length !== list.length) throw notFound({ ar: 'بند الميزانية', en: 'Budget line' })
    return list.map((a) => ({ projectId: ls.find((l) => l.id === a.lineId)!.projectId, lineId: a.lineId, pct: a.pct }))
  }

  private async checkUserLink(tx: DbOrTx, userId: string | null | undefined, exceptEmployeeId?: string) {
    if (!userId) return
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId))
    if (!u) throw notFound({ ar: 'المستخدم', en: 'User' })
    const [other] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.userId, userId), exceptEmployeeId ? ne(employees.id, exceptEmployeeId) : undefined))
    if (other) throw conflict('USER_ALREADY_LINKED', { ar: 'هذا المستخدم مرتبط بموظف آخر', en: 'That user is already linked to another employee' })
  }

  private async assertOffice(tx: DbOrTx, officeId: string) {
    const [o] = await tx.select({ id: offices.id }).from(offices).where(eq(offices.id, officeId))
    if (!o) throw notFound({ ar: 'المكتب', en: 'Office' })
  }

  // ─── employees ─────────────────────────────────────────────────────────────

  async list(user: AuthUser, q: z.infer<typeof employeeQuery>) {
    const where: SQL[] = []
    const limited = scopeOffice(user)
    if (limited) where.push(eq(employees.officeId, limited))
    else if (q.officeId) where.push(eq(employees.officeId, q.officeId))
    if (q.status) where.push(eq(employees.status, q.status))
    if (q.department) where.push(eq(employees.department, q.department))
    if (q.q) where.push(sql`(${employees.nameAr} ilike ${'%' + q.q + '%'} or ${employees.nameEn} ilike ${'%' + q.q + '%'} or ${employees.no} ilike ${'%' + q.q + '%'})`)
    const rows = await this.db.select().from(employees).where(where.length ? and(...where) : undefined).orderBy(asc(employees.no))
    return this.shape(this.db, user, rows)
  }

  async get(user: AuthUser, id: string) {
    const e = await this.loadEmployee(this.db, user, id)
    return (await this.shape(this.db, user, [e]))[0]
  }

  /** The signed-in user's own employee record, if they have one. */
  async me(user: AuthUser) {
    const [e] = await this.db.select().from(employees).where(eq(employees.userId, user.id))
    if (!e) return null
    return (await this.shape(this.db, { ...user, permissions: { ...user.permissions, hr: 'manage' } }, [e]))[0]
  }

  async create(user: AuthUser, b: z.infer<typeof employeeBody>) {
    const limited = scopeOffice(user)
    if (limited && b.officeId !== limited) throw forbidden({ ar: 'يمكنك إضافة موظفين لمكتبك فقط', en: 'You can only add employees to your own office' })
    if (b.endDate && b.endDate < b.startDate) throw unprocessable('BAD_DATES', { ar: 'تاريخ النهاية قبل البداية', en: 'The end date is before the start date' })
    return this.db.transaction(async (tx) => {
      await this.assertOffice(tx, b.officeId)
      await this.checkUserLink(tx, b.userId)
      const allocs = await this.checkAllocations(tx, b.allocations)
      const no = b.no ?? (await nextNo(tx, 'EMP'))
      const { allocations: _a, ...rest } = b
      const [dup] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.no, no))
      if (dup) throw conflict('EMPLOYEE_NO_EXISTS', { ar: 'رقم الموظف مستخدم', en: 'This employee number is already used' })
      const [e] = await tx.insert(employees).values({ ...rest, no, endDate: b.endDate ?? null, phone: b.phone ?? null, userId: b.userId ?? null }).returning()
      if (allocs.length) await tx.insert(employeeAllocations).values(allocs.map((a) => ({ ...a, employeeId: e.id })))
      await audit(tx, user, 'employee.create', 'employee', e.id, { no })
      return (await this.shape(tx, user, [e]))[0]
    })
  }

  async update(user: AuthUser, id: string, b: z.infer<typeof employeePatch>) {
    return this.db.transaction(async (tx) => {
      const cur = await this.loadEmployee(tx, user, id, true)
      const limited = scopeOffice(user)
      if (b.officeId) {
        if (limited && b.officeId !== limited) throw forbidden()
        await this.assertOffice(tx, b.officeId)
      }
      if (b.userId !== undefined) await this.checkUserLink(tx, b.userId, id)
      if (b.endDate && b.endDate < cur.startDate) throw unprocessable('BAD_DATES', { ar: 'تاريخ النهاية قبل البداية', en: 'The end date is before the start date' })
      const { allocations, ...rest } = b
      if (Object.keys(rest).length) await tx.update(employees).set(rest).where(eq(employees.id, id))
      if (allocations) {
        const rows = await this.checkAllocations(tx, allocations)
        await tx.delete(employeeAllocations).where(eq(employeeAllocations.employeeId, id))
        if (rows.length) await tx.insert(employeeAllocations).values(rows.map((a) => ({ ...a, employeeId: id })))
      }
      await audit(tx, user, 'employee.update', 'employee', id, { ...rest, salarySdg: rest.salarySdg !== undefined ? 'changed' : undefined, allocations: allocations ? 'replaced' : undefined })
      const [e] = await tx.select().from(employees).where(eq(employees.id, id))
      return (await this.shape(tx, user, [e]))[0]
    })
  }

  // ─── leave ─────────────────────────────────────────────────────────────────

  async listLeave(user: AuthUser, q: z.infer<typeof leaveQuery>) {
    const where: SQL[] = []
    const seeAll = can(user, 'hr', 'view')
    const limited = scopeOffice(user)
    if (!seeAll) {
      const mine = await this.db.select({ id: employees.id }).from(employees).where(eq(employees.userId, user.id))
      if (!mine.length) return []
      where.push(inArray(leaveRequests.employeeId, mine.map((m) => m.id)))
    } else if (limited) where.push(eq(employees.officeId, limited))
    else if (q.officeId) where.push(eq(employees.officeId, q.officeId))
    if (q.status) where.push(eq(leaveRequests.status, q.status))
    if (q.employeeId) where.push(eq(leaveRequests.employeeId, q.employeeId))
    return this.db
      .select({ leave: leaveRequests, employeeNo: employees.no, nameAr: employees.nameAr, nameEn: employees.nameEn, officeId: employees.officeId, balance: employees.leaveBalance })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(leaveRequests.createdAt))
  }

  async requestLeave(user: AuthUser, b: z.infer<typeof leaveBody>) {
    if (b.to < b.from) throw unprocessable('BAD_DATES', { ar: 'تاريخ النهاية قبل البداية', en: 'The end date is before the start date' })
    const days = inclusiveDays(b.from, b.to)
    if (days > 365) throw unprocessable('LEAVE_TOO_LONG', { ar: 'المدة أطول من سنة', en: 'The leave is longer than a year' })
    return this.db.transaction(async (tx) => {
      const own = (await tx.select().from(employees).where(eq(employees.userId, user.id)))[0]
      const employeeId = b.employeeId ?? own?.id
      if (!employeeId) throw unprocessable('NO_EMPLOYEE', { ar: 'حسابك غير مرتبط بسجل موظف', en: 'Your account is not linked to an employee record' })
      // Anyone can ask for their own leave; asking for someone else needs HR edit access.
      if (!(own && own.id === employeeId) && !can(user, 'hr', 'edit')) throw forbidden({ ar: 'يمكنك طلب إجازة لنفسك فقط', en: 'You can only request leave for yourself' })
      const e = await this.loadEmployee(tx, own && own.id === employeeId ? { ...user, scope: 'all' } : user, employeeId, true)
      if (e.status === 'ended') throw unprocessable('EMPLOYEE_ENDED', { ar: 'خدمة الموظف منتهية', en: 'This employee has left' })
      const [clash] = await tx
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.employeeId, employeeId), or(eq(leaveRequests.status, 'pending'), eq(leaveRequests.status, 'approved')), sql`${leaveRequests.fromDate} <= ${b.to} and ${leaveRequests.toDate} >= ${b.from}`))
        .limit(1)
      if (clash) throw conflict('LEAVE_OVERLAP', { ar: 'تتداخل مع إجازة أخرى', en: 'This overlaps another leave request' })
      const [l] = await tx.insert(leaveRequests).values({ employeeId, type: b.type, fromDate: b.from, toDate: b.to, days, note: b.note ?? null, requestedById: user.id }).returning()
      await audit(tx, user, 'leave.request', 'leave', l.id, { employeeId, days, type: b.type })
      return { ...l, balance: e.leaveBalance, short: b.type === 'annual' && days > e.leaveBalance }
    })
  }

  async decideLeave(user: AuthUser, id: string, b: z.infer<typeof leaveDecision>) {
    return this.db.transaction(async (tx) => {
      const [l] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id)).for('update')
      if (!l) throw notFound({ ar: 'طلب الإجازة', en: 'Leave request' })
      const e = await this.loadEmployee(tx, user, l.employeeId, true)
      if (e.userId === user.id) throw forbidden({ ar: 'لا يمكنك اعتماد إجازتك بنفسك', en: 'You cannot decide your own leave' })
      if (l.status !== 'pending') throw conflict('LEAVE_DECIDED', { ar: 'سبق البت في الطلب', en: 'This request has already been decided' })
      if (b.decision === 'reject' && !b.note) throw unprocessable('NOTE_REQUIRED', { ar: 'اكتب سبب الرفض', en: 'Please give a reason for rejecting' })
      if (b.decision === 'approve' && l.type === 'annual') {
        if (l.days > e.leaveBalance) throw unprocessable('INSUFFICIENT_LEAVE', { ar: `الرصيد (${e.leaveBalance}) أقل من المطلوب (${l.days})`, en: `The balance (${e.leaveBalance}) is less than the days requested (${l.days})` })
        await tx.update(employees).set({ leaveBalance: sql`${employees.leaveBalance} - ${l.days}` }).where(eq(employees.id, e.id))
      }
      const [u] = await tx
        .update(leaveRequests)
        .set({ status: b.decision === 'approve' ? 'approved' : 'rejected', decidedById: user.id, decidedAt: new Date(), decisionNote: b.note ?? null })
        .where(eq(leaveRequests.id, id))
        .returning()
      await audit(tx, user, `leave.${b.decision}`, 'leave', id, { employeeId: e.id })
      return u
    })
  }

  /** Withdraws a request, or a future approved leave (the days go back to the balance). */
  async cancelLeave(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [l] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id)).for('update')
      if (!l) throw notFound({ ar: 'طلب الإجازة', en: 'Leave request' })
      const [e] = await tx.select().from(employees).where(eq(employees.id, l.employeeId)).for('update')
      const own = e.userId === user.id
      if (!own && !can(user, 'hr', 'edit')) throw notFound({ ar: 'طلب الإجازة', en: 'Leave request' })
      const limited = scopeOffice(user)
      if (!own && limited && e.officeId !== limited) throw notFound({ ar: 'طلب الإجازة', en: 'Leave request' })
      if (l.status === 'approved') {
        if (l.fromDate <= today()) throw unprocessable('LEAVE_STARTED', { ar: 'بدأت الإجازة ولا يمكن إلغاؤها', en: 'This leave has already started' })
        if (l.type === 'annual') await tx.update(employees).set({ leaveBalance: sql`${employees.leaveBalance} + ${l.days}` }).where(eq(employees.id, e.id))
      } else if (l.status !== 'pending') throw conflict('LEAVE_DECIDED', { ar: 'لا يمكن إلغاء هذا الطلب', en: 'This request cannot be cancelled' })
      const [u] = await tx.update(leaveRequests).set({ status: 'cancelled', decidedById: user.id, decidedAt: new Date() }).where(eq(leaveRequests.id, id)).returning()
      await audit(tx, user, 'leave.cancel', 'leave', id, { employeeId: e.id })
      return u
    })
  }

  // ─── payroll ───────────────────────────────────────────────────────────────

  private payrollDate(period: string, date?: string) {
    const end = periodEnd(period)
    const t = today()
    if (periodStart(period) > t) throw unprocessable('PERIOD_IN_FUTURE', { ar: 'لا يمكن ترحيل رواتب شهر لم يبدأ', en: 'You cannot run payroll for a month that has not started' })
    if (date) {
      if (date < periodStart(period) || date > end) throw unprocessable('DATE_OUTSIDE_PERIOD', { ar: 'تاريخ الترحيل خارج الشهر', en: 'The posting date is outside the month' })
      if (date > t) throw unprocessable('FUTURE_DATE', { ar: 'لا يمكن استخدام تاريخ مستقبلي', en: 'The date cannot be in the future' })
      return date
    }
    return end < t ? end : t
  }

  private async deductionPct(tx: DbOrTx) {
    const [s] = await tx.select({ p: orgSettings.payrollDeductionPct }).from(orgSettings).limit(1)
    return s?.p ?? '8.00'
  }

  private calcJson(c: PayrollCalc, detail: boolean) {
    return {
      period: c.period,
      rate: (c.rate4 / 10_000).toFixed(4),
      deductionPct: c.deductionPct,
      headcount: c.rows.length,
      grossSdg: fromCents(c.grossSdg),
      deductionsSdg: fromCents(c.deductionSdg),
      netSdg: fromCents(c.netSdg),
      grossUsd: fromCents(c.grossUsd),
      employees: detail
        ? c.rows.map((r) => ({
            employeeId: r.employeeId, no: r.no, nameAr: r.nameAr, nameEn: r.nameEn, officeId: r.officeId,
            salarySdg: fromCents(r.salarySdg), payDays: r.payDays, unpaidLeaveDays: r.unpaidLeaveDays,
            grossSdg: fromCents(r.grossSdg), deductionSdg: fromCents(r.deductionSdg), netSdg: fromCents(r.netSdg),
          }))
        : undefined,
    }
  }

  /** Dry run: what the month's payroll would cost and which budget lines would carry it. */
  async previewPayroll(user: AuthUser, period: string) {
    const date = this.payrollDate(period)
    const rate = await rateOn(this.db, date)
    const c = await computePayroll(this.db, period, rate, await this.deductionPct(this.db))
    const checks = []
    const byProject = new Map<string, [string, number][]>()
    for (const [lineId, v] of c.byLine) byProject.set(v.projectId, [...(byProject.get(v.projectId) ?? []), [lineId, v.usd]])
    for (const [projectId, ls] of [...byProject].sort(([a], [b]) => a.localeCompare(b))) {
      const u = await projectUsage(this.db, projectId)
      for (const [lineId, usd] of ls) {
        const chk = checkCeiling(u, lineId, usd)
        checks.push({ lineId, projectId, chargeUsd: fromCents(usd), verdict: chk.verdict, shortfall: fromCents(chk.shortfall) })
        this.consume(u, lineId, usd)
      }
    }
    const [existing] = await this.db.select().from(payrollRuns).where(and(eq(payrollRuns.period, period), eq(payrollRuns.status, 'posted')))
    return { ...this.calcJson(c, this.canSeeSalary(user)), alreadyPosted: !!existing, lines: checks, blocked: checks.some((x) => x.verdict === 'blocked') }
  }

  /** Reduces what is left on a line, its pillar and its project, so later lines are checked against the running total. */
  private consume(u: Awaited<ReturnType<typeof projectUsage>>, lineId: string, usd: number) {
    const l = u.lines.get(lineId)!
    l.usage.available -= usd
    u.pillars.get(l.pillarId)!.available -= usd
    u.project.available -= usd
  }

  async listPayroll(user: AuthUser) {
    const rows = await this.db.select().from(payrollRuns).orderBy(desc(payrollRuns.period), desc(payrollRuns.postedAt))
    const see = this.canSeeSalary(user)
    return rows.map((r) => (see ? r : { ...r, detail: null }))
  }

  async postPayroll(user: AuthUser, b: z.infer<typeof payrollBody>) {
    const date = this.payrollDate(b.period, b.date)
    return this.db.transaction(async (tx) => {
      // One run per month: the lock makes two people pressing "post" at once take turns.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'payroll:' + b.period}))`)
      const [existing] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).where(and(eq(payrollRuns.period, b.period), eq(payrollRuns.status, 'posted')))
      if (existing) throw conflict('PAYROLL_EXISTS', { ar: `رواتب ${b.period} رُحّلت مسبقاً`, en: `Payroll for ${b.period} has already been posted` })
      const [acc] = await tx.select().from(accounts).where(eq(accounts.code, b.accountCode))
      if (!acc || acc.currency !== 'SDG' || acc.type !== 'asset' || !acc.postable || !acc.active)
        throw unprocessable('BAD_PAYROLL_ACCOUNT', { ar: 'اختر صندوقاً أو حساباً بنكياً بالجنيه', en: 'Choose an SDG cash box or bank account' })
      const rate = await rateOn(tx, date)
      const c = await computePayroll(tx, b.period, rate, await this.deductionPct(tx))
      if (!c.rows.length) throw unprocessable('NO_PAYROLL', { ar: 'لا توجد رواتب مستحقة في هذا الشهر', en: 'No salaries are due for this month' })

      // Every project share has to fit under its ceiling.
      const byProject = new Map<string, [string, number][]>()
      for (const [lineId, v] of c.byLine) byProject.set(v.projectId, [...(byProject.get(v.projectId) ?? []), [lineId, v.usd]])
      const blocked: unknown[] = []
      const extra: string[] = []
      for (const [projectId, ls] of [...byProject].sort(([a], [b2]) => a.localeCompare(b2))) {
        await lockProject(tx, projectId)
        const u = await projectUsage(tx, projectId)
        for (const [lineId, usd] of ls) {
          const chk = checkCeiling(u, lineId, usd)
          if (chk.verdict === 'blocked') blocked.push({ lineId, projectId, chargeUsd: fromCents(usd), ...checkJson(chk) })
          else if (chk.verdict === 'needs_extra_approval') extra.push(lineId)
          this.consume(u, lineId, usd)
        }
      }
      if (blocked.length)
        throw unprocessable('PAYROLL_CEILING', { ar: 'حصص الرواتب تتجاوز سقف بند أو أكثر؛ عدّل الحصص أو انقل مبلغاً بين البنود', en: 'Salary shares would take one or more budget lines over their ceiling; change the shares or move money between lines' }, blocked)

      const salAcc = await ledgerAccount(tx, 'salaries')
      const dedAcc = await ledgerAccount(tx, 'payroll_deductions')
      const hq = await hqOfficeId(tx)
      const grouped = new Map<string, PostLine>()
      for (const r of c.rows)
        for (const p of r.parts) {
          const key = `${r.officeId}|${p.projectId}|${p.lineId}`
          const g = grouped.get(key) ?? { account: salAcc, debit: 0, officeId: r.officeId, projectId: p.projectId, budgetLineId: p.lineId, memo: `Salaries ${b.period}` }
          g.debit = (g.debit ?? 0) + p.usd
          grouped.set(key, g)
        }
      const lines: PostLine[] = [...grouped.values()].filter((l) => (l.debit ?? 0) > 0)
      const bankUsd = c.grossUsd - c.deductionUsd
      lines.push({ account: dedAcc, credit: c.deductionUsd, officeId: hq, memo: 'Insurance withheld' })
      lines.push({ account: b.accountCode, credit: bankUsd, sdg: -c.netSdg, officeId: acc.officeId ?? hq, memo: `Net pay ${b.period}` })
      const entry = await post(tx, user, { date, memo: `Payroll ${b.period}`, source: 'payroll', ref: `PAY-${b.period}`, lines })
      const [run] = await tx
        .insert(payrollRuns)
        .values({
          period: b.period, date, rate, headcount: c.rows.length, grossSdg: fromCents(c.grossSdg), deductionsSdg: fromCents(c.deductionSdg), netSdg: fromCents(c.netSdg), grossUsd: fromCents(c.grossUsd),
          accountCode: b.accountCode, entryId: entry.id, postedById: user.id, detail: this.calcJson(c, true).employees,
        })
        .returning()
      await audit(tx, user, 'payroll.post', 'payroll_run', run.id, { period: b.period, entry: entry.no, grossUsd: fromCents(c.grossUsd) })
      return { ...run, entryNo: entry.no, overCeilingLines: extra }
    })
  }

  /** Cancels a posted month with a reversing entry, so it can be run again after a correction. */
  async voidPayroll(user: AuthUser, id: string, b: z.infer<typeof voidBody>) {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).for('update')
      if (!run) throw notFound({ ar: 'مسير الرواتب', en: 'Payroll run' })
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'payroll:' + run.period}))`)
      if (run.status !== 'posted') throw conflict('PAYROLL_VOIDED', { ar: 'المسير ملغى مسبقاً', en: 'This payroll run is already voided' })
      const date = b.date ?? today()
      if (date > today()) throw unprocessable('FUTURE_DATE', { ar: 'لا يمكن استخدام تاريخ مستقبلي', en: 'The date cannot be in the future' })
      const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, run.entryId))
      const e = await post(tx, user, {
        date,
        memo: `Reversal of payroll ${run.period}: ${b.reason}`,
        source: 'reversal',
        ref: `PAY-${run.period}`,
        reversalOfId: run.entryId,
        lines: lines.map((l) => ({ account: l.accountCode, debit: toCents(l.credit), credit: toCents(l.debit), sdg: l.sdg === null ? null : -toCents(l.sdg), officeId: l.officeId, projectId: l.projectId, budgetLineId: l.budgetLineId, activityId: l.activityId })),
      })
      const [u] = await tx.update(payrollRuns).set({ status: 'voided', voidEntryId: e.id, voidedAt: new Date(), voidReason: b.reason }).where(eq(payrollRuns.id, id)).returning()
      await audit(tx, user, 'payroll.void', 'payroll_run', id, { period: run.period, reversal: e.no, reason: b.reason })
      return u
    })
  }
}
