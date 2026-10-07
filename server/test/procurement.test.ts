import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb } from './helpers'

let app: INestApplication
let stores: Client
const pr = {
  department: 'Programs', unit: 'UNFPA', reason: 'Lab consumables', method: 'competitive' as const, requiredDate: '2026-11-01', deliveryPlace: 'Kassala', deliveryTerms: 'DDP', requestedBy: 'Hassan',
  lines: [
    { item: 'Lab consumables', unit: 'Once', spec: 'Kit', qty: 1, unitCost: 2000000, freq: 1 },
    { item: 'Gloves', unit: 'Box', spec: 'Medium', qty: 20, unitCost: 12000, freq: 1 },
  ],
}

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  stores = await Client.as(app, 'stores@kphfs.org')
})
afterAll(() => app?.close())

describe('procurement cycle: PR → RFQ → bids → award → PO → receipt', () => {
  let id = ''
  let data: Record<string, unknown> = { pr }

  it('opens a file with a requisition and numbers it', async () => {
    const r = await stores.post('/procurement', { data })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.no).toMatch(/^PC-\d{4}-0001$/)
    expect(r.body).toMatchObject({ status: 'draft', totalSdg: 2240000 })
    expect(r.body.forms.po).toBe(r.body.no.replace('PC-', 'PO-'))
    id = r.body.id
    expect((await stores.post('/procurement', { data })).body.no).toMatch(/0002$/)
  })

  it('moves through the stages as each form is filled in', async () => {
    data = { ...data, rfq: { issueDate: '2026-10-01', closeDate: '2026-10-05', vendors: [{ name: 'A Co' }, { name: 'B Co' }] } }
    expect((await stores.put(`/procurement/${id}`, { data })).body.status).toBe('rfq')
    data = { ...data, bids: [{ vendor: 'A Co', unitPrices: [1400000, 11000], deliveryDays: 3, accepted: true, note: '' }, { vendor: 'B Co', unitPrices: [1550000, 12000], deliveryDays: 5, accepted: true, note: '' }] }
    expect((await stores.put(`/procurement/${id}`, { data })).body.status).toBe('evaluated')
    data = { ...data, award: { vendor: 'A Co', reason: 'Lowest compliant price' }, po: { date: '2026-10-07', vendor: { name: 'A Co', place: 'Kassala', phone: '' }, shipTo: 'Kassala store' } }
    expect((await stores.put(`/procurement/${id}`, { data })).body.status).toBe('ordered')
    data = { ...data, receipt: { date: '2026-10-12', store: 'Main', lines: [{ received: 1 }, { received: 20 }], notes: '' } }
    const r = await stores.put(`/procurement/${id}`, { data })
    expect(r.body.status).toBe('received')
    expect((await stores.get(`/procurement/${id}`)).body.data.award.vendor).toBe('A Co')
  })

  it('refuses inconsistent forms and edits after receipt', async () => {
    expect((await stores.put(`/procurement/${id}`, { data })).status).toBe(409) // closed
    const two = (await stores.get('/procurement')).body.find((c: { id: string }) => c.id !== id)
    const bad = { pr, bids: [{ vendor: 'X', unitPrices: [1], accepted: true, note: '' }] }
    expect((await stores.put(`/procurement/${two.id}`, { data: bad })).body.code).toBe('BID_LINES')
    const badAward = { pr, bids: [{ vendor: 'X', unitPrices: [1, 2], accepted: true, note: '' }], award: { vendor: 'Y', reason: '' } }
    expect((await stores.put(`/procurement/${two.id}`, { data: badAward })).body.code).toBe('AWARD_VENDOR')
    expect((await stores.put(`/procurement/${two.id}`, { data: { pr, receipt: { lines: [{ received: 1 }, { received: 1 }] } } })).body.code).toBe('RECEIPT_NEEDS_PO')
    expect((await stores.post(`/procurement/${id}/cancel`)).status).toBe(409)
    expect((await stores.post(`/procurement/${two.id}/cancel`)).body.status).toBe('cancelled')
  })

  it('needs the supply permission', async () => {
    const fo = await Client.as(app, 'm.osman@kphfs.org')
    expect([200, 403]).toContain((await fo.get('/procurement')).status)
    const anon = await Client.as(app, 'hr@kphfs.org')
    expect((await anon.post('/procurement', { data: { pr } })).status).toBe(403)
  })
})
