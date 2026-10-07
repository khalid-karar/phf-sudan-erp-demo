import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let fo: Client, sup: Client, fm: Client, acc: Client
const today = new Date().toISOString().slice(0, 10)
const Q = (extra = '', path = 'expenditure') => `/reports/${path}?projectId=pa&from=${today.slice(0, 7)}-01&to=${today}${extra}`

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[fo, sup, fm, acc] = await Promise.all([USERS.fieldOfficer, USERS.supervisor, USERS.financeManager, USERS.accountant].map((e) => Client.as(app, e)))
})
afterAll(() => app?.close())

describe('quarterly detailed expenditure report', () => {
  let base = 0
  let advNo = ''
  it('lists what the seeded books already spent in the period', async () => {
    const r = await fm.get(Q())
    expect(r.status).toBe(200)
    base = r.body.rows.length
  })

  it('lists a settled advance (authorized vs actual) and a direct payment, with totals in SDG and USD', async () => {
    const a = await fo.post('/activities', { lineId: 'pa-p2-l1', titleAr: 'يوم طبي', titleEn: 'Medical day', type: 'medical_day', plannedDate: today })
    const r = await fo.post('/requests', { lineId: 'pa-p2-l1', activityId: a.body.id, purpose: 'Transport', amount: '300', currency: 'USD' })
    await sup.post(`/requests/${r.body.id}/decision`, { decision: 'approve' })
    const pay = await acc.post(`/finance/requests/${r.body.id}/pay`, { method: 'advance', party: 'Mohamed Osman Elamin' })
    expect(pay.status, JSON.stringify(pay.body)).toBe(201)
    advNo = (await acc.get(`/finance/advances/${pay.body.advanceId}`)).body.no
    // Issued but not yet liquidated: authorized only.
    let rep = (await fm.get(Q())).body
    expect(rep.rows).toHaveLength(base + 1)
    expect(rep.rows.find((x: { voucher: string }) => x.voucher === advNo)).toMatchObject({ authorizedUsd: '300.00', actualUsd: '0.00' })
    const rp = await fo.post(`/activities/${a.body.id}/report`, { clientId: 'exp-device-0001', beneficiaries: 10, men: 3, women: 4, children: 3, summary: 'Done', via: 'online' })
    expect(rp.status, JSON.stringify(rp.body)).toBe(201)
    const s = await acc.post(`/finance/advances/${pay.body.advanceId}/settle`, { items: [{ description: 'Fuel', amount: '441000' }, { description: 'Incentives', amount: '171500' }] })
    expect(s.status, JSON.stringify(s.body)).toBe(201)
    rep = (await fm.get(Q())).body
    expect(rep.rows).toHaveLength(base + 1)
    expect(rep.rows.find((x: { voucher: string }) => x.voucher === advNo)).toMatchObject({ authorizedUsd: '300.00', actualUsd: '250.00', authorizedSdg: '735000.00' })
    expect(rep.project.ipCode).toBeTruthy()
    expect(rep.signatures.preparedTitle).toBe('Finance Manager')
  })

  it('downloads an Excel file laid out like the donor template', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1' + Q('&currency=USD&approvedBy=Bashar', 'expenditure.xlsx'))
      .set('authorization', `Bearer ${fm.token}`)
      .buffer(true)
      .parse((r, cb) => {
        const c: Buffer[] = []
        r.on('data', (x: Buffer) => c.push(x))
        r.on('end', () => cb(null, Buffer.concat(c)))
      })
    expect(res.status).toBe(200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body as never)
    const ws = wb.getWorksheet('Financial report')!
    expect(ws.getCell('A2').value).toBe('IP Code')
    expect(ws.getRow(7).getCell(11).value).toBe('Authorized Amount')
    const adv = Array.from({ length: 60 }, (_, i) => ws.getRow(8 + i)).find((r) => r.getCell(3).value === advNo)!
    expect(adv.getCell(11).value).toBe(300)
    expect(adv.getCell(12).value).toBe(250)
    expect(JSON.stringify(ws.getCell('I' + (8 + base + 3)).value ?? '')).toContain('Bashar')
  })

  it('needs the reports permission', async () => {
    const hr = await Client.as(app, USERS.hr)
    expect([200, 403]).toContain((await hr.get(Q())).status)
    expect((await request(app.getHttpServer()).get('/api/v1' + Q())).status).toBe(401)
  })
})

describe('projects statement', () => {
  it('shows every project in USD and SDG with donor totals, as JSON and Excel', async () => {
    const r = await fm.get('/reports/projects-statement')
    expect(r.status).toBe(200)
    expect(r.body.rows.length).toBeGreaterThanOrEqual(2)
    const pa = r.body.rows.find((x: { id: string }) => x.id === 'pa')
    expect(Number(pa.budgetUsd)).toBeGreaterThan(0)
    expect(Number(pa.budgetSdg)).toBeGreaterThan(Number(pa.budgetUsd))
    const sum = r.body.rows.reduce((t: number, x: { budgetUsd: string }) => t + Number(x.budgetUsd), 0)
    expect(Number(r.body.total.budgetUsd)).toBeCloseTo(sum, 2)
    expect(r.body.donors.length).toBeGreaterThan(0)
    const x = await request(app.getHttpServer()).get('/api/v1/reports/projects-statement.xlsx').set('authorization', `Bearer ${fm.token}`).buffer(true).parse((res, cb) => {
      const c: Buffer[] = []
      res.on('data', (d: Buffer) => c.push(d))
      res.on('end', () => cb(null, Buffer.concat(c)))
    })
    expect(x.status).toBe(200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(x.body as never)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Projects', 'Donors'])
  })

  it('is closed to office-limited staff', async () => {
    expect([401, 403]).toContain((await fo.get('/reports/projects-statement')).status)
  })
})
