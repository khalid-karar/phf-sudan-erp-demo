import type { INestApplication } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { setTransportForTests } from '../src/notifications/transports'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let admin: Client, fm: Client, ed: Client, acc: Client, fo: Client
const pool = createPool(process.env.DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test')
const db = createDb(pool)
const one = async (q: ReturnType<typeof sql>) => ((await db.execute(q)).rows as Record<string, string>[])[0]

const mails: { to: string; cc?: string[]; subject: string; body: string; auto?: boolean; attachments?: { filename: string; content: Buffer; contentType: string }[] }[] = []
let failWith: string | null = null
const fake = { send: async (_c: string, _cfg: unknown, m: (typeof mails)[number]) => {
  if (failWith) throw new Error(failWith)
  mails.push(m)
} }
const emailCfg = { enabled: true, provider: 'smtp', host: 'smtp.example.org', port: 587, security: 'starttls', username: 'bot@kphfs.org', password: 'pw', fromName: 'PHF', fromAddress: 'bot@kphfs.org', replyTo: '' }
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF monthly')
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR-test')])
const upload = (c: Client, file: Buffer, ownerId: string, name = 'report.pdf') =>
  request(app.getHttpServer()).post('/api/v1/attachments').set('authorization', `Bearer ${c.token}`).field('ownerType', 'report').field('ownerId', ownerId).attach('file', file, { filename: name })

const PERIOD = '2026-09'

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[admin, fm, ed, acc, fo] = await Promise.all([USERS.admin, USERS.financeManager, USERS.director, USERS.accountant, USERS.fieldOfficer].map((e) => Client.as(app, e)))
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

describe('monthly figures', () => {
  it('agree with the ledger and the tables they come from', async () => {
    const r = (await ed.get(`/reports/monthly?period=${PERIOD}`)).body
    const rec = await one(sql`select coalesce(sum(amount_usd),0)::text as t from vouchers where kind = 'receipt' and to_char(date,'YYYY-MM') = ${PERIOD}`)
    const spent = await one(sql`select coalesce(sum(jl.debit - jl.credit),0)::text as t from journal_lines jl join accounts a on a.code = jl.account_code join journal_entries je on je.id = jl.entry_id where je.period = ${PERIOD} and a.type = 'expense' and je.source <> 'stock' and jl.budget_line_id is not null`)
    expect(Number(r.received)).toBeCloseTo(Number(rec.t), 2)
    expect(Number(r.spent)).toBeCloseTo(Number(spent.t), 2)
    expect(Number(r.spent)).toBeGreaterThan(0)
    expect(r.byOffice.reduce((t: number, o: { spent: string }) => t + Number(o.spent), 0)).toBeCloseTo(Number(r.spent), 2)
    const acts = await one(sql`select count(*)::int as n, coalesce(sum(beneficiaries),0)::int as b from field_reports where to_char(coalesce(done_on, submitted_at::date),'YYYY-MM') = ${PERIOD}`)
    expect(r.activitiesDone).toBe(Number(acts.n))
    expect(r.beneficiaries).toBe(Number(acts.b))
    expect(r.compliance).toBeGreaterThanOrEqual(0)
    expect(r.compliance).toBeLessThanOrEqual(1)
    expect(r.start).toBe('2026-09-01')
    expect(r.end).toBe('2026-09-30')
  })

  it('shows every active project with its pillars and how far the money and the calendar have run', async () => {
    const r = (await ed.get(`/reports/monthly?period=${PERIOD}`)).body
    const n = await one(sql`select count(*)::int as n from projects where active`)
    expect(r.projects).toHaveLength(Number(n.n))
    for (const p of r.projects) {
      expect(p.pillars.length).toBeGreaterThan(0)
      expect(p.elapsed).toBeGreaterThanOrEqual(0)
      expect(p.elapsed).toBeLessThanOrEqual(1)
      expect(Number(p.usage.ceiling)).toBeGreaterThan(0)
      expect(Number(p.usage.available)).toBeCloseTo(Number(p.usage.ceiling) - Number(p.usage.spent) - Number(p.usage.committed) - Number(p.usage.pending), 2)
    }
    // The month's spending by project adds up to the month's total.
    expect(r.projects.reduce((t: number, p: { monthSpent: string }) => t + Number(p.monthSpent), 0)).toBeCloseTo(Number(r.spent), 2)
  })

  it('reports in-kind supplies separately from cash, and cumulative cash totals', async () => {
    const r = (await ed.get(`/reports/monthly?period=${PERIOD}`)).body
    const issued = await one(sql`select coalesce(sum(value_usd),0)::text as t from stock_moves where kind = 'issue' and to_char(date,'YYYY-MM') = ${PERIOD}`)
    expect(Number(r.inKind.issued)).toBeCloseTo(Number(issued.t), 2)
    expect(Number(r.cashFund.received)).toBeGreaterThanOrEqual(Number(r.received))
    expect(Number(r.cashFund.spent)).toBeGreaterThanOrEqual(Number(r.spent))
    expect(r.staff.total).toBeGreaterThan(0)
  })

  it('handles a month with nothing in it', async () => {
    const r = await ed.get('/reports/monthly?period=2020-01')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ received: '0.00', spent: '0.00', activitiesDone: 0, beneficiaries: 0, compliance: 1, rate: null })
    expect(r.body.approvals.avgHours).toBeNull()
  })

  it('writes a first-draft summary from the numbers, in both languages', async () => {
    const r = (await ed.get(`/reports/monthly?period=${PERIOD}`)).body
    expect(r.defaults.summary.en).toContain(`${r.activitiesDone} field activities`)
    expect(r.defaults.summary.ar).toContain(String(r.activitiesDone))
  })

  it('is closed to office-limited accounts and to anyone without the reports module', async () => {
    expect((await fo.get(`/reports/monthly?period=${PERIOD}`)).status).toBe(403)
    expect((await Client.as(app, USERS.hr).then((c) => c.get(`/reports/monthly?period=${PERIOD}`))).status).toBe(403)
    expect((await ed.get('/reports/monthly?period=2026-13')).status).toBe(400)
    expect((await ed.get('/reports/monthly')).status).toBe(400)
  })
})

