import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, bootApp, Client, PASSWORD, resetDb, USERS } from './helpers'

let app: INestApplication

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
})
afterAll(() => app?.close())

describe('sign-in', () => {
  it('rejects a wrong password with a bilingual message', async () => {
    const r = await anon(app).post('/api/v1/auth/login').send({ email: USERS.accountant, password: 'nope-nope-1' })
    expect(r.status).toBe(401)
    expect(r.body.code).toBe('BAD_CREDENTIALS')
    expect(r.body.message.ar).toBeTruthy()
  })

  it('needs a token for protected routes', async () => {
    expect((await anon(app).get('/api/v1/projects')).status).toBe(401)
  })

  it('locks the account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) await anon(app).post('/api/v1/auth/login').send({ email: USERS.hr, password: 'wrong-pass-1' })
    const r = await anon(app).post('/api/v1/auth/login').send({ email: USERS.hr, password: PASSWORD })
    expect(r.status).toBe(423)
    expect(r.body.code).toBe('ACCOUNT_LOCKED')
  })

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const c = await Client.as(app, USERS.accountant)
    const r1 = await anon(app).post('/api/v1/auth/refresh').send({ refreshToken: c.refresh })
    expect(r1.status).toBe(200)
    // Re-using the first token (as a thief would) fails and kills the new one too.
    expect((await anon(app).post('/api/v1/auth/refresh').send({ refreshToken: c.refresh })).status).toBe(401)
    expect((await anon(app).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status).toBe(401)
  })
})

describe('users and permissions', () => {
  it('hides modules the role has no access to', async () => {
    const fo = await Client.as(app, USERS.fieldOfficer)
    expect((await fo.get('/finance/accounts')).status).toBe(403)
    expect((await fo.get('/users')).status).toBe(403)
    expect((await fo.get('/projects')).status).toBe(200)
  })

  it('creates a user with a temporary password that must be changed first', async () => {
    const admin = await Client.as(app, USERS.admin)
    const r = await admin.post('/users', { email: 'new.clerk@kphfs.org', nameAr: 'كاتب', nameEn: 'Clerk', roleId: 'accountant', officeId: 'ksl' })
    expect(r.status).toBe(201)
    expect(r.body.temporaryPassword).toMatch(/^Phf-/)
    const clerk = await Client.as(app, 'new.clerk@kphfs.org', r.body.temporaryPassword)
    const blocked = await clerk.get('/finance/accounts')
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED')
    expect((await clerk.post('/auth/change-password', { currentPassword: r.body.temporaryPassword, newPassword: 'Clerk-Pass-2026' })).status).toBe(204)
    const again = await Client.as(app, 'new.clerk@kphfs.org', 'Clerk-Pass-2026')
    expect((await again.get('/finance/accounts')).status).toBe(200)
  })

  it('takes effect immediately when a user is deactivated', async () => {
    const admin = await Client.as(app, USERS.admin)
    const fo2 = await Client.as(app, USERS.fieldOfficerFsh)
    const users = (await admin.get('/users')).body as { id: string; email: string }[]
    const id = users.find((u) => u.email === USERS.fieldOfficerFsh)!.id
    expect((await admin.patch(`/users/${id}`, { active: false })).status).toBe(200)
    expect((await fo2.get('/projects')).status).toBe(401)
    await admin.patch(`/users/${id}`, { active: true })
  })

  it('never lets the organisation lose its last settings manager', async () => {
    const admin = await Client.as(app, USERS.admin)
    const perms = (await admin.get('/roles')).body.find((r: { id: string }) => r.id === 'admin').permissions
    const r = await admin.patch('/roles/admin', { permissions: { ...perms, settings: 'view' } })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('LAST_ADMIN')
  })

  it('records an audit trail', async () => {
    const admin = await Client.as(app, USERS.admin)
    await admin.post('/offices', { id: 'tst', nameAr: 'تجربة', nameEn: 'Test', stateAr: 'س', stateEn: 'S' })
    const { createDb, createPool } = await import('../src/db/client')
    const pool = createPool(process.env.DATABASE_URL!)
    const db = createDb(pool)
    const rows = await db.execute<{ action: string }>(`select action from audit_log where entity_id = 'tst'` as never)
    const box = await db.execute<{ code: string; currency: string }>(`select code, currency from accounts where office_id = 'tst'` as never)
    await pool.end()
    expect(rows.rows.map((r) => r.action)).toContain('office.create')
    // A new office gets its own SDG cash box automatically.
    expect(box.rows).toEqual([{ code: '1101-13', currency: 'SDG' }])
  })
})
