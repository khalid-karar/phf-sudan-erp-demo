import type { INestApplication } from '@nestjs/common'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let fo: Client, sup: Client, foFsh: Client, hr: Client, fm: Client, admin: Client
let act: { id: string }

// A tiny valid PNG, and a PDF, with the right first bytes.
const png = (extra = '') => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR-test-' + extra)])
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF')

const up = (c: Client, file: Buffer, name: string, ownerId = act.id, ownerType = 'activity', mime = 'application/octet-stream') =>
  request(app.getHttpServer()).post('/api/v1/attachments').set('authorization', `Bearer ${c.token}`).field('ownerType', ownerType).field('ownerId', ownerId).attach('file', file, { filename: name, contentType: mime })

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[fo, sup, foFsh, hr, fm, admin] = await Promise.all([USERS.fieldOfficer, USERS.supervisor, USERS.fieldOfficerFsh, USERS.hr, USERS.financeManager, USERS.admin].map((e) => Client.as(app, e)))
  act = (await fo.get('/activities')).body.find((a: { code: string }) => a.code === 'ACT-KSL-0128')
})
afterAll(() => app?.close())

describe('uploading', () => {
  let id = ''
  it('stores a receipt photo and serves back exactly the same bytes', async () => {
    const buf = png('receipt-1')
    const r = await up(fo, buf, 'receipt.png', act.id, 'activity', 'image/png')
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ mime: 'image/png', size: buf.length, fileName: 'receipt.png', officeId: 'ksl' })
    expect(r.body.sha256).toBeUndefined() // storage details are not exposed
    id = r.body.id
    const got = await request(app.getHttpServer()).get(`/api/v1/attachments/${id}/file`).set('authorization', `Bearer ${fo.token}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(got.status).toBe(200)
    expect(got.headers['content-type']).toBe('image/png')
    expect(got.headers['x-content-type-options']).toBe('nosniff')
    expect((got.body as Buffer).equals(buf)).toBe(true)
    expect((await fo.get(`/attachments?ownerType=activity&ownerId=${act.id}`)).body).toHaveLength(1)
  })

  it('judges the file by its content, not by its name or the type the browser claims', async () => {
    const r = await up(fo, Buffer.from('MZ\x90\x00 this is really a program'), 'photo.jpg', act.id, 'activity', 'image/jpeg')
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('FILE_TYPE')
    expect((await up(fo, Buffer.from('<html><script>alert(1)</script></html>'), 'x.png', act.id, 'activity', 'image/png')).body.code).toBe('FILE_TYPE')
  })

  it('names the file by its real type and keeps Arabic names', async () => {
    const r = await up(fo, pdf, 'إيصال شراء', act.id, 'activity', 'application/pdf')
    expect(r.status).toBe(201)
    expect(r.body.fileName).toBe('إيصال شراء.pdf')
    expect(r.body.mime).toBe('application/pdf')
    expect((await up(fo, png('p'), '../../etc/passwd', act.id)).body.fileName).toBe('passwd.png') // no folders in names
  })

  it('stores identical files once', async () => {
    const same = png('dup')
    await up(fo, same, 'a.png')
    await up(fo, same, 'b.png')
    const dir = process.env.UPLOAD_DIR!
    const files = readdirSync(dir).flatMap((d) => readdirSync(join(dir, d)))
    expect(files.filter((f) => !f.endsWith('.tmp')).length).toBe(new Set(files).size)
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it('refuses a file over the size limit', async () => {
    const big = Buffer.concat([png('big'), Buffer.alloc(10 * 1024 * 1024)])
    expect((await up(fo, big, 'big.png')).status).toBe(413)
  })

  it('refuses a missing record, and a missing file', async () => {
    expect((await up(fo, png('x'), 'x.png', 'no-such-id')).status).toBe(404)
    const r = await request(app.getHttpServer()).post('/api/v1/attachments').set('authorization', `Bearer ${fo.token}`).field('ownerType', 'activity').field('ownerId', act.id)
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('NO_FILE')
  })

  it('limits how many files one record can hold', async () => {
    const other = (await fo.get('/activities')).body.find((a: { code: string }) => a.code === 'ACT-KSL-0135')
    const res = await Promise.all(Array.from({ length: 52 }, (_, i) => up(fo, png('n' + i), `f${i}.png`, other.id)))
    expect(res.filter((r) => r.status === 201)).toHaveLength(50)
    expect(res.filter((r) => r.body.code === 'TOO_MANY_FILES')).toHaveLength(2)
  })
})

describe('who can see and change files', () => {
  let id = ''
  beforeAll(async () => {
    id = (await up(fo, png('private'), 'private.png')).body.id
  })
  it('keeps another office out', async () => {
    expect((await foFsh.get(`/attachments?ownerType=activity&ownerId=${act.id}`)).status).toBe(404)
    expect((await foFsh.get(`/attachments/${id}/file`)).status).toBe(404)
    expect((await up(foFsh, png('y'), 'y.png')).status).toBe(404)
    expect((await foFsh.delete(`/attachments/${id}`)).status).toBe(404)
  })
  it('needs the module permission for the record (HR has none for activities)', async () => {
    expect((await hr.get(`/attachments?ownerType=activity&ownerId=${act.id}`)).status).toBe(403)
    expect((await hr.get(`/attachments/${id}/file`)).status).toBe(403)
  })
  it('lets head-office staff with access see files from any office', async () => {
    expect((await admin.get(`/attachments/${id}/file`)).status).toBe(200)
  })
  it('lets only the uploader or a manager remove a file; the file then disappears', async () => {
    expect((await sup.delete(`/attachments/${id}`)).status).toBe(403) // same office, edit access, but not the uploader
    expect((await fo.delete(`/attachments/${id}`)).status).toBe(200)
    expect((await fo.get(`/attachments/${id}/file`)).status).toBe(404)
    const again = (await up(fo, png('private2'), 'p2.png')).body.id
    expect((await admin.delete(`/attachments/${again}`)).status).toBe(200) // a manager can
  })
  it('follows the other kinds of record: spending requests need project access, and report files are head-office only', async () => {
    const req = (await fo.get('/requests')).body[0]
    expect((await up(fo, png('rq'), 'rq.png', req.id, 'spend_request')).status).toBe(201)
    expect((await up(fm, png('rq2'), 'rq2.png', req.id, 'spend_request')).status).toBe(201) // finance manager: project edit? either way never 5xx
    expect((await up(fo, png('rp'), 'rp.png', 'any', 'report')).status).toBeGreaterThanOrEqual(403)
  })
})