describe('delivery settings', () => {
  it('start with a sensible default, and give every project a donor template', async () => {
    const s = (await ed.get('/report-settings')).body
    expect(s.hq).toMatchObject({ requireApproval: true, approverRole: 'executive_director', autoSendDay: null, to: [] })
    const projects = (await ed.get('/projects')).body
    expect(Object.keys(s.donor).sort()).toEqual(projects.map((p: { id: string }) => p.id).sort())
  })

  it('saves what the settings screen sends, with addresses cleaned up', async () => {
    const cur = (await ed.get('/report-settings')).body
    const body = { hq: { ...cur.hq, to: [' HQ.Reports@PHF-KW.org ', 'hq.reports@phf-kw.org'], cc: ['director@kphfs.org'], autoSendDay: 12 }, donor: cur.donor }
    const r = await fm.put('/report-settings', body)
    expect(r.status).toBe(200)
    expect(r.body.hq.to).toEqual(['hq.reports@phf-kw.org'])
    expect(r.body.hq.autoSendDay).toBe(12)
    expect((await ed.get('/report-settings')).body.hq.cc).toEqual(['director@kphfs.org'])
    expect(Number((await one(sql`select count(*)::int as n from audit_log where action = 'report-settings.update'`)).n)).toBe(1)
  })

  it('rejects an address that is not an address, a role that does not exist and a project that does not exist', async () => {
    const cur = (await ed.get('/report-settings')).body
    expect((await fm.put('/report-settings', { hq: { ...cur.hq, to: ['not-an-email'] }, donor: cur.donor })).status).toBe(400)
    const noRole = await fm.put('/report-settings', { hq: { ...cur.hq, approverRole: 'nobody' }, donor: cur.donor })
    expect(noRole.status).toBe(422)
    expect(noRole.body.code).toBe('UNKNOWN_ROLE')
    const noProject = await fm.put('/report-settings', { hq: cur.hq, donor: { ...cur.donor, ghost: cur.donor[Object.keys(cur.donor)[0]] } })
    expect(noProject.body.code).toBe('UNKNOWN_PROJECT')
    expect((await fm.put('/report-settings', { hq: { ...cur.hq, autoSendDay: 31 }, donor: cur.donor })).status).toBe(400)
  })

  it('can be changed only by someone who edits settings', async () => {
    const cur = (await ed.get('/report-settings')).body
    expect((await ed.put('/report-settings', cur)).status).toBe(403)
    expect((await acc.put('/report-settings', cur)).status).toBe(403)
  })

  it('fills the subject and text for the person pressing "Send by email"', async () => {
    const hq = (await ed.get(`/reports/delivery?kind=hq&period=${PERIOD}&lang=en`)).body
    expect(hq.subject).toBe('Sudan office monthly report — September 2026')
    expect(hq.body).toContain('Dear ')
    expect(hq.body).toContain('Dr. Mona Elfatih')
    expect(hq.body).not.toMatch(/\{\w+\}/)
    expect(hq.to).toEqual(['hq.reports@phf-kw.org'])
    expect(hq.approvalRequired).toBe(true)
    const ar = (await ed.get(`/reports/delivery?kind=hq&period=${PERIOD}&lang=ar`)).body
    expect(ar.subject).toContain('2026')
    expect(ar.body).toContain('د. منى الفاتح')
    const pid = (await ed.get('/projects')).body[0]
    const donor = (await ed.get(`/reports/delivery?kind=donor&period=${PERIOD}&projectId=${pid.id}&lang=en`)).body
    expect(donor.subject).toContain(pid.code)
    expect(donor.body).not.toMatch(/\{\w+\}/)
    expect((await ed.get(`/reports/delivery?kind=donor&period=${PERIOD}`)).body.code).toBe('PROJECT_REQUIRED')
  })
})

