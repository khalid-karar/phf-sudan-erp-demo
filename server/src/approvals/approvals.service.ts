import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { AppError, conflict, forbidden, notFound, unprocessable } from '../common/errors'
import { nextNo } from '../common/numbering'
import { lockProject } from '../budget/budget.service'
import { checkCeiling, checkJson, projectUsage } from '../budget/usage'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { activities, approvalRules, approvalSteps, budgetLines, offices, reallocations, roles, spendRequests } from '../db/schema'
import { fromCents, sdgToUsd, toCents, toRate4 } from '../lib/money'
import { rateOn, today } from '../ledger/rates'
import type { listQuery, reallocationBody, requestBody, ruleBody } from './approvals.schemas'
import { routeApproval, ruleWarnings, type RuleLike } from './routing'

type Parent = { kind: 'request'; id: string } | { kind: 'reallocation'; id: string }

@Injectable()
export class ApprovalsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ─── Rules ────────────────────────────────────────────────────────────────

  async rules() {
    const rows = await this.db.select().from(approvalRules).orderBy(asc(approvalRules.kind), asc(approvalRules.minUsd))
    return { rules: rows, warnings: ruleWarnings(rows as RuleLike[]) }
  }

  async saveRule(user: AuthUser, id: string | null, b: z.infer<typeof ruleBody>) {
    return this.db.transaction(async (tx) => {
      await this.assertApproverRoles(tx, b.chain)
      const [row] = id
        ? await tx.update(approvalRules).set(b).where(eq(approvalRules.id, id)).returning()
        : await tx.insert(approvalRules).values(b).returning()
      if (!row) throw notFound({ ar: 'القاعدة', en: 'Rule' })
      await audit(tx, user, id ? 'rule.update' : 'rule.create', 'approval_rule', row.id, b)
      return row
    })
  }

  async deleteRule(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      // Rules referenced by past requests are deactivated, not deleted, to keep the history readable.
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(spendRequests).where(eq(spendRequests.ruleId, id))
      if (n > 0) await tx.update(approvalRules).set({ active: false }).where(eq(approvalRules.id, id))
      else await tx.delete(approvalRules).where(eq(approvalRules.id, id))
      await audit(tx, user, n > 0 ? 'rule.deactivate' : 'rule.delete', 'approval_rule', id)
    })
  }

  /** Shows which chain an amount would follow (the "rule tester"). */
  async preview(kind: 'spend' | 'reallocation', amountUsd: string, officeId: string | null) {
    const rules = (await this.db.select().from(approvalRules)) as RuleLike[]
    const r = routeApproval(rules, kind, toCents(amountUsd), officeId)
    return { ruleId: r.rule?.id ?? null, chain: r.chain }
  }

  // ─── Spend requests ───────────────────────────────────────────────────────

  async createRequest(user: AuthUser, b: z.infer<typeof requestBody>) {
    const officeId = b.officeId ?? user.officeId
    const limited = scopeOffice(user)
    if (limited && officeId !== limited) throw forbidden({ ar: 'يمكنك تقديم طلبات لمكتبك فقط', en: 'You can only submit requests for your own office' })

    return this.db.transaction(async (tx) => {
      const [line] = await tx.select().from(budgetLines).where(eq(budgetLines.id, b.lineId))
      if (!line || !line.active) throw notFound({ ar: 'البند', en: 'Budget line' })
      const [office] = await tx.select().from(offices).where(eq(offices.id, officeId))
      if (!office?.active) throw unprocessable('OFFICE_INACTIVE', { ar: 'المكتب غير نشط', en: 'Office is not active' })
      if (b.activityId) {
        const [a] = await tx.select().from(activities).where(eq(activities.id, b.activityId))
        if (!a || a.lineId !== line.id) throw unprocessable('ACTIVITY_MISMATCH', { ar: 'النشاط لا يتبع هذا البند', en: 'The activity does not belong to this budget line' })
      }

      // Serialise against other requests on the same project so two can't both pass a ceiling.
      await lockProject(tx, line.projectId)

      const rate = await rateOn(tx, today())
      const amountUsdCents = b.currency === 'USD' ? toCents(b.amount) : sdgToUsd(toCents(b.amount), toRate4(rate))
      if (amountUsdCents <= 0) throw unprocessable('AMOUNT_TOO_SMALL', { ar: 'المبلغ صغير جداً', en: 'Amount is too small' })

      const check = checkCeiling(await projectUsage(tx, line.projectId), line.id, amountUsdCents)
      if (check.verdict === 'blocked') {
        throw new AppError(422, 'CEILING_EXCEEDED', { ar: `المبلغ يتجاوز المتاح — ينقص البند ${fromCents(check.shortfall)}$`, en: `Exceeds what is available — the line is short by $${fromCents(check.shortfall)}` }, checkJson(check))
      }
      const overCeiling = check.verdict === 'needs_extra_approval'

      const rules = (await tx.select().from(approvalRules)) as RuleLike[]
      const route = routeApproval(rules, 'spend', amountUsdCents, officeId, overCeiling)
      await this.assertApproverRoles(tx, route.chain)

      const code = await nextNo(tx, 'SR')
      const [req] = await tx
        .insert(spendRequests)
        .values({
          code,
          officeId,
          projectId: line.projectId,
          lineId: line.id,
          activityId: b.activityId ?? null,
          purpose: b.purpose,
          amount: b.amount,
          currency: b.currency,
          rate,
          amountUsd: fromCents(amountUsdCents),
          overCeiling,
          ruleId: route.rule?.id ?? null,
          requesterId: user.id,
        })
        .returning()
      await this.createSteps(tx, { kind: 'request', id: req.id }, route.chain)
      await audit(tx, user, 'request.create', 'spend_request', req.id, { code, amountUsd: req.amountUsd, overCeiling, chain: route.chain })
      return { ...(await this.getRequest(user, req.id, tx)), check: checkJson(check) }
    })
  }

  async listRequests(user: AuthUser, q: z.infer<typeof listQuery>) {
    const where: SQL[] = []
    const limited = scopeOffice(user)
    if (limited) where.push(eq(spendRequests.officeId, limited))
    else if (q.officeId) where.push(eq(spendRequests.officeId, q.officeId))
    if (q.status) where.push(eq(spendRequests.status, q.status))
    if (q.projectId) where.push(eq(spendRequests.projectId, q.projectId))
    const rows = await this.db
      .select()
      .from(spendRequests)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(spendRequests.createdAt))
      .limit(q.limit)
      .offset(q.offset)
    const steps = rows.length ? await this.db.select().from(approvalSteps).where(inArray(approvalSteps.requestId, rows.map((r) => r.id))).orderBy(asc(approvalSteps.seq)) : []
    return rows.map((r) => ({ ...r, steps: steps.filter((s) => s.requestId === r.id) }))
  }

  async getRequest(user: AuthUser, id: string, db: DbOrTx = this.db) {
    const [r] = await db.select().from(spendRequests).where(eq(spendRequests.id, id))
    if (!r) throw notFound({ ar: 'الطلب', en: 'Request' })
    const limited = scopeOffice(user)
    if (limited && r.officeId !== limited && r.requesterId !== user.id) throw notFound({ ar: 'الطلب', en: 'Request' })
    const steps = await db.select().from(approvalSteps).where(eq(approvalSteps.requestId, id)).orderBy(asc(approvalSteps.seq))
    return { ...r, steps }
  }

  async cancelRequest(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(spendRequests).where(eq(spendRequests.id, id)).for('update')
      if (!r) throw notFound({ ar: 'الطلب', en: 'Request' })
      if (r.requesterId !== user.id) throw forbidden({ ar: 'يلغي الطلب صاحبه فقط', en: 'Only the requester can cancel a request' })
      if (r.status !== 'pending') throw conflict('NOT_PENDING', { ar: 'لا يمكن إلغاء طلب خرج من مرحلة الاعتماد', en: 'Only requests still in approval can be cancelled' })
      await tx.update(spendRequests).set({ status: 'cancelled', decidedAt: new Date() }).where(eq(spendRequests.id, id))
      await tx.update(approvalSteps).set({ status: 'skipped' }).where(and(eq(approvalSteps.requestId, id), inArray(approvalSteps.status, ['pending', 'waiting'])))
      await audit(tx, user, 'request.cancel', 'spend_request', id)
      return this.getRequest(user, id, tx)
    })
  }

  async decideRequest(user: AuthUser, id: string, decision: 'approve' | 'reject', note?: string) {
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(spendRequests).where(eq(spendRequests.id, id)).for('update')
      if (!r) throw notFound({ ar: 'الطلب', en: 'Request' })
      if (r.status !== 'pending') throw conflict('NOT_PENDING', { ar: 'تم البت في هذا الطلب مسبقاً', en: 'This request has already been decided' })
      if (r.requesterId === user.id) throw forbidden({ ar: 'لا يمكنك اعتماد طلبك', en: 'You cannot approve your own request' })
      const done = await this.decideStep(tx, user, { kind: 'request', id }, r.officeId, decision, note)
      if (done !== 'continue') await tx.update(spendRequests).set({ status: done, decidedAt: new Date() }).where(eq(spendRequests.id, id))
      await audit(tx, user, `request.${decision}`, 'spend_request', id, { note, result: done })
      return this.getRequest(user, id, tx)
    })
  }

  // ─── Reallocations ────────────────────────────────────────────────────────

  async createReallocation(user: AuthUser, b: z.infer<typeof reallocationBody>) {
    if (b.fromLineId === b.toLineId) throw unprocessable('SAME_LINE', { ar: 'اختر بندين مختلفين', en: 'Choose two different lines' })
    return this.db.transaction(async (tx) => {
      const ls = await tx.select().from(budgetLines).where(inArray(budgetLines.id, [b.fromLineId, b.toLineId]))
      const from = ls.find((l) => l.id === b.fromLineId)
      const to = ls.find((l) => l.id === b.toLineId)
      if (!from || !to) throw notFound({ ar: 'البند', en: 'Budget line' })
      if (from.projectId !== to.projectId) throw unprocessable('CROSS_PROJECT', { ar: 'النقل بين بنود المشروع نفسه فقط', en: 'Reallocations stay within one project' })
      await lockProject(tx, from.projectId)
      const u = await projectUsage(tx, from.projectId)
      const avail = u.lines.get(from.id)!.usage.available
      const amount = toCents(b.amountUsd)
      if (amount > avail)
        throw unprocessable('SOURCE_SHORT', { ar: `البند المصدر لا يملك إلا ${fromCents(Math.max(0, avail))}$`, en: `The source line only has $${fromCents(Math.max(0, avail))} available` }, { available: fromCents(avail) })

      const rules = (await tx.select().from(approvalRules)) as RuleLike[]
      const route = routeApproval(rules, 'reallocation', amount, null)
      await this.assertApproverRoles(tx, route.chain)
      const code = await nextNo(tx, 'RA')
      const [ra] = await tx.insert(reallocations).values({ code, projectId: from.projectId, fromLineId: from.id, toLineId: to.id, amountUsd: b.amountUsd, reason: b.reason, requesterId: user.id }).returning()
      await this.createSteps(tx, { kind: 'reallocation', id: ra.id }, route.chain)
      await audit(tx, user, 'reallocation.create', 'reallocation', ra.id, { code, amountUsd: b.amountUsd, chain: route.chain })
      return this.getReallocation(ra.id, tx)
    })
  }

  async listReallocations(q: { status?: string; projectId?: string }) {
    const where: SQL[] = []
    if (q.status) where.push(sql`${reallocations.status} = ${q.status}`)
    if (q.projectId) where.push(eq(reallocations.projectId, q.projectId))
    const rows = await this.db.select().from(reallocations).where(where.length ? and(...where) : undefined).orderBy(desc(reallocations.createdAt)).limit(200)
    const steps = rows.length ? await this.db.select().from(approvalSteps).where(inArray(approvalSteps.reallocationId, rows.map((r) => r.id))).orderBy(asc(approvalSteps.seq)) : []
    return rows.map((r) => ({ ...r, steps: steps.filter((s) => s.reallocationId === r.id) }))
  }

  async getReallocation(id: string, db: DbOrTx = this.db) {
    const [r] = await db.select().from(reallocations).where(eq(reallocations.id, id))
    if (!r) throw notFound({ ar: 'المناقلة', en: 'Reallocation' })
    const steps = await db.select().from(approvalSteps).where(eq(approvalSteps.reallocationId, id)).orderBy(asc(approvalSteps.seq))
    return { ...r, steps }
  }

  async decideReallocation(user: AuthUser, id: string, decision: 'approve' | 'reject', note?: string) {
    return this.db.transaction(async (tx) => {
      const [r0] = await tx.select({ projectId: reallocations.projectId }).from(reallocations).where(eq(reallocations.id, id))
      if (!r0) throw notFound({ ar: 'المناقلة', en: 'Reallocation' })
      await lockProject(tx, r0.projectId)
      const [r] = await tx.select().from(reallocations).where(eq(reallocations.id, id)).for('update')
      if (r.status !== 'pending') throw conflict('NOT_PENDING', { ar: 'تم البت في هذه المناقلة مسبقاً', en: 'This reallocation has already been decided' })
      if (r.requesterId === user.id) throw forbidden({ ar: 'لا يمكنك اعتماد طلبك', en: 'You cannot approve your own request' })
      const done = await this.decideStep(tx, user, { kind: 'reallocation', id }, null, decision, note)
      if (done !== 'continue') await tx.update(reallocations).set({ status: done, decidedAt: new Date() }).where(eq(reallocations.id, id))
      await audit(tx, user, `reallocation.${decision}`, 'reallocation', id, { note, result: done })
      return this.getReallocation(id, tx)
    })
  }

  // ─── Inbox ────────────────────────────────────────────────────────────────

  /** Everything currently waiting on this user's role (and office, for office-scoped approvers). */
  async inbox(user: AuthUser) {
    if (!user.canApprove) return { requests: [], reallocations: [] }
    const limited = scopeOffice(user)
    const reqs = await this.db
      .select({ r: spendRequests })
      .from(approvalSteps)
      .innerJoin(spendRequests, eq(spendRequests.id, approvalSteps.requestId))
      .where(
        and(
          eq(approvalSteps.roleId, user.roleId),
          eq(approvalSteps.status, 'pending'),
          eq(spendRequests.status, 'pending'),
          sql`${spendRequests.requesterId} <> ${user.id}`,
          limited ? eq(spendRequests.officeId, limited) : undefined,
        ),
      )
      .orderBy(asc(spendRequests.createdAt))
    const ras = await this.db
      .select({ r: reallocations })
      .from(approvalSteps)
      .innerJoin(reallocations, eq(reallocations.id, approvalSteps.reallocationId))
      .where(and(eq(approvalSteps.roleId, user.roleId), eq(approvalSteps.status, 'pending'), eq(reallocations.status, 'pending'), sql`${reallocations.requesterId} <> ${user.id}`))
      .orderBy(asc(reallocations.createdAt))
    return { requests: reqs.map((x) => x.r), reallocations: ras.map((x) => x.r) }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async createSteps(tx: DbOrTx, parent: Parent, chain: string[]) {
    await tx.insert(approvalSteps).values(
      chain.map((roleId, i) => ({
        requestId: parent.kind === 'request' ? parent.id : null,
        reallocationId: parent.kind === 'reallocation' ? parent.id : null,
        seq: i + 1,
        roleId,
        status: (i === 0 ? 'pending' : 'waiting') as 'pending' | 'waiting',
      })),
    )
  }

  /**
   * Records this user's decision on the current step. Returns the final status when the
   * chain is finished ('approved' | 'rejected'), or 'continue' when the next step is now pending.
   */
  private async decideStep(tx: DbOrTx, user: AuthUser, parent: Parent, officeId: string | null, decision: 'approve' | 'reject', note?: string) {
    const col = parent.kind === 'request' ? approvalSteps.requestId : approvalSteps.reallocationId
    const steps = await tx.select().from(approvalSteps).where(eq(col, parent.id)).orderBy(asc(approvalSteps.seq)).for('update')
    const current = steps.find((s) => s.status === 'pending')
    if (!current) throw conflict('NO_PENDING_STEP', { ar: 'لا توجد خطوة اعتماد مفتوحة', en: 'No approval step is open' })
    if (!user.canApprove || current.roleId !== user.roleId)
      throw forbidden({ ar: 'هذه الخطوة ليست من دورك', en: 'This step is not for your role' })
    const limited = scopeOffice(user)
    if (limited && officeId && officeId !== limited) throw forbidden({ ar: 'يعتمد هذا الطلب مسؤول مكتبه', en: 'This request is approved by its own office' })
    if (decision === 'reject' && !note?.trim()) throw unprocessable('NOTE_REQUIRED', { ar: 'اكتب سبب الرفض', en: 'Please give a reason for rejecting' })

    const now = new Date()
    await tx.update(approvalSteps).set({ status: decision === 'approve' ? 'approved' : 'rejected', byId: user.id, at: now, note: note ?? null }).where(eq(approvalSteps.id, current.id))
    if (decision === 'reject') {
      const rest = steps.filter((s) => s.seq > current.seq).map((s) => s.id)
      if (rest.length) await tx.update(approvalSteps).set({ status: 'skipped' }).where(inArray(approvalSteps.id, rest))
      return 'rejected' as const
    }
    const next = steps.find((s) => s.seq > current.seq && s.status === 'waiting')
    if (!next) return 'approved' as const
    await tx.update(approvalSteps).set({ status: 'pending' }).where(eq(approvalSteps.id, next.id))
    return 'continue' as const
  }

  /** Every role in a chain must exist and be allowed to approve; otherwise requests would get stuck. */
  private async assertApproverRoles(tx: DbOrTx, chain: string[]) {
    const rs = await tx.select({ id: roles.id, canApprove: roles.canApprove }).from(roles).where(inArray(roles.id, chain))
    const bad = chain.filter((c) => !rs.find((r) => r.id === c && r.canApprove))
    if (bad.length)
      throw unprocessable('BAD_APPROVER_ROLE', { ar: 'سلسلة الاعتماد تحتوي دوراً لا يملك صلاحية الاعتماد', en: 'The approval chain has a role that cannot approve' }, { roles: bad })
  }
}
