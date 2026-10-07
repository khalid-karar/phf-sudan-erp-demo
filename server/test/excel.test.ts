import type { INestApplication } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inspectZip } from '../src/activities/excel'
import { createDb, createPool } from '../src/db/client'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let fo: Client, foFsh: Client, admin: Client, acc: Client
const pool = createPool(process.env.DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test')
const db = createDb(pool)
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, string>[]

const bin = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}
const download = (c: Client, q = '') => request(app.getHttpServer()).get(`/api/v1/activities/excel/template${q}`).set('authorization', `Bearer ${c.token}`).buffer(true).parse(bin)
const upload = (c: Client, file: Buffer, dry = false) =>
  request(app.getHttpServer()).post(`/api/v1/activities/excel/import${dry ? '?dryRun=1' : ''}`).set('authorization', `Bearer ${c.token}`).attach('file', file, { filename: 'reports.xlsx' })

type Cells = (string | number | Date | null | { formula: string; result: number })[]
/** Takes the downloaded template, fills the given rows in and returns the new file, as an office would. */
async function fill(template: Buffer, data: Cells[]) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(template as never)
  const ws = wb.getWorksheet('التقارير')!
  data.forEach((v, i) => (ws.getRow(4 + i).values = v as never))
  return Buffer.from(await wb.xlsx.writeBuffer())
}
const daysAgo = (n: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - n))

let tpl: Buffer
let open: { id: string; code: string }[]

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[fo, foFsh, admin, acc] = await Promise.all([USERS.fieldOfficer, USERS.fieldOfficerFsh, USERS.admin, USERS.accountant].map((e) => Client.as(app, e)))
  open = (await fo.get('/activities?officeId=ksl&reported=no')).body
  tpl = (await download(fo)).body as Buffer
})
afterAll(async () => {
  await app?.close()
  await pool.end()
})

describe('the office template', () => {
  it('is an Excel file stamped with the office, listing the activities still waiting for a report', async () => {
    const r = await download(fo)
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('spreadsheetml')
    expect(r.headers['content-disposition']).toContain('phf-field-reports-ksl.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(r.body as never)
    expect(wb.getWorksheet('_meta')!.getCell('B3').value).toBe('ksl')
    const list = wb.getWorksheet('قوائم')!
    const codes = [...Array(open.length)].map((_, i) => list.getCell(`A${i + 2}`).value)
    expect(codes.sort()).toEqual(open.map((a) => a.code).sort())
    expect(open.length).toBeGreaterThan(1)
  })

  it('goes to the right office: limited accounts get their own, others must choose', async () => {
    expect((await download(fo, '?officeId=fsh')).status).toBe(403)
    expect((await download(fo, '?officeId=ksl')).status).toBe(200)
    const none = await request(app.getHttpServer()).get('/api/v1/activities/excel/template').set('authorization', `Bearer ${admin.token}`)
    expect(none.status).toBe(422)
    expect((await download(admin, '?officeId=nowhere')).status).toBe(404)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await download(admin, '?officeId=fsh&sample=1')).body as never)
    expect(wb.getWorksheet('_meta')!.getCell('B3').value).toBe('fsh')
    expect(wb.getWorksheet('التقارير')!.getCell('A6').value).toBe('ACT-XXX-9999') // the sample's deliberately bad row
  })
})

