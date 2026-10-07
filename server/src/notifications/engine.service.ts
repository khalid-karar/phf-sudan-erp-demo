import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { env } from '../config/env'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { channelSettings, deliveries, notificationRecipients, notifications, notifRules, orgSettings, users } from '../db/schema'
import { candidatesFor, usersForRole } from './candidates'
import { cleanAddress, CHANNELS, defaultConfig, notReady, openConfig, type Channel, type ChannelConfigs } from './channels'
import { EVENTS, type NotifEvent } from './events'
import { TRANSPORT, type Transport } from './transports'

const MAX_ATTEMPTS = 5
const BACKOFF_MIN = [1, 5, 30, 120, 360] // minutes to wait after the 1st, 2nd… failure

export async function loadChannelConfigs(db: DbOrTx): Promise<ChannelConfigs> {
  const rows = await db.select().from(channelSettings)
  const out = {} as ChannelConfigs
  for (const ch of CHANNELS) {
    const r = rows.find((x) => x.channel === ch)
    ;(out as Record<Channel, unknown>)[ch] = r ? openConfig(ch, r.config) : defaultConfig(ch)
  }
  return out
}

/**
 * Looks for situations the rules care about, announces each one once, and sends the queued messages
 * (retrying a few times with a growing delay). Runs in the background and on demand.
 */
