import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let fo: Client, foFsh: Client, fm: Client, admin: Client
let existing: { id: string; no: string; nameAr: string; nameEn: string; birthYear: number; gender: string; officeId: string }

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[fo, foFsh, fm, admin] = await Promise.all([USERS.fieldOfficer, USERS.fieldOfficerFsh, USERS.financeManager, USERS.admin].map((e) => Client.as(app, e)))
  existing = (await fo.get('/patients?limit=1')).body.items[0]
})
afterAll(() => app?.close())

describe('registration and duplicates', () => {
  it('registers a person with their first service and a running number for the office', async () => {
    const r = await fo.post('/patients', { nameAr: 'سلمى بابكر الأمين', nameEn: 'Salma Babiker Elamin', gender: 'f', birthYear: 1990, locality: 'Kassala', service: { type: 'consultation' } })
    expect(r.status).toBe(201)
    expect(r.body.no).toMatch(/^BEN-KSL-\d{5}$/)
    const got = await fo.get(`/patients/${r.body.id}`)
    expect(got.body.services).toHaveLength(1)
    expect(got.body.nameKey).toBeUndefined() // internal columns are not exposed
  })

  it('warns about the same person in the same words, even with different Arabic spellings', async () => {
    const r = await fo.post('/patients', { nameAr: 'سلمي بابكر الامين', gender: 'f', birthYear: 1991 }) // ى/ي and أ/ا variants, a year off
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('DUPLICATE_SUSPECTED')
    expect(r.body.details.matches[0].nameAr).toBe('سلمى بابكر الأمين')
  })

  it('catches the same phone number under a different name', async () => {
    await fo.post('/patients', { nameAr: 'خديجة عمر', gender: 'f', birthYear: 1975, phone: '+249 912 000 111' })
    const r = await foFsh.post('/patients', { nameAr: 'اسم مختلف تماما', gender: 'm', birthYear: 1960, phone: '0912000111' })
    expect(r.status).toBe(409)
  })

  it('catches a duplicate registered at another office, and lets the clerk confirm they are different people', async () => {
    const body = { nameAr: existing.nameAr, gender: existing.gender, birthYear: existing.birthYear }
    const warn = await foFsh.post('/patients', body)
    expect(warn.status).toBe(409)
    // The warning only carries what is needed to recognise the person.
    expect(Object.keys(warn.body.details.matches[0]).sort()).toEqual(['birthYear', 'gender', 'id', 'nameAr', 'nameEn', 'no', 'officeId'])
    const ok = await foFsh.post('/patients', { ...body, confirmNotDuplicate: true })
    expect(ok.status).toBe(201)
  })

  it('does not treat people with different names or far-apart birth years as duplicates', async () => {
    expect((await fo.post('/patients', { nameAr: existing.nameAr, gender: existing.gender, birthYear: existing.birthYear + 20 })).status).toBe(201)
  })

  it('two clerks registering the same person at once: only one gets through unconfirmed', async () => {
    const body = { nameAr: 'عبدالقادر حمد النيل', gender: 'm', birthYear: 1980 }
    const res = await Promise.all([fo.post('/patients', body), foFsh.post('/patients', body)])
    expect(res.map((r) => r.status).sort()).toEqual([201, 409])
  })

  it('rejects impossible birth years and unknown offices', async () => {
    expect((await fo.post('/patients', { nameAr: 'اختبار اسم', gender: 'm', birthYear: 2999 })).status).toBe(400)
    expect((await admin.post('/patients', { nameAr: 'اختبار اسم', gender: 'm', birthYear: 1990, officeId: 'nope' })).status).toBe(404)
  })
})

describe('privacy and scope', () => {
  it('keeps an office-scoped user to their own office’s people', async () => {
    const list = (await fo.get('/patients?limit=200')).body.items
    expect(list.length).toBeGreaterThan(0)
    expect(new Set(list.map((b: { officeId: string }) => b.officeId))).toEqual(new Set(['ksl']))
    const other = (await admin.get('/patients?officeId=gdf&limit=1')).body.items[0]
    expect((await fo.get(`/patients/${other.id}`)).status).toBe(404)
    expect((await fo.post(`/patients/${other.id}/services`, { type: 'consultation' })).status).toBe(404)
    expect((await fo.patch(`/patients/${other.id}`, { locality: 'x' })).status).toBe(404)
  })
  it('needs the patients permission', async () => {
    expect((await fm.get('/patients')).status).toBe(403) // finance has none
  })
  it('does not let anyone register at another office', async () => {
    expect((await fo.post('/patients', { nameAr: 'فلان الفلاني', gender: 'm', birthYear: 1970, officeId: 'gdf' })).status).toBe(403)
  })
})

