import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { conflict, forbidden, notFound, unprocessable } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { budgetLines, procurementCases } from '../db/schema'
import type { CaseData, createBody, listQuery, updateBody } from './procurement.schemas'

type Status = 'draft' | 'rfq' | 'evaluated' | 'ordered' | 'received' | 'cancelled'
const statusOf = (d: CaseData): Exclude<Status, 'cancelled'> => (d.receipt ? 'received' : d.po ? 'ordered' : d.award || d.bids?.length ? 'evaluated' : d.rfq ? 'rfq' : 'draft')

/** The numbers of the later forms follow the case number: PC-2026-0007 → RFQ-2026-0007, PO-2026-0007, GRN-2026-0007. */
const forms = (no: string) => {
  const t = no.replace(/^PC-/, '')
  return { pr: no, rfq: `RFQ-${t}`, po: `PO-${t}`, grn: `GRN-${t}` }
}

@Injectable()
export class ProcurementService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private shape(r: typeof procurementCases.$inferSelect) {
    const d = r.data as CaseData
    const total = d.pr.lines.reduce((t, l) => t + l.qty * l.unitCost * l.freq, 0)
    return { ...r, forms: forms(r.no), totalSdg: Math.round(total * 100) / 100 }
  }

  private check(d: CaseData) {
    const n = d.pr.lines.length
    for (const b of d.bids ?? [])
      if (b.unitPrices.length !== n) throw unprocessable('BID_LINES', { ar: 'أسعار العرض يجب أن تغطي كل أصناف الطلب', en: 'A bid must price every item of the requisition' }, { vendor: b.vendor })
    if (d.award && !(d.bids ?? []).some((b) => b.vendor === d.award!.vendor)) throw unprocessable('AWARD_VENDOR', { ar: 'الجهة الراسي عليها العطاء ليست بين المتقدمين', en: 'The awarded vendor is not among the bidders' })
    if (d.receipt && d.receipt.lines.length !== n) throw unprocessable('RECEIPT_LINES', { ar: 'الاستلام يجب أن يغطي كل أصناف الطلب', en: 'The receipt must cover every item' })
    if (d.receipt && !d.po) throw unprocessable('RECEIPT_NEEDS_PO', { ar: 'لا استلام قبل أمر الشراء', en: 'A receipt needs a purchase order first' })
    if (d.po && !d.po.vendor.name) throw unprocessable('PO_VENDOR', { ar: 'حدد المورد', en: 'Name the vendor' })
  }

  private async assertLine(projectId: string | null | undefined, lineId: string | null | undefined) {
    if (!lineId) return
    const [l] = await this.db.select({ projectId: budgetLines.projectId }).from(budgetLines).where(eq(budgetLines.id, lineId))
    if (!l || (projectId && l.projectId !== projectId)) throw unprocessable('BAD_LINE', { ar: 'البند لا يتبع هذا المشروع', en: 'That budget line does not belong to the project' })
  }

  async list(user: AuthUser, q: z.infer<typeof listQuery>) {
    const office = scopeOffice(user) ?? q.officeId
    const rows = await this.db
      .select()
      .from(procurementCases)
      .where(and(office ? eq(procurementCases.officeId, office) : undefined, q.status ? eq(procurementCases.status, q.status) : undefined))
      .orderBy(desc(procurementCases.createdAt))
      .limit(500)
    return rows.map((r) => this.shape(r))
  }

  private async get(user: AuthUser, id: string) {
    const [r] = await this.db.select().from(procurementCases).where(eq(procurementCases.id, id))
    const lim = scopeOffice(user)
    if (!r || (lim && r.officeId !== lim)) throw notFound({ ar: 'ملف الشراء', en: 'Procurement file' })
    return r
  }

  async one(user: AuthUser, id: string) {
    return this.shape(await this.get(user, id))
  }

  async create(user: AuthUser, b: z.infer<typeof createBody>) {
    const lim = scopeOffice(user)
    const officeId = lim ?? b.officeId ?? user.officeId
    if (!officeId) throw unprocessable('OFFICE_REQUIRED', { ar: 'حدد المكتب', en: 'Choose an office' })
    if (lim && b.officeId && b.officeId !== lim) throw forbidden({ ar: 'يمكنك إنشاء ملفات لمكتبك فقط', en: 'You can create files for your own office only' })
    this.check(b.data)
    await this.assertLine(b.projectId, b.lineId)
    const year = new Date().getUTCFullYear()
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('procurement-no'))`)
      const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from procurement_cases where no like ${`PC-${year}-%`}`)).rows
      const no = `PC-${year}-${String(n + 1).padStart(4, '0')}`
      const [r] = await tx.insert(procurementCases).values({ no, officeId, projectId: b.projectId ?? null, lineId: b.lineId ?? null, status: statusOf(b.data), data: b.data, createdById: user.id }).returning()
      await audit(tx, user, 'procurement.create', 'procurement_case', r.id, { no })
      return this.shape(r)
    })
  }

  async update(user: AuthUser, id: string, b: z.infer<typeof updateBody>) {
    this.check(b.data)
    await this.assertLine(b.projectId, b.lineId)
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(procurementCases).where(eq(procurementCases.id, id)).for('update')
      const lim = scopeOffice(user)
      if (!cur || (lim && cur.officeId !== lim)) throw notFound({ ar: 'ملف الشراء', en: 'Procurement file' })
      if (cur.status === 'cancelled') throw conflict('CANCELLED', { ar: 'الملف ملغى', en: 'This file is cancelled' })
      if (cur.status === 'received') throw conflict('CLOSED', { ar: 'الملف مغلق بعد الاستلام', en: 'This file is closed after receipt' })
      const [r] = await tx
        .update(procurementCases)
        .set({ data: b.data, status: statusOf(b.data), projectId: b.projectId === undefined ? cur.projectId : b.projectId, lineId: b.lineId === undefined ? cur.lineId : b.lineId, updatedAt: new Date() })
        .where(eq(procurementCases.id, id))
        .returning()
      await audit(tx, user, 'procurement.update', 'procurement_case', id, { status: r.status })
      return this.shape(r)
    })
  }

  async cancel(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(procurementCases).where(eq(procurementCases.id, id)).for('update')
      const lim = scopeOffice(user)
      if (!cur || (lim && cur.officeId !== lim)) throw notFound({ ar: 'ملف الشراء', en: 'Procurement file' })
      if (cur.status === 'received') throw conflict('CLOSED', { ar: 'لا يُلغى ملف تم استلامه', en: 'A received file cannot be cancelled' })
      const [r] = await tx.update(procurementCases).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(procurementCases.id, id)).returning()
      await audit(tx, user, 'procurement.cancel', 'procurement_case', id, {})
      return this.shape(r)
    })
  }
}
