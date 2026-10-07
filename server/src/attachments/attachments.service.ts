import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { can, scopeOffice, type AuthUser, type ModuleKey } from '../auth/auth-user'
import { audit } from '../common/audit'
import { forbidden, notFound, unprocessable } from '../common/errors'
import { env } from '../config/env'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { activities, advances, attachments, fieldReports, spendRequests, vouchers } from '../db/schema'
import { cleanName, openBlob, sha256, sniff, storeBlob } from './files'

export const OWNER_TYPES = ['activity', 'field_report', 'spend_request', 'voucher', 'advance', 'report', 'project'] as const
export type OwnerType = (typeof OWNER_TYPES)[number]

export const ownerQuery = z.object({ ownerType: z.enum(OWNER_TYPES), ownerId: z.string().min(1).max(64) })
export const uploadFields = z.object({ ownerType: z.enum(OWNER_TYPES), ownerId: z.string().min(1).max(64), note: z.string().trim().max(300).optional() })

const MAX_PER_RECORD = 50
const MODULE: Record<OwnerType, ModuleKey> = { activity: 'activities', field_report: 'activities', spend_request: 'projects', voucher: 'finance', advance: 'finance', report: 'reports', project: 'projects' }

@Injectable()
export class AttachmentsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The office a record belongs to (null when it belongs to the whole organisation). Throws if it does not exist. */
  private async officeOf(db: DbOrTx, type: OwnerType, id: string): Promise<string | null> {
    const one = async (rows: Promise<{ officeId: string | null }[]>) => {
      const [r] = await rows
      if (!r) throw notFound({ ar: 'السجل المرفق به', en: 'The record' })
      return r.officeId
    }
    switch (type) {
      case 'activity':
        return one(db.select({ officeId: activities.officeId }).from(activities).where(eq(activities.id, id)))
      case 'field_report':
        return one(db.select({ officeId: activities.officeId }).from(fieldReports).innerJoin(activities, eq(activities.id, fieldReports.activityId)).where(eq(fieldReports.id, id)))
      case 'spend_request':
        return one(db.select({ officeId: spendRequests.officeId }).from(spendRequests).where(eq(spendRequests.id, id)))
      case 'voucher':
        return one(db.select({ officeId: vouchers.officeId }).from(vouchers).where(eq(vouchers.id, id)))
      case 'advance':
        return one(db.select({ officeId: advances.officeId }).from(advances).where(eq(advances.id, id)))
      case 'report':
      case 'project':
        return null
    }
  }

  /** Same visibility rules as the record itself: the module permission, and the office for office-scoped users. */
  private assertAccess(user: AuthUser, type: OwnerType, officeId: string | null, level: 'view' | 'edit') {
    if (!can(user, MODULE[type], level)) throw forbidden()
    const limited = scopeOffice(user)
    if (limited && officeId !== null && officeId !== limited) throw notFound({ ar: 'الملف', en: 'File' })
    // Organisation-wide files (reports) are not for office-scoped staff.
    if (limited && officeId === null) throw forbidden()
  }

  async list(user: AuthUser, q: z.infer<typeof ownerQuery>) {
    const officeId = await this.officeOf(this.db, q.ownerType, q.ownerId)
    this.assertAccess(user, q.ownerType, officeId, 'view')
    const rows = await this.db.select().from(attachments).where(and(eq(attachments.ownerType, q.ownerType), eq(attachments.ownerId, q.ownerId), isNull(attachments.deletedAt))).orderBy(asc(attachments.createdAt))
    return rows.map(({ sha256: _h, ...a }) => a)
  }

  async upload(user: AuthUser, f: z.infer<typeof uploadFields>, file: { originalname: string; buffer: Buffer; size: number } | undefined) {
    if (!file?.buffer?.length) throw unprocessable('NO_FILE', { ar: 'لم يُرفق ملف', en: 'No file was attached' })
    const kind = sniff(file.buffer)
    if (!kind) throw unprocessable('FILE_TYPE', { ar: 'نوع الملف غير مسموح؛ المسموح: صور (JPG, PNG, WebP, HEIC) وPDF', en: 'File type not allowed; use an image (JPG, PNG, WebP, HEIC) or a PDF' })
    const officeId = await this.officeOf(this.db, f.ownerType, f.ownerId)
    this.assertAccess(user, f.ownerType, officeId, 'edit')
    const hash = sha256(file.buffer)
    await storeBlob(file.buffer, hash)
    return this.db.transaction(async (tx) => {
      // Serialise uploads to one record so the per-record limit holds under concurrency.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'att:' + f.ownerType + ':' + f.ownerId}))`)
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(attachments).where(and(eq(attachments.ownerType, f.ownerType), eq(attachments.ownerId, f.ownerId), isNull(attachments.deletedAt)))
      if (n >= MAX_PER_RECORD) throw unprocessable('TOO_MANY_FILES', { ar: `الحد الأقصى ${MAX_PER_RECORD} ملفاً للسجل الواحد`, en: `At most ${MAX_PER_RECORD} files per record` })
      const [a] = await tx
        .insert(attachments)
        .values({ ownerType: f.ownerType, ownerId: f.ownerId, officeId, fileName: cleanName(file.originalname, kind.ext), mime: kind.mime, size: file.buffer.length, sha256: hash, note: f.note ?? null, uploadedById: user.id })
        .returning()
      await audit(tx, user, 'attachment.upload', 'attachment', a.id, { owner: `${f.ownerType}:${f.ownerId}`, name: a.fileName, size: a.size })
      const { sha256: _h, ...out } = a
      return out
    })
  }

  /** Looks up a file the user may see; returns its details and a stream of its content. */
  async open(user: AuthUser, id: string) {
    const [a] = await this.db.select().from(attachments).where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
    if (!a) throw notFound({ ar: 'الملف', en: 'File' })
    this.assertAccess(user, a.ownerType, a.officeId, 'view')
    return { meta: a, stream: openBlob(a.sha256) }
  }

  /** Removes a file from its record. The uploader can remove their own; managers of the module can remove any. */
  async remove(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(attachments).where(and(eq(attachments.id, id), isNull(attachments.deletedAt))).for('update')
      if (!a) throw notFound({ ar: 'الملف', en: 'File' })
      this.assertAccess(user, a.ownerType, a.officeId, 'edit')
      if (a.uploadedById !== user.id && !can(user, MODULE[a.ownerType], 'manage')) throw forbidden({ ar: 'يحذف الملف من رفعه أو مدير الوحدة', en: 'Only the person who uploaded a file, or a manager, can remove it' })
      await tx.update(attachments).set({ deletedAt: new Date(), deletedById: user.id }).where(eq(attachments.id, id))
      await audit(tx, user, 'attachment.delete', 'attachment', id, { name: a.fileName })
      return { ok: true }
    })
  }
}

export const maxUploadBytes = () => env().MAX_UPLOAD_MB * 1024 * 1024
