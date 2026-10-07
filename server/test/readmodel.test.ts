import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let admin: Client, fo: Client

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[admin, fo] = await Promise.all([USERS.admin, USERS.fieldOfficer].map((e) => Client.as(app, e)))
})
afterAll(() => app?.close())

describe('projects in one request', () => {
  it('returns every project as a tree with its usage', async () => {
    const list = (await admin.get('/projects')).body
    const trees = (await admin.get('/projects/tree')).body
    expect(trees.map((t: { id: string }) => t.id)).toEqual(list.map((p: { id: string }) => p.id))
    for (const t of trees) {
      expect(t.pillars.length).toBeGreaterThan(0)
      expect(t.pillars[0].lines.length).toBeGreaterThan(0)
      expect(t.pillars[0].lines[0].usage).toBeDefined()
    }
  })
})

describe('cash spending rows', () => {
  it('add up, line by line, to what the budget says was spent', async () => {
    const rows = (await admin.get('/projects/expenses')).body as { lineId: string; amountUsd: string; projectId: string }[]
    const trees = (await admin.get('/projects/tree')).body
    expect(rows.length).toBeGreaterThan(10)
    for (const t of trees)
      for (const pl of t.pillars)
        for (const l of pl.lines) {
          const sum = rows.filter((r) => r.lineId === l.id).reduce((a, r) => a + Math.round(Number(r.amountUsd) * 100), 0) / 100
          expect(sum, `line ${l.code} of ${t.code}`).toBeCloseTo(Number(l.usage.spent), 2)
        }
    expect(rows.every((r) => r.projectId)).toBe(true)
  })

  it('shows an office-limited user only their own office’s rows, but the same project totals', async () => {
    const mine = (await fo.get('/projects/expenses')).body as { officeId: string }[]
    const all = (await admin.get('/projects/expenses')).body as { officeId: string }[]
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.length).toBeLessThan(all.length)
    expect(new Set(mine.map((r) => r.officeId))).toEqual(new Set(['ksl']))
    expect((await fo.get('/projects/pa')).body.usage.spent).toBe((await admin.get('/projects/pa')).body.usage.spent)
  })

  it('flags rows whose activity already has a field report', async () => {
    const rows = (await admin.get('/projects/expenses')).body as { activityCode: string | null; hasTechReport: boolean }[]
    expect(rows.some((r) => r.activityCode && r.hasTechReport)).toBe(true)
    expect(rows.some((r) => !r.hasTechReport)).toBe(true) // spending nobody has reported on yet
  })
})

describe('people directory', () => {
  it('gives every signed-in user the names they need, without phone numbers', async () => {
    const r = await fo.get('/users/directory')
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(5)
    expect(r.body[0]).toHaveProperty('nameAr')
    expect(JSON.stringify(r.body)).not.toContain('+249')
    expect((await fo.get('/users')).status).toBe(403) // the full list stays with settings managers
  })
})

describe('office manager', () => {
  it('is kept on the office, and must be a real active person', async () => {
    const offices = (await admin.get('/offices')).body
    expect(offices.find((o: { id: string }) => o.id === 'khr').managerId).toBe('u-ed')
    expect((await admin.patch('/offices/ksl', { managerId: 'u-sup' })).body.managerId).toBe('u-sup')
    const bad = await admin.patch('/offices/ksl', { managerId: 'nobody' })
    expect(bad.status).toBe(422)
    expect(bad.body.code).toBe('UNKNOWN_USER')
    expect((await admin.patch('/offices/ksl', { managerId: null })).body.managerId).toBeNull()
  })
})

describe('linking spending to an activity', () => {
  it('fills the empty link once, and never lets the amount change', async () => {
    const rows = (await admin.get('/projects/expenses')).body as { id: string; activityCode: string | null; officeId: string; amountUsd: string }[]
    const loose = rows.find((r) => !r.activityCode)
    if (!loose) return // the seed links every row
    const acts = (await admin.get('/activities?limit=500')).body as { id: string; code: string; officeId: string }[]
    const act = acts.find((a) => a.officeId === loose.officeId) ?? acts[0]
    const ok = await admin.post(`/projects/expenses/${loose.id}/link`, { activityId: act.id })
    expect(ok.status).toBe(201)
    const after = (await admin.get('/projects/expenses')).body as typeof rows
    const now = after.find((r) => r.id === loose.id)!
    expect(now.activityCode).toBe(act.code)
    expect(now.amountUsd).toBe(loose.amountUsd)
    const again = await admin.post(`/projects/expenses/${loose.id}/link`, { activityId: act.id })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('ALREADY_LINKED')
  })
})

describe('editing a planned activity', () => {
  it('changes what was planned, for your own office only', async () => {
    const mine = ((await fo.get('/activities?limit=500')).body as { id: string; officeId: string }[])[0]
    const ok = await fo.patch(`/activities/${mine.id}`, { inKind: true, location: 'Wad Sharifey' })
    expect(ok.status).toBe(200)
    expect(ok.body.inKind).toBe(true)
    const other = ((await admin.get('/activities?limit=500')).body as { id: string; officeId: string }[]).find((a) => a.officeId !== mine.officeId)!
    expect((await fo.patch(`/activities/${other.id}`, { inKind: true })).status).toBe(403)
  })
})
