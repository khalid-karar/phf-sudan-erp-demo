import type { INestApplication } from '@nestjs/common'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, createPool } from '../src/db/client'
import { decryptSecret } from '../src/notifications/secrets'
import { assertPublicHttps, RealTransport, setTransportForTests } from '../src/notifications/transports'
import { nextDue } from '../src/notifications/notifications.service'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let admin: Client, fm: Client, sup: Client, fo: Client
const pool = createPool(process.env.DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test')
const db = createDb(pool)
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, string>[]

const sent: { channel: string; to: string; subject: string; body: string }[] = []
let failWith: string | null = null
const fake = { send: async (channel: string, _cfg: unknown, m: { to: string; subject: string; body: string }) => {
  if (failWith) throw new Error(failWith)
  sent.push({ channel, to: m.to, subject: m.subject, body: m.body })
} }

const emailCfg = { enabled: true, provider: 'smtp', host: 'smtp.example.org', port: 587, security: 'starttls', username: 'bot@kphfs.org', password: 'super-secret-pw', fromName: 'PHF', fromAddress: 'bot@kphfs.org', replyTo: '' }
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const run = async () => (await admin.post('/notification-rules/run')).body

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[admin, fm, sup, fo] = await Promise.all([USERS.admin, USERS.financeManager, USERS.supervisor, USERS.fieldOfficer].map((e) => Client.as(app, e)))
  setTransportForTests(fake as never)
})
afterEach(() => {
  failWith = null
})
afterAll(async () => {
  setTransportForTests(null)
  await app?.close()
  await pool.end()
})

describe('channel settings', () => {
  it('stores secrets encrypted and never shows them again', async () => {
    expect((await admin.put('/channels/email', emailCfg)).status).toBe(200)
    const got = (await admin.get('/channels')).body.email
    expect(got.password).toBe('••••••••')
    expect(got.passwordSet).toBe(true)
    expect(JSON.stringify(got)).not.toContain('super-secret-pw')
    const [r] = await rows(sql`select config->>'password' as pw from channel_settings where channel = 'email'`)
    expect(r.pw.startsWith('enc:v1:')).toBe(true)
    expect(r.pw).not.toContain('super-secret-pw')
    expect(decryptSecret(r.pw)).toBe('super-secret-pw')
  })
  it('keeps the old secret when the screen sends the mask back', async () => {
    await admin.put('/channels/email', { ...emailCfg, password: '••••••••', host: 'smtp2.example.org' })
    const [r] = await rows(sql`select config->>'password' as pw, config->>'host' as host from channel_settings where channel = 'email'`)
    expect(decryptSecret(r.pw)).toBe('super-secret-pw')
    expect(r.host).toBe('smtp2.example.org')
    await admin.put('/channels/email', emailCfg)
  })
  it('needs settings-manage rights, and rejects unknown channels and bad settings', async () => {
    expect((await fm.put('/channels/email', emailCfg)).status).toBe(403)
    expect((await admin.put('/channels/telegram', {})).status).toBe(400)
    expect((await admin.put('/channels/email', { ...emailCfg, port: 99999 })).status).toBe(422)
  })
  it('sends a real test through the channel and reports failure in plain words', async () => {
    const ok = await admin.post('/channels/email/test', { to: 'me@example.org' })
    expect(ok.body.ok).toBe(true)
    expect(sent.at(-1)).toMatchObject({ channel: 'email', to: 'me@example.org' })
    failWith = 'Invalid login: 535 authentication failed'
    const bad = await admin.post('/channels/email/test', { to: 'me@example.org' })
    expect(bad.body.ok).toBe(false)
    expect(bad.body.message.en).toContain('authentication failed')
    expect(JSON.stringify(bad.body)).not.toContain('super-secret-pw')
    expect((await admin.post('/channels/email/test', { to: 'not-an-email' })).body.ok).toBe(false)
    // settings typed on screen but not saved can be tested too
    failWith = null
    expect((await admin.post('/channels/sms/test', { to: '+249912345678', config: { enabled: false, provider: 'http', apiUrl: 'https://sms.example.org/send', apiKey: 'k' } })).body.ok).toBe(true)
    expect((await admin.post('/channels/sms/test', { to: '+249912345678', config: { enabled: false, provider: 'http' } })).body.ok).toBe(false)
  })
})

