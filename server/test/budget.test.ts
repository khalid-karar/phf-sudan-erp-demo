import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let fo: Client, sup: Client, fm: Client, ed: Client, acc: Client

const LINE = 'pa-p1-l1' // Project A, 1.1 Mobile medical days — $1,000 left in the seed
const line = async (id: string) => {
  const p = (await fm.get('/projects/pa')).body
  for (const pl of p.pillars) for (const l of pl.lines) if (l.id === id) return l
  throw new Error('line not found')
}
const tb = async () => (await fm.get('/finance/reports/trial-balance')).body

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[fo, sup, fm, ed, acc] = await Promise.all([USERS.fieldOfficer, USERS.supervisor, USERS.financeManager, USERS.director, USERS.accountant].map((e) => Client.as(app, e)))
})
afterAll(() => app?.close())

describe('the demo story: ceiling → reallocation → request → approvals → payment', () => {
  let requestId = ''

  it('blocks a request that would pass the line ceiling and says by how much', async () => {
    expect((await line(LINE)).usage.available).toBe('1000.00')
    const r = await fo.post('/requests', { lineId: LINE, purpose: 'Mobile medical day — Wad Sharifey', amount: '4500000', currency: 'SDG' })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('CEILING_EXCEEDED')
    // 4,500,000 SDG at 2,450 = $1,836.73 → $836.73 short
    expect(r.body.details.shortfall).toBe('836.73')
    expect(r.body.details.levels[0]).toMatchObject({ level: 'line', ok: false })
  })

  it('moves money between lines through its own approval chain', async () => {
    const before = Number((await line('pa-p1-l2')).usage.pending)
    const r = await fo.post('/reallocations', { fromLineId: 'pa-p1-l2', toLineId: LINE, amountUsd: '900', reason: 'Extra mobile day requested by the locality' })
    expect(r.status).toBe(201)
    expect(r.body.steps.map((s: { roleId: string }) => s.roleId)).toEqual(['finance_manager', 'executive_director'])
    // The giving line has the money reserved immediately.
    expect(Number((await line('pa-p1-l2')).usage.pending)).toBe(before + 900)
    // Wrong role can't jump the queue.
    expect((await ed.post(`/reallocations/${r.body.id}/decision`, { decision: 'approve' })).status).toBe(403)
    expect((await fm.post(`/reallocations/${r.body.id}/decision`, { decision: 'approve' })).body.status).toBe('pending')
    expect((await ed.post(`/reallocations/${r.body.id}/decision`, { decision: 'approve' })).body.status).toBe('approved')
    expect((await line(LINE)).usage.ceiling).toBe('8900.00')
  })

  it('now accepts the request and routes it by amount', async () => {
    const r = await fo.post('/requests', { lineId: LINE, purpose: 'Mobile medical day — Wad Sharifey', amount: '4500000', currency: 'SDG' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.code).toMatch(/^SR-\d{4}$/)
    expect(r.body.amountUsd).toBe('1836.73')
    expect(r.body.steps.map((s: { roleId: string; status: string }) => [s.roleId, s.status])).toEqual([
      ['supervisor', 'pending'],
      ['finance_manager', 'waiting'],
    ])
    expect((await line(LINE)).usage.pending).toBe('1836.73')
    requestId = r.body.id
  })

  it('shows the request in the right inbox only', async () => {
    expect((await sup.get('/approvals/inbox')).body.requests.map((r: { id: string }) => r.id)).toContain(requestId)
    expect((await fm.get('/approvals/inbox')).body.requests.map((r: { id: string }) => r.id)).not.toContain(requestId)
  })

  it('needs a reason to reject, and refuses a second decision on the same step', async () => {
    expect((await sup.post(`/requests/${requestId}/decision`, { decision: 'reject' })).body.code).toBe('NOTE_REQUIRED')
    expect((await sup.post(`/requests/${requestId}/decision`, { decision: 'approve' })).status).toBe(200)
    expect((await sup.post(`/requests/${requestId}/decision`, { decision: 'approve' })).status).toBe(403)
    const r = await fm.post(`/requests/${requestId}/decision`, { decision: 'approve', note: 'OK' })
    expect(r.body.status).toBe('approved')
    const l = await line(LINE)
    expect(l.usage.committed).toBe('3636.73') // 1,800 already committed + this request
    expect(l.usage.available).toBe('63.27')
  })

  it('pays from the Kassala cash box and books the expense on the line', async () => {
    const r = await acc.post(`/finance/requests/${requestId}/pay`, { method: 'cash', party: 'Wad Sharifey health centre' })
    expect(r.status).toBe(201)
    expect(r.body.voucher.no).toMatch(/^PV-/)
    const e = (await fm.get(`/finance/journal/${r.body.entry.id}`)).body
    expect(e.lines).toHaveLength(2)
    const cr = e.lines.find((x: { credit: string }) => x.credit !== '0.00')
    expect(cr.sdg).toBe('-4500000.00') // the exact SDG that left the cash box
    const l = await line(LINE)
    expect(l.usage.spent).toBe('7036.73')
    expect(l.usage.committed).toBe('1800.00')
    expect((await tb()).balanced).toBe(true)
    // Paying twice is impossible.
    expect((await acc.post(`/finance/requests/${requestId}/pay`, { method: 'cash' })).body.code).toBe('NOT_APPROVED')
  })
})

describe('rules of the road', () => {
  it('stops people approving their own requests', async () => {
    const r = await sup.post('/requests', { officeId: 'ksl', lineId: 'pa-p2-l1', purpose: 'Supervisor purchase', amount: '100', currency: 'USD' })
    expect(r.status).toBe(201)
    const d = await sup.post(`/requests/${r.body.id}/decision`, { decision: 'approve' })
    expect(d.status).toBe(403)
  })

  it('keeps office-scoped users inside their office', async () => {
    const other = await fo.post('/requests', { officeId: 'fsh', lineId: 'pa-p2-l1', purpose: 'Not my office', amount: '50', currency: 'USD' })
    expect(other.status).toBe(403)
    const list = (await fo.get('/requests')).body as { officeId: string }[]
    expect(list.length).toBeGreaterThan(0)
    expect(new Set(list.map((r) => r.officeId))).toEqual(new Set(['ksl']))
  })

  it('lets only one of two simultaneous requests take the last money on a line', async () => {
    const l = await line('pa-p2-l3')
    const avail = Number(l.usage.available)
    const each = (Math.floor(avail * 0.6 * 100) / 100).toFixed(2) // each fits alone, both together don't
    const results = await Promise.all([1, 2, 3].map((i) => fo.post('/requests', { lineId: 'pa-p2-l3', purpose: `Race ${i}`, amount: each, currency: 'USD' })))
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422])
    expect(Number((await line('pa-p2-l3')).usage.available)).toBeGreaterThanOrEqual(0)
  })

  it('in soft mode, sends an over-ceiling request to the Executive Director instead of blocking it', async () => {
    expect((await fm.patch('/projects/pa/control', { controlMode: 'soft', tolerancePct: 10 })).status).toBe(200)
    const l = await line('pa-p2-l4')
    const over = (Number(l.usage.available) + 50).toFixed(2)
    const r = await fo.post('/requests', { lineId: 'pa-p2-l4', purpose: 'Slightly over', amount: over, currency: 'USD' })
    expect(r.status).toBe(201)
    expect(r.body.overCeiling).toBe(true)
    expect(r.body.steps.at(-1).roleId).toBe('executive_director')
    await fm.patch('/projects/pa/control', { controlMode: 'hard', tolerancePct: 0 })
  })

  it('reserves a pending reallocation on the giving line, not on the whole project', async () => {
    const before = (await fm.get('/projects/pa')).body.usage.available
    const r = await fo.post('/reallocations', { fromLineId: 'pa-p3-l2', toLineId: 'pa-p3-l1', amountUsd: '100', reason: 'Move within pillar 3' })
    expect(r.status).toBe(201)
    expect((await fm.get('/projects/pa')).body.usage.available).toBe(before)
    await fm.post(`/reallocations/${r.body.id}/decision`, { decision: 'reject', note: 'Not needed' })
  })

  it('previews the approval route for an amount', async () => {
    expect((await fm.get('/approval-rules/preview?amountUsd=7000')).body.chain).toEqual(['supervisor', 'finance_manager', 'executive_director'])
    expect((await fm.get('/approval-rules/preview?amountUsd=200')).body.chain).toEqual(['supervisor'])
  })
})
