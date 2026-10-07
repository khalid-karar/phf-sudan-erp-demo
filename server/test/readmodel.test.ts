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