describe('services, search and merge', () => {
  it('records a service, refusing future dates and activities from another office', async () => {
    const id = existing.id
    expect((await fo.post(`/patients/${id}/services`, { type: 'medicines', date: '2999-01-01' })).body.code).toBe('FUTURE_DATE')
    const act = (await admin.get('/activities')).body.find((a: { officeId: string }) => a.officeId === 'gdf')
    expect((await fo.post(`/patients/${id}/services`, { type: 'medicines', activityId: act.id })).body.code).toBe('ACTIVITY_OTHER_OFFICE')
    const before = (await fo.get(`/patients/${id}`)).body.services.length
    expect((await fo.post(`/patients/${id}/services`, { type: 'medicines' })).status).toBe(201)
    expect((await fo.get(`/patients/${id}`)).body.services.length).toBe(before + 1)
  })

  it('finds people by name (any spelling), number or phone digits', async () => {
    expect((await fo.get('/patients?q=' + encodeURIComponent('سلمي'))).body.items.some((b: { nameAr: string }) => b.nameAr.startsWith('سلمى'))).toBe(true)
    expect((await fo.get(`/patients?q=${existing.no}`)).body.total).toBe(1)
    expect((await fo.get('/patients?q=912000111')).body.items.length).toBe(1)
  })

  it('merges a duplicate into the record to keep, moving its services', async () => {
    const keep = await fo.post('/patients', { nameAr: 'أحمد موسى إدريس', gender: 'm', birthYear: 1970, service: { type: 'consultation' } })
    const dup = await fo.post('/patients', { nameAr: 'أحمد موسى إدريس', gender: 'm', birthYear: 1970, phone: '0999888777', confirmNotDuplicate: true, service: { type: 'vaccination' } })
    expect((await fo.post(`/patients/${dup.body.id}/merge`, { intoId: keep.body.id })).status).toBe(403) // needs manage
    const m = await admin.post(`/patients/${dup.body.id}/merge`, { intoId: keep.body.id })
    expect(m.status).toBe(201)
    expect(m.body.servicesMoved).toBe(1)
    const k = (await admin.get(`/patients/${keep.body.id}`)).body
    expect(k.services).toHaveLength(2)
    expect(k.phone).toBe('0999888777') // blank filled from the duplicate
    expect((await admin.get(`/patients/${dup.body.id}`)).status).toBe(404)
    expect((await admin.post(`/patients/${keep.body.id}/merge`, { intoId: keep.body.id })).body.code).toBe('MERGE_SELF')
  })
})

describe('stats', () => {
  it('adds up: service types sum to total services, offices to the same', async () => {
    const s = (await admin.get('/patients/stats')).body
    expect(s.byType.reduce((t: number, x: { n: number }) => t + x.n, 0)).toBe(s.services)
    expect(s.byOffice.reduce((t: number, x: { n: number }) => t + x.n, 0)).toBe(s.services)
    expect(s.byMonth.reduce((t: number, x: { n: number }) => t + x.n, 0)).toBe(s.services)
    expect(s.women + s.men).toBe(s.registered)
    expect(s.peopleServed).toBeLessThanOrEqual(s.registered)
  })
  it('is limited to the user’s office when scoped', async () => {
    const s = (await fo.get('/patients/stats')).body
    expect(s.byOffice.every((o: { officeId: string }) => o.officeId === 'ksl')).toBe(true)
  })
})

describe('what the register screen needs', () => {
  it('shows the type of each person’s last service in the list', async () => {
    const items = (await fo.get('/patients?limit=50')).body.items as { services: number; lastServiceType: string | null }[]
    for (const i of items) expect(i.services > 0 ? !!i.lastServiceType : i.lastServiceType === null).toBe(true)
  })
  it('breaks the statistics down by age and by month of registration', async () => {
    const s = (await admin.get('/patients/stats')).body
    expect(s.ages.under5 + s.ages.a5_14 + s.ages.a15_49 + s.ages.over50).toBe(s.registered)
    expect(s.registeredByMonth.reduce((n: number, m: { n: number }) => n + m.n, 0)).toBe(s.registered)
    expect(s.registeredByOffice.reduce((n: number, m: { n: number }) => n + m.n, 0)).toBe(s.registered)
  })
})
