import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createDb, createPool } from '../src/db/client'
import { seed } from '../scripts/seed'

export const PASSWORD = 'Test-Pass-2026'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test'
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123'
process.env.NODE_ENV = 'test'
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? `${process.env.TMPDIR ?? '/tmp'}/phf-test-uploads`

export const USERS = {
  fieldOfficer: 'm.osman@kphfs.org', // Kassala, office-scoped
  fieldOfficerFsh: 'a.haroun@kphfs.org', // El Fasher
  supervisor: 's.eltayeb@kphfs.org',
  financeManager: 'finance@kphfs.org',
  director: 'director@kphfs.org',
  accountant: 'accounts@kphfs.org',
  hr: 'hr@kphfs.org',
  admin: 'it@kphfs.org',
} as const

export async function resetDb() {
  const pool = createPool(process.env.DATABASE_URL!)
  const db = createDb(pool)
  await db.transaction((tx) => seed(tx, PASSWORD))
  await pool.end()
}

export async function bootApp() {
  const { createApp } = await import('../src/app')
  const app = await createApp({ logger: false })
  await app.init()
  return app
}

export class Client {
  token = ''
  refresh = ''
  constructor(private readonly app: INestApplication) {}

  static async as(app: INestApplication, email: string, password = PASSWORD) {
    const c = new Client(app)
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password })
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`)
    c.token = r.body.accessToken
    c.refresh = r.body.refreshToken
    return c
  }

  private h = (req: request.Test) => (this.token ? req.set('authorization', `Bearer ${this.token}`) : req)
  get = (url: string) => this.h(request(this.app.getHttpServer()).get('/api/v1' + url))
  post = (url: string, body?: object) => this.h(request(this.app.getHttpServer()).post('/api/v1' + url)).send(body ?? {})
  put = (url: string, body?: object) => this.h(request(this.app.getHttpServer()).put('/api/v1' + url)).send(body ?? {})
  patch = (url: string, body?: object) => this.h(request(this.app.getHttpServer()).patch('/api/v1' + url)).send(body ?? {})
  delete = (url: string) => this.h(request(this.app.getHttpServer()).delete('/api/v1' + url))
}

export const anon = (app: INestApplication) => request(app.getHttpServer())