describe('checking a filled template', () => {
  it('tells the office what is wrong with each row and saves nothing on a dry run', async () => {
    const [a, b, c] = open
    const file = await fill(tpl, [
      [a.code, daysAgo(2), 10, 20, 5, 'Medical day, 35 patients', '', 120.5], // good
      ['ACT-NOPE-0001', daysAgo(1), 1, 1, 1, 'unknown activity'], // unknown
      [b.code, daysAgo(-5), 1, 1, 1, 'future date'],
      [b.code, daysAgo(1), 0, 0, 0, 'nobody came'],
      [b.code, daysAgo(1), 1.5, 2, 3, 'half a person'],
      [b.code, daysAgo(1), 4, 2, 1, ''], // no description
      [a.code, daysAgo(1), 1, 1, 1, 'same activity twice'],
      [c.code, 'not a date', 1, 1, 1, 'bad date'],
    ])
    const r = await upload(fo, file, true)
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ dryRun: true, total: 8, ready: 1, imported: 0, failed: 7 })
    const by = (line: number) => r.body.rows.find((x: { line: number }) => x.line === line)
    const msgs = (line: number) => by(line).errors.map((e: { en: string }) => e.en)
    expect(by(4).status).toBe('ok')
    expect(msgs(5)).toContain('Unknown activity number')
    expect(msgs(6)).toContain('Date is in the future')
    expect(msgs(7)).toContain('No beneficiaries entered')
    expect(msgs(8)).toContain('Beneficiary counts must be whole numbers')
    expect(msgs(9)).toContain('Description is missing')
    expect(msgs(10)).toContain('Activity repeated in the file')
    expect(msgs(11)).toContain('Date is not valid')
    expect(by(5).errors[0].ar).toBeTruthy()
    expect(Number((await rows(sql`select count(*)::int as n from field_reports where via = 'excel'`))[0].n)).toBe(0)
  })

  it('does not accept a template that belongs to another office, a file that is not the template, or something that is not Excel', async () => {
    const fsh = (await download(foFsh)).body as Buffer
    const other = await upload(fo, await fill(fsh, [['ACT-FSH-0001', daysAgo(1), 1, 1, 1, 'x']]), true)
    expect(other.status).toBe(403)
    const plain = new ExcelJS.Workbook()
    plain.addWorksheet('Sheet1').getCell('A1').value = 'hello'
    const notTemplate = await upload(fo, Buffer.from(await plain.xlsx.writeBuffer()), true)
    expect(notTemplate.body.code).toBe('TEMPLATE_NOT_TEMPLATE')
    const empty = await upload(fo, tpl, true)
    expect(empty.body.code).toBe('TEMPLATE_EMPTY')
    const junk = await upload(fo, Buffer.from('MZ this is a program, not a spreadsheet'), true)
    expect(junk.body.code).toBe('NOT_XLSX')
    const noFile = await request(app.getHttpServer()).post('/api/v1/activities/excel/import').set('authorization', `Bearer ${fo.token}`)
    expect(noFile.body.code).toBe('NO_FILE')
  })

  it('reads formula results and dates typed as text, like a spreadsheet user would produce', async () => {
    const [a, b] = open
    const file = await fill(tpl, [
      [a.code, '2026-09-20', { formula: '20+14', result: 34 }, 51, 40, 'Clinic day', '', ''],
      [b.code, daysAgo(1), 0, 22, 60, 'Mother and child follow-up', 'Test strips ran out', '75'],
    ])
    const r = await upload(fo, file, true)
    expect(r.body).toMatchObject({ ready: 2, failed: 0 })
  })

  it('is for people who can edit activities', async () => {
    const file = await fill(tpl, [[open[0].code, daysAgo(1), 1, 1, 1, 'x']])
    expect((await upload(acc, file, true)).status).toBe(403)
  })
})

describe('filing the reports', () => {
  let file: Buffer
  it('files the good rows as field reports and lists the rest', async () => {
    const [a, b, c] = open
    file = await fill(tpl, [
      [a.code, daysAgo(3), 34, 51, 40, 'Medical day in the village', 'Road closed for one day', 610.5],
      [b.code, daysAgo(2), 0, 22, 60, 'Mother and child follow-up', '', ''],
      [c.code, daysAgo(2), 0, 0, 0, 'forgot the numbers'],
    ])
    const r = await upload(fo, file)
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ dryRun: false, total: 3, imported: 2, failed: 1, ready: 0 })
    expect(r.body.rows[0]).toMatchObject({ status: 'imported' })
    expect(r.body.rows[0].reportNo).toMatch(/^TR-/)
    const saved = await rows(sql`select fr.beneficiaries, fr.men, fr.women, fr.children, fr.actual_usd::text as actual, fr.via, fr.issues, fr.submitted_by_id, a.code from field_reports fr join activities a on a.id = fr.activity_id where fr.via = 'excel' order by a.code`)
    expect(saved).toHaveLength(2)
    const first = saved.find((s) => s.code === a.code)!
    expect(first).toMatchObject({ beneficiaries: 125, men: 34, women: 51, children: 40, actual: '610.50', via: 'excel', issues: 'Road closed for one day' })
    expect((await rows(sql`select count(*)::int as n from audit_log where action = 'report.import_excel'`))[0].n).toBe(1)
  })

  it('does not file anything twice when the same file is uploaded again', async () => {
    const r = await upload(fo, file)
    expect(r.body).toMatchObject({ imported: 0, duplicates: 2, failed: 1 })
    expect(Number((await rows(sql`select count(*)::int as n from field_reports where via = 'excel'`))[0].n)).toBe(2)
  })

  it('refuses a second report for an activity that was reported another way in the meantime', async () => {
    const [, , , d] = open
    const f = await fill(tpl, [[d.code, daysAgo(1), 1, 2, 3, 'Filled in offline']])
    expect((await fo.post(`/activities/${d.id}/report`, { beneficiaries: 6, summary: 'Entered online first' })).status).toBe(201)
    const r = await upload(fo, f)
    expect(r.body).toMatchObject({ imported: 0, failed: 1 })
    expect(r.body.rows[0].errors[0].en).toBe('This activity already has a report')
  })
})

describe('opening a file safely', () => {
  it('rejects a zip that claims to unpack into something enormous', () => {
    const name = Buffer.from('big.xml')
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt32LE(2 * 1024 * 1024 * 1024, 24) // claims 2 GB
    central.writeUInt16LE(name.length, 28)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(1, 10)
    end.writeUInt32LE(local.length, 16)
    expect(inspectZip(Buffer.concat([local, central, end]))).toEqual({ ok: false, reason: 'TOO_BIG' })
    expect(inspectZip(Buffer.from('not a zip at all, just text'))).toEqual({ ok: false, reason: 'NOT_ZIP' })
  })
  it('accepts a real template', () => {
    expect(inspectZip(tpl)).toEqual({ ok: true })
  })
})
