import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { normalizeState } from '../src/budget/ice'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let fm: Client, fo: Client

/** A small donor budget file laid out like the real one: header block, then one row per budget item, an "X" row, totals. */
async function makeIce(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Sheet1').state = 'hidden'
  const ws = wb.addWorksheet('ICE_Q1_2026')
  ws.getCell('B3').value = 'IP Code:'
  ws.getCell('C3').value = 'PN9999'
  ws.getCell('B6').value = 'Exchange rate for the period'
  ws.getCell('C6').value = 3350
  ws.getCell('B7').value = 'Period: '
  ws.getCell('C7').value = '19/02/2026'
  ws.getCell('D7').value = new Date(Date.UTC(2026, 2, 31))
  ;['State', 'Activity ID ', 'Activity Title', 'Activity Description', 'Budget Item Description (Free text)', 'Nature of Transactions (Drop down menu)', 'Monitoring Account (Auto filled)', 'Fund (Drop down menu)', 'Unit of Measure: (Drop down menu)', 'Unit Quantity ', 'Duration', 'Unit Cost', 'Total USD'].forEach((h, i) => (ws.getRow(9).getCell(2 + i).value = h))
  rows.forEach((r, i) => r.forEach((v, j) => (ws.getRow(10 + i).getCell(2 + j).value = v)))
  const x = 10 + rows.length
  ;['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'].forEach((v, j) => (ws.getRow(x).getCell(2 + j).value = v))
  return Buffer.from(await wb.xlsx.writeBuffer())
}
//            state          act id    title        description       item             nature mon  fund    unit      qty dur cost
const R = (state: string, act: string, item: string, fund: string, qty: number, dur: number, cost: number) => [state, act, `${act} title`, `${act} description`, item, '', '', fund, 'Day', qty, dur, cost]
const FILE = () =>
  makeIce([
    R('gazira', 'GBVCAEPN9999', 'Facilitation fees', 'EUB98', 6, 9, 50), // 2,700
    R('Jazira ', 'GBVCAEPN9999', 'Refreshments', 'EUB98', 1, 1, 5325), // 5,325
    R('North Darfur', 'RHOPCPN9999', 'Stationery & other Office Supply', 'ZZT07', 2, 1, 618), // 1,236
    R('Gedarif ', 'RHOPCPN9999', 'Complaint boxs', 'ZZT07', 0, 1, 0), // zero → skipped
  ])

const post = (c: Client, url: string, buf: Buffer, fields: Record<string, string> = {}) => {
  const r = request(app.getHttpServer()).post(`/api/v1${url}`).set('authorization', `Bearer ${c.token}`).attach('file', buf, { filename: 'ICE.xlsx' })
  for (const [k, v] of Object.entries(fields)) r.field(k, v)
  return r
}
const F = { id: 'ice-1', nameAr: 'مشروع تجريبي', nameEn: 'Test project', donorAr: 'مانح', donorEn: 'Donor' }

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[fm, fo] = await Promise.all([USERS.financeManager, USERS.fieldOfficer].map((e) => Client.as(app, e)))
})
afterAll(() => app?.close())

describe('donor budget file import', () => {
  it('normalises state spellings', () => {
    expect(['gazira', 'Jazira ', 'Gezira'].map(normalizeState)).toEqual(['Gezira', 'Gezira', 'Gezira'])
    expect(normalizeState('Gedarif ')).toBe('Gedaref')
    expect(normalizeState('North Darfour ')).toBe('North Darfur')
    expect(normalizeState('Northern State ')).toBe('Northern State')
  })

  it('previews totals in USD and SDG without saving anything', async () => {
    const r = await post(fm, '/projects/import/preview', await FILE())
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ ipCode: 'PN9999', rate: 3350, lineCount: 3, totalUsd: '9261.00', totalSdg: '31024350.00', startDate: '2026-02-19', endDate: '2026-03-31' })
    expect(r.body.activities.map((a: { code: string; usd: string }) => [a.code, a.usd])).toEqual([['GBVCAEPN9999', '8025.00'], ['RHOPCPN9999', '1236.00']])
    expect(r.body.states.map((s: { key: string }) => s.key).sort()).toEqual(['Gezira', 'North Darfur'])
    expect(r.body.warnings).toHaveLength(1)
    expect((await fm.get('/projects/ice-1')).status).toBe(404)
  })

  it('creates the project, activities and lines with ceilings and keeps the file', async () => {
    const r = await post(fm, '/projects/import', await FILE(), F)
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ id: 'ice-1', lines: 3, activities: 2, totalUsd: '9261.00' })
    const p = (await fm.get('/projects/ice-1')).body
    expect(p).toMatchObject({ code: 'PN9999', ceilingUsd: '9261.00', ipCode: 'PN9999', budgetRate: '3350.0000' })
    expect(p.pillars.map((x: { code: string; ceilingUsd: string }) => [x.code, x.ceilingUsd])).toEqual([['GBVCAEPN9999', '8025.00'], ['RHOPCPN9999', '1236.00']])
    const l = p.pillars[0].lines[0]
    expect(l).toMatchObject({ ceilingUsd: '2700.00', fundCode: 'EUB98', state: 'Gezira', unit: 'Day', unitQty: '6.00', duration: '9.00', unitCostUsd: '50.00', nature: 'Individual consultants honoraria/fees', donorAccount: '71400', activityCode: 'GBVCAEPN9999' })
    const att = await fm.get('/attachments?ownerType=project&ownerId=ice-1')
    expect(att.body).toHaveLength(1)
  })

  it('refuses a second import with the same project id, a non-Excel file, and staff without permission', async () => {
    expect((await post(fm, '/projects/import', await FILE(), F)).status).toBeGreaterThanOrEqual(400)
    const junk = await post(fm, '/projects/import/preview', Buffer.from('not a workbook'))
    expect(junk.status).toBe(422)
    expect(junk.body.code).toBe('NOT_XLSX')
    expect((await post(fo, '/projects/import/preview', await FILE())).status).toBe(403)
  })

  it('lets the nature of transaction on a line be corrected, which sets its donor account', async () => {
    const line = (await fm.get('/projects/ice-1')).body.pillars[0].lines[1]
    const r = await fm.patch(`/projects/lines/${line.id}`, { nature: 'Purchase of fuel, petroleum and other oils' })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ nature: 'Purchase of fuel, petroleum and other oils', donorAccount: '72300' })
    expect((await fm.patch(`/projects/lines/${line.id}`, { nature: 'nonsense' })).status).toBe(422)
  })
})
