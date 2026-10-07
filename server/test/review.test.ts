import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let hr: Client, fm: Client, fo: Client, store: Client

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[hr, fm, fo, store] = await Promise.all([USERS.hr, USERS.financeManager, USERS.fieldOfficer, 'stores@kphfs.org'].map((e) => Client.as(app, e)))
})
afterAll(() => app?.close())

describe('final review fixes', () => {
  it('shows a project’s budget tree only to roles that can open projects', async () => {
    const id = (await fm.get('/projects/tree')).body[0].id
    expect((await fm.get(`/projects/${id}`)).status).toBe(200)
    expect((await hr.get(`/projects/${id}`)).status).toBe(403)
  })

  it('does not let a role without activity access link ledger lines to activities', async () => {
    expect((await hr.post('/projects/expenses/1/link', { activityId: 'x' })).status).toBe(403)
  })

  it('keeps organisation-wide finance figures from office-limited accounts', async () => {
    // The field officer has no finance access at all; the guard answers before any data is read.
    expect((await fo.get('/finance/reports/activities?period=2026-09')).status).toBe(403)
  })

  it('refuses to change an item’s unit value while it is in stock', async () => {
    const items = (await store.get('/supply/items')).body as { id: string; unitValue: string }[]
    const r = await store.patch(`/supply/items/${items[0].id}`, { unitValue: String(Number(items[0].unitValue) + 1) })
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.code).toBe('STOCK_ON_HAND')
    expect((await store.patch(`/supply/items/${items[0].id}`, { nameEn: 'Renamed item' })).status).toBe(200) // other edits are fine
  })
})