describe('approving and sending the HQ report', () => {
  let attachmentId = ''

  it('keeps the text, and only the approver role can approve', async () => {
    const d = await fm.put(`/reports/hq/${PERIOD}/draft`, { summary: { ar: 'ملخص', en: 'Summary' }, plan: { ar: 'خطة', en: 'Plan' } })
    expect(d.status).toBe(200)
    expect(d.body).toMatchObject({ status: 'draft', summary: { en: 'Summary' } })
    expect((await acc.put(`/reports/hq/${PERIOD}/draft`, { summary: null })).status).toBe(403) // view only
    const wrong = await fm.post(`/reports/hq/${PERIOD}/approve`)
    expect(wrong.status).toBe(403)
    expect(wrong.body.message.en).toContain('Executive Director')
  })

  it('will not send before approval, before the PDF is uploaded, or before email is set up', async () => {
    const up = await upload(fm, pdf, `hq:${PERIOD}`)
    expect(up.status).toBe(201)
    attachmentId = up.body.id
    const msg = { kind: 'hq', period: PERIOD, attachmentId, to: ['hq.reports@phf-kw.org'], cc: [], subject: 'Report', body: 'Attached' }
    expect((await fm.post('/reports/send', msg)).body.code).toBe('NOT_APPROVED')
    expect((await ed.post(`/reports/hq/${PERIOD}/approve`)).status).toBe(201)
    expect((await fm.post('/reports/send', msg)).body.code).toBe('EMAIL_NOT_READY')
    expect(mails).toHaveLength(0)
  })

  it('sends the PDF by email with copies, logs it, and marks the report sent', async () => {
    await admin.put('/channels/email', emailCfg)
    const r = await fm.post('/reports/send', { kind: 'hq', period: PERIOD, attachmentId, to: ['hq.reports@phf-kw.org', 'ceo@phf-kw.org'], cc: ['director@kphfs.org'], subject: 'Sudan monthly report', body: 'Please find attached.' })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ status: 'sent', kind: 'hq', period: PERIOD })
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toBe('hq.reports@phf-kw.org, ceo@phf-kw.org')
    expect(mails[0].cc).toEqual(['director@kphfs.org'])
    expect(mails[0].auto).toBe(false) // a person sent it; it is not an automatic message
    expect(mails[0].attachments?.[0].content.equals(pdf)).toBe(true)
    expect(mails[0].attachments?.[0].contentType).toBe('application/pdf')
    const log = (await ed.get(`/reports/sent?kind=hq&period=${PERIOD}`)).body
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ status: 'sent', sentByEn: 'Abdelrahim Hassan Elnour', subject: 'Sudan monthly report' })
    expect((await ed.get(`/reports/monthly?period=${PERIOD}`)).body.draft.status).toBe('sent')
  })

  it('does not send the same message twice on a double click', async () => {
    const r = await fm.post('/reports/send', { kind: 'hq', period: PERIOD, attachmentId, to: ['hq.reports@phf-kw.org'], cc: [], subject: 'Again', body: 'Again' })
    expect(r.body.code).toBe('ALREADY_SENT_JUST_NOW')
    expect(mails).toHaveLength(1)
  })

  it('accepts only the PDF that belongs to this report', async () => {
    const other = await upload(fm, pdf, 'hq:2026-08')
    const mismatch = await fm.post('/reports/send', { kind: 'hq', period: PERIOD, attachmentId: other.body.id, to: ['a@b.org'], cc: [], subject: 's', body: 'b' })
    expect(mismatch.body.code).toBe('BAD_ATTACHMENT')
    const img = await upload(fm, png, `hq:${PERIOD}`, 'chart.png')
    expect((await fm.post('/reports/send', { kind: 'hq', period: PERIOD, attachmentId: img.body.id, to: ['a@b.org'], cc: [], subject: 's', body: 'b' })).body.code).toBe('NOT_PDF')
    expect((await fm.post('/reports/send', { kind: 'hq', period: PERIOD, attachmentId: 'nope', to: ['a@b.org'], cc: [], subject: 's', body: 'b' })).body.code).toBe('BAD_ATTACHMENT')
    expect((await fm.post('/reports/send', { kind: 'hq', period: PERIOD, attachmentId, to: [], cc: [], subject: 's', body: 'b' })).status).toBe(400)
  })

  it('editing an approved report sends it back to draft, so what goes out is what was approved', async () => {
    const up = await upload(fm, Buffer.concat([pdf, Buffer.from(' v2')]), `hq:2026-07`)
    await ed.post('/reports/hq/2026-07/approve')
    expect((await ed.get('/reports/monthly?period=2026-07')).body.draft.status).toBe('approved')
    const e = await fm.put('/reports/hq/2026-07/draft', { summary: { ar: 'معدّل', en: 'Edited' } })
    expect(e.body.status).toBe('draft')
    expect(e.body.approvedById).toBeNull()
    // Saving identical text again does not undo a fresh approval.
    await ed.post('/reports/hq/2026-07/approve')
    expect((await fm.put('/reports/hq/2026-07/draft', { summary: { ar: 'معدّل', en: 'Edited' } })).body.status).toBe('approved')
    expect((await fm.post('/reports/send', { kind: 'hq', period: '2026-07', attachmentId: up.body.id, to: ['a@b.org'], cc: [], subject: 's', body: 'b' })).status).toBe(201)
  })

  it('records a failed send, tells the person, and lets them try again', async () => {
    const up = await upload(fm, Buffer.concat([pdf, Buffer.from(' v3')]), 'hq:2026-06')
    await ed.post('/reports/hq/2026-06/approve')
    const body = { kind: 'hq', period: '2026-06', attachmentId: up.body.id, to: ['a@b.org'], cc: [], subject: 's', body: 'b' }
    failWith = 'Connection refused'
    const bad = await fm.post('/reports/send', body)
    expect(bad.status).toBe(502)
    expect(bad.body.code).toBe('SEND_FAILED')
    expect((await ed.get('/reports/monthly?period=2026-06')).body.draft.status).toBe('approved') // not marked sent
    expect((await ed.get('/reports/sent?period=2026-06')).body[0]).toMatchObject({ status: 'failed', error: 'Connection refused' })
    failWith = null
    expect((await fm.post('/reports/send', body)).status).toBe(201) // a failed attempt does not block the retry
  })

  it('sends a donor report without needing HQ approval', async () => {
    const p = (await ed.get('/projects')).body[0]
    const up = await upload(fm, Buffer.concat([pdf, Buffer.from(' donor')]), `donor:${PERIOD}:${p.id}`, 'donor.pdf')
    const r = await fm.post('/reports/send', { kind: 'donor', period: PERIOD, projectId: p.id, attachmentId: up.body.id, to: ['grants@donor.org'], cc: [], subject: 'Donor report', body: 'Attached' })
    expect(r.status).toBe(201)
    expect(r.body.projectId).toBe(p.id)
    expect((await fm.post('/reports/send', { kind: 'donor', period: PERIOD, attachmentId: up.body.id, to: ['grants@donor.org'], cc: [], subject: 's', body: 'b' })).body.code).toBe('PROJECT_REQUIRED')
  })

  it('does not allow sending when approval is switched off to be required again', async () => {
    const cur = (await ed.get('/report-settings')).body
    await fm.put('/report-settings', { hq: { ...cur.hq, requireApproval: false }, donor: cur.donor })
    const up = await upload(fm, Buffer.concat([pdf, Buffer.from(' v5')]), 'hq:2026-05')
    expect((await fm.post('/reports/send', { kind: 'hq', period: '2026-05', attachmentId: up.body.id, to: ['a@b.org'], cc: [], subject: 's', body: 'b' })).status).toBe(201)
    await fm.put('/report-settings', { hq: { ...cur.hq, requireApproval: true }, donor: cur.donor })
  })
})