@Injectable()
export class NotificationEngine implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Notifications')
  private timer?: NodeJS.Timeout
  private kickTimer?: NodeJS.Timeout
  private busy = false

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TRANSPORT) private readonly transport: Transport,
  ) {}

  onModuleInit() {
    const every = env().NOTIFY_INTERVAL_SECONDS
    if (every > 0 && env().NODE_ENV !== 'test') {
      this.timer = setInterval(() => void this.tick(), every * 1000)
      this.timer.unref()
      setTimeout(() => void this.tick(), 15_000).unref()
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    if (this.kickTimer) clearTimeout(this.kickTimer)
  }

  /** Asks for a pass soon (e.g. right after a request is submitted); several asks in a row become one. */
  kick() {
    if (env().NOTIFY_INTERVAL_SECONDS === 0 || env().NODE_ENV === 'test' || this.kickTimer) return
    this.kickTimer = setTimeout(() => {
      this.kickTimer = undefined
      void this.tick()
    }, 3000)
    this.kickTimer.unref()
  }

  async tick() {
    if (this.busy) return null
    this.busy = true
    try {
      const found = await this.evaluate()
      const sent = await this.processQueue()
      return { ...found, ...sent }
    } catch (e) {
      this.log.error(`Notification pass failed: ${(e as Error).message}`)
      return null
    } finally {
      this.busy = false
    }
  }

  /** One pass over every enabled rule. Returns how many new alerts and messages were created. */
  async evaluate() {
    return this.db.transaction(async (tx) => {
      // Only one server instance evaluates at a time.
      const got = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('notify-evaluate')) as ok`)
      if (!got.rows[0].ok) return { created: 0, queued: 0, skippedRun: true }
      const [org] = await tx.select({ lang: orgSettings.defaultLang }).from(orgSettings).limit(1)
      const lang = org?.lang === 'en' ? 'en' : 'ar'
      const configs = await loadChannelConfigs(tx)
      const rules = await tx.select().from(notifRules).where(eq(notifRules.enabled, true))
      let created = 0
      let queued = 0
      for (const rule of rules) {
        if (!(EVENTS as readonly string[]).includes(rule.event)) continue
        for (const c of await candidatesFor(tx, rule.event as NotifEvent, rule.threshold)) {
          const ids = new Set<string>()
          if (rule.recipients.concerned) c.concerned.forEach((u) => ids.add(u))
          for (const r of rule.recipients.roles) (await usersForRole(tx, r, c.officeId)).forEach((u) => ids.add(u))
          rule.recipients.users.forEach((u) => ids.add(u))
          if (!ids.size) continue
          const people = await tx.select({ id: users.id, email: users.email, phone: users.phone }).from(users).where(and(inArray(users.id, [...ids]), eq(users.active, true)))
          if (!people.length) continue
          const [n] = await tx
            .insert(notifications)
            .values({ key: `${rule.id}:${c.key}`, ruleId: rule.id, event: rule.event, severity: c.severity, titleAr: c.titleAr, titleEn: c.titleEn, bodyAr: c.bodyAr, bodyEn: c.bodyEn, link: c.link, officeId: c.officeId ?? null, inapp: rule.channels.inapp })
            .onConflictDoNothing({ target: notifications.key })
            .returning()
          if (!n) continue // already announced
          created++
          await tx.insert(notificationRecipients).values(people.map((p) => ({ notificationId: n.id, userId: p.id })))
          const title = lang === 'ar' ? c.titleAr : c.titleEn
          const body = lang === 'ar' ? c.bodyAr : c.bodyEn
          const url = env().APP_URL ? `\n${env().APP_URL!.replace(/\/$/, '')}/#${c.link}` : ''
          for (const ch of CHANNELS) {
            if (!rule.channels[ch]) continue
            const off = notReady(ch, configs[ch])
            for (const p of people) {
              const to = cleanAddress(ch, ch === 'email' ? p.email : p.phone)
              const reason = off ? off[lang] : !to ? (lang === 'ar' ? (ch === 'email' ? 'لا يوجد بريد صالح للمستخدم' : 'لا يوجد رقم جوال صالح للمستخدم') : ch === 'email' ? 'The user has no valid email' : 'The user has no valid mobile number') : null
              await tx.insert(deliveries).values({ notificationId: n.id, userId: p.id, channel: ch, toAddr: to ?? '—', subject: title, body: body + url, lang, status: reason ? 'skipped' : 'queued', lastError: reason })
              if (!reason) queued++
            }
          }
        }
      }
      // Housekeeping: old alerts and messages are not kept forever.
      await tx.execute(sql`delete from notifications where created_at < now() - interval '180 days'`)
      await tx.execute(sql`delete from deliveries where created_at < now() - interval '90 days' and status <> 'queued'`)
      return { created, queued, skippedRun: false }
    })
  }

  /** Sends what is waiting. A message is claimed first, so two instances never send the same one twice. */
  async processQueue(limit = 50) {
    const claimed = await this.db.execute<{ id: string }>(sql`
      update deliveries set attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes'
      where id in (select id from deliveries where status = 'queued' and next_attempt_at <= now() order by next_attempt_at limit ${limit} for update skip locked)
      returning id`)
    if (!claimed.rows.length) return { sent: 0, failed: 0, retrying: 0 }
    const configs = await loadChannelConfigs(this.db)
    const rows = await this.db.select().from(deliveries).where(inArray(deliveries.id, claimed.rows.map((r) => r.id)))
    let sent = 0
    let failed = 0
    let retrying = 0
    for (const d of rows) {
      const cfg = configs[d.channel]
      const off = notReady(d.channel, cfg)
      if (off) {
        await this.db.update(deliveries).set({ status: 'skipped', lastError: off[d.lang === 'en' ? 'en' : 'ar'] }).where(eq(deliveries.id, d.id))
        continue
      }
      try {
        await this.transport.send(d.channel, cfg, { to: d.toAddr, subject: d.subject, body: d.body, lang: d.lang === 'en' ? 'en' : 'ar' })
        await this.db.update(deliveries).set({ status: 'sent', sentAt: new Date(), lastError: null }).where(eq(deliveries.id, d.id))
        sent++
      } catch (e) {
        const msg = String((e as Error).message ?? e).slice(0, 500)
        if (d.attempts >= MAX_ATTEMPTS) {
          await this.db.update(deliveries).set({ status: 'failed', lastError: msg }).where(eq(deliveries.id, d.id))
          failed++
        } else {
          await this.db.update(deliveries).set({ lastError: msg, nextAttemptAt: sql`now() + ${BACKOFF_MIN[Math.min(d.attempts, BACKOFF_MIN.length) - 1]} * interval '1 minute'` }).where(eq(deliveries.id, d.id))
          retrying++
        }
      }
    }
    return { sent, failed, retrying }
  }
}