describe('the engine', () => {
  it('turns the situations in the data into alerts for the right people, once', async () => {
    const first = await run()
    expect(first.created).toBeGreaterThan(0)
    const mine = (await fm.get('/notifications')).body
    expect(mine.some((n: { event: string }) => n.event === 'approval_waiting')).toBe(true)
    // approval alerts go to the approver at that step, not to the field officer
    expect((await fo.get('/notifications')).body.some((n: { event: string }) => n.event === 'approval_waiting')).toBe(false)
    const second = await run()
    expect(second.created).toBe(0)
  })

  it('warns X days before a deadline, and not earlier', async () => {
    await admin.post('/deadlines', { titleAr: 'تقرير قريب', titleEn: 'Near report', due: inDays(3), notifyDaysBefore: 5, ownerRoleId: 'supervisor' })
    await admin.post('/deadlines', { titleAr: 'تقرير بعيد', titleEn: 'Far report', due: inDays(20), notifyDaysBefore: 5, ownerRoleId: 'supervisor' })
    await run()
    const titles = (await sup.get('/notifications?limit=200')).body.filter((n: { event: string }) => n.event === 'deadline_near').map((n: { titleEn: string }) => n.titleEn)
    expect(titles).toContain('Coming up: Near report')
    expect(titles).not.toContain('Coming up: Far report')
  })

  it('flags a missed deadline as critical, and a completed one stops', async () => {
    const d = (await admin.post('/deadlines', { titleAr: 'فائت', titleEn: 'Missed one', due: inDays(-2), notifyDaysBefore: 3, ownerRoleId: 'supervisor' })).body
    await run()
    const n = (await sup.get('/notifications?limit=200')).body.find((x: { titleEn: string }) => x.titleEn === 'Missed: Missed one')
    expect(n.severity).toBe('critical')
    expect((await admin.post(`/deadlines/${d.id}/done`)).status).toBe(201)
    const d2 = (await admin.post('/deadlines', { titleAr: 'فائت ٢', titleEn: 'Missed two', due: inDays(-1), notifyDaysBefore: 3, ownerRoleId: 'supervisor' })).body
    await admin.post(`/deadlines/${d2.id}/done`)
    await run()
    expect((await sup.get('/notifications?limit=200')).body.some((x: { titleEn: string }) => x.titleEn === 'Missed: Missed two')).toBe(false)
  })

  it('a recurring deadline, once done, creates the next one with its own warning', async () => {
    const d = (await admin.post('/deadlines', { titleAr: 'شهري', titleEn: 'Monthly thing', due: inDays(1), notifyDaysBefore: 4, ownerRoleId: 'finance_manager', recurrence: 'monthly' })).body
    const r = await admin.post(`/deadlines/${d.id}/done`)
    expect(r.body.next.due).toBe(nextDue(d.due, 'monthly'))
    expect(r.body.next.done).toBe(false)
    expect((await admin.post(`/deadlines/${d.id}/done`)).body.next).toBeNull() // completing twice does not duplicate
    expect(nextDue('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextDue('2026-11-30', 'quarterly')).toBe('2027-02-28')
  })

  it('applies a rule with a threshold: budget lines past it alert the finance manager', async () => {
    const r = await admin.post('/notification-rules', { event: 'line_threshold', nameAr: 'بند', nameEn: 'Line at 1%', threshold: 1, recipients: { concerned: false, roles: ['finance_manager'], users: [] }, channels: { inapp: true, email: false, whatsapp: false, sms: false } })
    expect(r.status).toBe(201)
    await run()
    const mine = (await fm.get('/notifications?limit=200')).body.filter((n: { event: string; titleEn: string }) => n.event === 'line_threshold' && /ceiling/.test(n.titleEn))
    expect(mine.length).toBeGreaterThan(0)
    await admin.delete(`/notification-rules/${r.body.id}`)
  })
})

describe('delivery', () => {
  const emailsFor = async () => rows(sql`select d.to_addr, d.status, d.attempts, d.last_error from deliveries d where d.channel = 'email' order by d.created_at`)

  it('skips a channel that is switched off, with the reason', async () => {
    const [d] = await rows(sql`select status, last_error from deliveries where channel = 'whatsapp' limit 1`)
    expect(d.status).toBe('skipped')
    expect(d.last_error).toMatch(/WhatsApp|واتساب/)
  })

  it('queues and sends email once the channel is on, to each person’s own address', async () => {
    sent.length = 0
    await admin.post('/deadlines', { titleAr: 'تسليم', titleEn: 'Deliver', due: inDays(2), notifyDaysBefore: 5, ownerRoleId: 'finance_manager' })
    await run()
    const mail = sent.filter((m) => m.channel === 'email')
    expect(mail.length).toBeGreaterThan(0)
    expect(mail.every((m) => /@/.test(m.to))).toBe(true)
    expect((await emailsFor()).filter((d) => d.status === 'sent').length).toBeGreaterThan(0)
  })

  it('retries a failed send later and gives up after five tries', async () => {
    await admin.post('/deadlines', { titleAr: 'تسليم ٢', titleEn: 'Deliver two', due: inDays(2), notifyDaysBefore: 5, ownerRoleId: 'finance_manager' })
    failWith = 'connect ETIMEDOUT'
    await run()
    const failing = async () => rows(sql`select id, status, attempts, last_error from deliveries where last_error = 'connect ETIMEDOUT'`)
    let f = await failing()
    expect(f.length).toBeGreaterThan(0)
    expect(f.every((d) => d.status === 'queued' && Number(d.attempts) === 1)).toBe(true)
    // not retried until its time comes
    await run()
    expect((await failing()).every((d) => Number(d.attempts) === 1)).toBe(true)
    for (let i = 2; i <= 5; i++) {
      await db.execute(sql`update deliveries set next_attempt_at = now() - interval '1 minute' where last_error = 'connect ETIMEDOUT'`)
      await run()
    }
    f = await failing()
    expect(f.every((d) => d.status === 'failed' && Number(d.attempts) === 5)).toBe(true)
    // once the problem is fixed, nothing else is waiting
    failWith = null
    await db.execute(sql`update deliveries set next_attempt_at = now() - interval '1 minute' where status = 'queued'`)
    await run()
    expect((await rows(sql`select count(*)::int n from deliveries where status = 'queued'`))[0].n).toBe(0)
  })

  it('does not send the same message twice when two workers run together', async () => {
    sent.length = 0
    await db.execute(sql`insert into deliveries (id, channel, to_addr, subject, body, status) values ('t-x', 'email', 'x@example.org', 's', 'b', 'queued'), ('t-y', 'email', 'y@example.org', 's', 'b', 'queued')`)
    const engine = app.get((await import('../src/notifications/engine.service')).NotificationEngine)
    await Promise.all([engine.processQueue(), engine.processQueue(), engine.processQueue()])
    expect(sent.filter((m) => m.to === 'x@example.org')).toHaveLength(1)
    expect(sent.filter((m) => m.to === 'y@example.org')).toHaveLength(1)
  })
})

describe('inbox and rules', () => {
  it('lets people read only their own alerts and mark them read', async () => {
    const unread = (await sup.get('/notifications/unread-count')).body.unread
    expect(unread).toBeGreaterThan(0)
    const first = (await sup.get('/notifications?unread=1&limit=1')).body[0]
    expect((await sup.post(`/notifications/${first.id}/read`)).status).toBe(201)
    expect((await sup.get('/notifications/unread-count')).body.unread).toBe(unread - 1)
    expect((await fo.post(`/notifications/${first.id}/read`)).status).toBe(404) // not theirs
    expect((await sup.post('/notifications/read-all')).body.marked).toBe(unread - 1)
    expect((await sup.get('/notifications/unread-count')).body.unread).toBe(0)
  })

  it('validates rules: a number where the event needs one, within range, and real roles', async () => {
    const base = { nameAr: 'ق', nameEn: 'r', recipients: { concerned: true, roles: [], users: [] }, channels: { inapp: true, email: false, whatsapp: false, sms: false } }
    expect((await admin.post('/notification-rules', { ...base, event: 'line_threshold' })).body.code).toBe('THRESHOLD_REQUIRED')
    expect((await admin.post('/notification-rules', { ...base, event: 'line_threshold', threshold: 500 })).body.code).toBe('THRESHOLD_RANGE')
    expect((await admin.post('/notification-rules', { ...base, event: 'low_stock', threshold: 5 })).body.code).toBe('THRESHOLD_NOT_USED')
    expect((await admin.post('/notification-rules', { ...base, event: 'low_stock', recipients: { concerned: true, roles: ['nope'], users: [] } })).status).toBe(404)
    expect((await fo.post('/notification-rules', { ...base, event: 'low_stock' })).status).toBe(403)
  })

  it('switching a rule off stops its alerts', async () => {
    const rule = (await admin.get('/notification-rules')).body.find((r: { event: string }) => r.event === 'deadline_near')
    await admin.patch(`/notification-rules/${rule.id}`, { enabled: false })
    await admin.post('/deadlines', { titleAr: 'جديد', titleEn: 'Brand new', due: inDays(1), notifyDaysBefore: 5, ownerRoleId: 'supervisor' })
    await run()
    expect((await sup.get('/notifications?limit=200')).body.some((n: { titleEn: string }) => n.titleEn === 'Coming up: Brand new')).toBe(false)
    await admin.patch(`/notification-rules/${rule.id}`, { enabled: true })
  })
})

describe('senders', () => {
  afterEach(() => vi.unstubAllGlobals())
  const call = async (channel: 'whatsapp' | 'sms', cfg: Record<string, unknown>) => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    await new RealTransport().send(channel, cfg as never, { to: '+249912345678', subject: 'Title', body: 'Line one\nLine two', lang: 'en' })
    return f.mock.calls[0] as unknown as [string, RequestInit]
  }
  it('builds a WhatsApp template message the Cloud API accepts', async () => {
    const [url, init] = await call('whatsapp', { mode: 'cloud_api', phoneNumberId: '123456789012345', accessToken: 'tok', templateName: 'erp_alert', templateLanguage: 'ar' })
    expect(url).toBe('https://graph.facebook.com/v20.0/123456789012345/messages')
    const body = JSON.parse(String(init.body))
    expect(body.to).toBe('249912345678')
    expect(body.template.components[0].parameters[1].text).toBe('Line one | Line two') // templates can't contain line breaks
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
  it('builds a Twilio request and a generic HTTP request', async () => {
    const [url, init] = await call('sms', { provider: 'twilio', accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', authToken: 'secret-token-1234567890', fromNumber: '+15550001111', senderId: '' })
    expect(url).toContain('/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Messages.json')
    expect(String(init.body)).toContain('To=%2B249912345678')
    const [url2, init2] = await call('sms', { provider: 'http', apiUrl: 'https://sms.example.org/send', apiKey: 'key', senderId: 'PHF' })
    expect(url2).toBe('https://sms.example.org/send')
    expect(JSON.parse(String(init2.body))).toMatchObject({ to: '+249912345678', sender: 'PHF' })
  })
  it('reports a provider error with its status, and refuses private or plain-http service addresses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad token', { status: 401 })))
    await expect(new RealTransport().send('sms', { provider: 'twilio', accountSid: 'AC1', authToken: 'x', fromNumber: '+1', senderId: '' } as never, { to: '+249912345678', subject: 's', body: 'b', lang: 'en' })).rejects.toThrow(/401/)
    for (const bad of ['http://sms.example.org/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://192.168.1.9/x', 'https://169.254.169.254/latest', 'https://intranet/x', 'https://[::1]/x']) expect(() => assertPublicHttps(bad), bad).toThrow()
    expect(() => assertPublicHttps('https://sms.example.org/x')).not.toThrow()
  })
})
