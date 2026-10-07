import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { notFound, unprocessable } from '../common/errors'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { channelSettings, deadlines, deliveries, notificationRecipients, notifications, notifRules, projects, roles, users } from '../db/schema'
import { channelSchemas, cleanAddress, CHANNELS, defaultConfig, maskConfig, notReady, openConfig, sealConfig, type Channel } from './channels'
import { loadChannelConfigs, NotificationEngine } from './engine.service'
import { THRESHOLD, type NotifEvent } from './events'
import type { channelTestBody, deadlineBody, deadlinePatch, deadlineQuery, deliveryQuery, inboxQuery, ruleBody, rulePatch } from './notifications.schemas'
import { TRANSPORT, type Transport } from './transports'

const today = () => new Date().toISOString().slice(0, 10)

/** The date of the next occurrence of a recurring deadline. */
export function nextDue(due: string, rec: 'monthly' | 'quarterly' | 'yearly') {
  const [y, m, d] = due.split('-').map(Number)
  const add = rec === 'monthly' ? 1 : rec === 'quarterly' ? 3 : 12
  const first = new Date(Date.UTC(y, m - 1 + add, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10)
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TRANSPORT) private readonly transport: Transport,
    private readonly engine: NotificationEngine,
  ) {}

  // ─── a person's own alerts ─────────────────────────────────────────────────

  async inbox(user: AuthUser, q: z.infer<typeof inboxQuery>) {
    const where: SQL[] = [eq(notificationRecipients.userId, user.id), eq(notifications.inapp, true)]
    if (q.unread === '1') where.push(isNull(notificationRecipients.readAt))
    const rows = await this.db
      .select({ n: notifications, readAt: notificationRecipients.readAt })
      .from(notificationRecipients)
      .innerJoin(notifications, eq(notifications.id, notificationRecipients.notificationId))
      .where(and(...where))
      .orderBy(desc(notifications.createdAt))
      .limit(q.limit)
      .offset(q.offset)
    return rows.map(({ n, readAt }) => ({ id: n.id, event: n.event, severity: n.severity, titleAr: n.titleAr, titleEn: n.titleEn, bodyAr: n.bodyAr, bodyEn: n.bodyEn, link: n.link, officeId: n.officeId, createdAt: n.createdAt, read: !!readAt }))
  }

  async unreadCount(user: AuthUser) {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notificationRecipients)
      .innerJoin(notifications, eq(notifications.id, notificationRecipients.notificationId))
      .where(and(eq(notificationRecipients.userId, user.id), isNull(notificationRecipients.readAt), eq(notifications.inapp, true)))
    return { unread: r.n }
  }

  async markRead(user: AuthUser, id: string) {
    const r = await this.db.update(notificationRecipients).set({ readAt: new Date() }).where(and(eq(notificationRecipients.notificationId, id), eq(notificationRecipients.userId, user.id), isNull(notificationRecipients.readAt))).returning({ id: notificationRecipients.notificationId })
    if (!r.length) {
      const [x] = await this.db.select({ id: notificationRecipients.notificationId }).from(notificationRecipients).where(and(eq(notificationRecipients.notificationId, id), eq(notificationRecipients.userId, user.id)))
      if (!x) throw notFound({ ar: 'التنبيه', en: 'Notification' })
    }
    return { ok: true }
  }

  async markAllRead(user: AuthUser) {
    const r = await this.db.update(notificationRecipients).set({ readAt: new Date() }).where(and(eq(notificationRecipients.userId, user.id), isNull(notificationRecipients.readAt))).returning({ id: notificationRecipients.notificationId })
    return { marked: r.length }
  }

  // ─── rules ─────────────────────────────────────────────────────────────────

  listRules() {
    return this.db.select().from(notifRules).orderBy(asc(notifRules.createdAt), asc(notifRules.nameEn))
  }

  private async checkRule(db: DbOrTx, b: { event?: string; threshold?: number | null; recipients?: { roles: string[]; users: string[] } }) {
    if (b.event !== undefined) {
      const t = THRESHOLD[b.event as NotifEvent]
      if (t) {
        if (b.threshold == null) throw unprocessable('THRESHOLD_REQUIRED', { ar: 'هذا النوع يحتاج إلى رقم (الحد)', en: 'This kind of rule needs a number' })
        if (b.threshold < t.min || b.threshold > t.max) throw unprocessable('THRESHOLD_RANGE', { ar: `الرقم يجب أن يكون بين ${t.min} و${t.max}`, en: `The number must be between ${t.min} and ${t.max}` })
      } else if (b.threshold != null) throw unprocessable('THRESHOLD_NOT_USED', { ar: 'هذا النوع لا يستخدم رقماً', en: 'This kind of rule does not use a number' })
    }
    if (b.recipients?.roles.length) {
      const rs = await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, b.recipients.roles))
      if (rs.length !== new Set(b.recipients.roles).size) throw notFound({ ar: 'الدور', en: 'Role' })
    }
    if (b.recipients?.users.length) {
      const us = await db.select({ id: users.id }).from(users).where(inArray(users.id, b.recipients.users))
      if (us.length !== new Set(b.recipients.users).size) throw notFound({ ar: 'المستخدم', en: 'User' })
    }
  }

  async createRule(user: AuthUser, b: z.infer<typeof ruleBody>) {
    return this.db.transaction(async (tx) => {
      await this.checkRule(tx, b)
      const [r] = await tx.insert(notifRules).values({ ...b, threshold: b.threshold ?? null }).returning()
      await audit(tx, user, 'notif_rule.create', 'notif_rule', r.id, { event: r.event })
      return r
    })
  }

  async updateRule(user: AuthUser, id: string, b: z.infer<typeof rulePatch>) {
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(notifRules).where(eq(notifRules.id, id)).for('update')
      if (!cur) throw notFound({ ar: 'القاعدة', en: 'Rule' })
      const merged = { event: b.event ?? cur.event, threshold: b.threshold !== undefined ? b.threshold : cur.threshold, recipients: b.recipients ?? cur.recipients }
      await this.checkRule(tx, merged)
      const [r] = await tx.update(notifRules).set({ ...b, threshold: merged.threshold ?? null }).where(eq(notifRules.id, id)).returning()
      await audit(tx, user, 'notif_rule.update', 'notif_rule', id, b)
      return r
    })
  }

  async deleteRule(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const r = await tx.delete(notifRules).where(eq(notifRules.id, id)).returning({ id: notifRules.id })
      if (!r.length) throw notFound({ ar: 'القاعدة', en: 'Rule' })
      await audit(tx, user, 'notif_rule.delete', 'notif_rule', id)
      return { ok: true }
    })
  }

  /** Runs the engine now (instead of waiting for the next pass). */
  async runNow() {
    return this.engine.tick()
  }

  async deliveryLog(q: z.infer<typeof deliveryQuery>) {
    const where: SQL[] = []
    if (q.status) where.push(eq(deliveries.status, q.status))
    if (q.channel) where.push(eq(deliveries.channel, q.channel))
    const rows = await this.db
      .select({ d: deliveries, nameAr: users.nameAr, nameEn: users.nameEn })
      .from(deliveries)
      .leftJoin(users, eq(users.id, deliveries.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(deliveries.createdAt))
      .limit(q.limit)
    return rows.map(({ d, nameAr, nameEn }) => ({ ...d, toName: nameAr ? { ar: nameAr, en: nameEn } : null }))
  }

  // ─── deadlines ─────────────────────────────────────────────────────────────

  async listDeadlines(q: z.infer<typeof deadlineQuery>) {
    const where: SQL[] = []
    if (q.done === 'yes') where.push(eq(deadlines.done, true))
    if (q.done === 'no') where.push(eq(deadlines.done, false))
    return this.db.select().from(deadlines).where(where.length ? and(...where) : undefined).orderBy(asc(deadlines.due))
  }

  private async checkDeadline(tx: DbOrTx, b: { projectId?: string | null; ownerRoleId?: string }) {
    if (b.ownerRoleId) {
      const [r] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, b.ownerRoleId))
      if (!r) throw notFound({ ar: 'الدور', en: 'Role' })
    }
    if (b.projectId) {
      const [p] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, b.projectId))
      if (!p) throw notFound({ ar: 'المشروع', en: 'Project' })
    }
  }

  async createDeadline(user: AuthUser, b: z.infer<typeof deadlineBody>) {
    return this.db.transaction(async (tx) => {
      await this.checkDeadline(tx, b)
      const [d] = await tx.insert(deadlines).values({ ...b, projectId: b.projectId ?? null, createdById: user.id }).returning()
      await audit(tx, user, 'deadline.create', 'deadline', d.id, { due: d.due })
      return d
    })
  }

  async updateDeadline(user: AuthUser, id: string, b: z.infer<typeof deadlinePatch>) {
    return this.db.transaction(async (tx) => {
      await this.checkDeadline(tx, b)
      const [d] = await tx.update(deadlines).set(b).where(eq(deadlines.id, id)).returning()
      if (!d) throw notFound({ ar: 'الموعد', en: 'Deadline' })
      await audit(tx, user, 'deadline.update', 'deadline', id, b)
      return d
    })
  }

  /** Marks a deadline done. A recurring one creates its next occurrence, which warns again in time. */
  async completeDeadline(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [d] = await tx.select().from(deadlines).where(eq(deadlines.id, id)).for('update')
      if (!d) throw notFound({ ar: 'الموعد', en: 'Deadline' })
      if (d.done) return { done: d, next: null }
      const [done] = await tx.update(deadlines).set({ done: true, doneAt: new Date(), doneById: user.id }).where(eq(deadlines.id, id)).returning()
      let next = null
      if (d.recurrence !== 'none') {
        // Skip occurrences already in the past so a late completion does not create an instantly overdue one.
        let due = nextDue(d.due, d.recurrence)
        while (due < today()) due = nextDue(due, d.recurrence)
        ;[next] = await tx.insert(deadlines).values({ titleAr: d.titleAr, titleEn: d.titleEn, projectId: d.projectId, due, notifyDaysBefore: d.notifyDaysBefore, ownerRoleId: d.ownerRoleId, recurrence: d.recurrence, createdById: user.id }).returning()
      }
      await audit(tx, user, 'deadline.done', 'deadline', id, { next: next?.id })
      return { done, next }
    })
  }

  async deleteDeadline(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const r = await tx.delete(deadlines).where(eq(deadlines.id, id)).returning({ id: deadlines.id })
      if (!r.length) throw notFound({ ar: 'الموعد', en: 'Deadline' })
      await audit(tx, user, 'deadline.delete', 'deadline', id)
      return { ok: true }
    })
  }

  // ─── channels (email, WhatsApp, SMS) ───────────────────────────────────────

  async channels() {
    const rows = await this.db.select().from(channelSettings)
    const out: Record<string, unknown> = {}
    for (const ch of CHANNELS) {
      const r = rows.find((x) => x.channel === ch)
      const cfg = r ? r.config : (defaultConfig(ch) as unknown as Record<string, unknown>)
      out[ch] = { ...maskConfig(ch, cfg), lastTest: r?.lastTest ?? null }
    }
    return out
  }

  async saveChannel(user: AuthUser, channel: Channel, body: unknown) {
    const parsed = channelSchemas[channel].safeParse(body)
    if (!parsed.success) throw unprocessable('VALIDATION', { ar: 'إعدادات غير صالحة', en: 'Invalid settings' }, parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
    return this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(channelSettings).where(eq(channelSettings.channel, channel)).for('update')
      const sealed = sealConfig(channel, parsed.data as Record<string, unknown>, cur?.config)
      await tx.insert(channelSettings).values({ channel, config: sealed }).onConflictDoUpdate({ target: channelSettings.channel, set: { config: sealed, updatedAt: new Date() } })
      await audit(tx, user, 'channel.save', 'channel', channel, { enabled: (parsed.data as { enabled: boolean }).enabled })
      return { ok: true }
    })
  }

  /** Sends a real test message with the saved settings, or with settings typed on screen but not yet saved. */
  async testChannel(user: AuthUser, channel: Channel, b: z.infer<typeof channelTestBody>) {
    const to = cleanAddress(channel, b.to)
    if (!to) return { ok: false, message: channel === 'email' ? { ar: 'أدخل بريداً صحيحاً لاستلام الرسالة التجريبية', en: 'Enter a valid email to receive the test' } : { ar: 'أدخل رقم جوال بصيغة دولية (مثل +249…)', en: 'Enter a mobile number in international format (e.g. +249…)' } }
    const [stored] = await this.db.select().from(channelSettings).where(eq(channelSettings.channel, channel))
    let cfg
    try {
      cfg = b.config ? openConfig(channel, sealConfig(channel, channelSchemas[channel].parse(b.config) as Record<string, unknown>, stored?.config)) : stored ? openConfig(channel, stored.config) : defaultConfig(channel)
    } catch {
      return { ok: false, message: { ar: 'إعدادات غير صالحة', en: 'The settings are not valid' } }
    }
    // A test sends even if the channel is switched off, but it needs the settings to be complete.
    const off = notReady(channel, { ...cfg, enabled: true } as typeof cfg)
    if (off) return { ok: false, message: off }
    let result: { ok: boolean; message: { ar: string; en: string } }
    try {
      await this.transport.send(channel, cfg, { to, subject: 'اختبار / Test', body: 'رسالة تجريبية من نظام إدارة الموارد.\nTest message from the resource management system.', lang: 'ar' })
      result = { ok: true, message: { ar: `أُرسلت رسالة تجريبية إلى ${to}`, en: `A test message was sent to ${to}` } }
    } catch (e) {
      const m = String((e as Error).message ?? e).slice(0, 300)
      result = { ok: false, message: { ar: `تعذر الإرسال: ${m}`, en: `Could not send: ${m}` } }
    }
    if (stored) await this.db.update(channelSettings).set({ lastTest: { at: new Date().toISOString(), ok: result.ok, message: result.message.en } }).where(eq(channelSettings.channel, channel))
    await audit(this.db, user, 'channel.test', 'channel', channel, { ok: result.ok })
    return result
  }
}

export { loadChannelConfigs }
