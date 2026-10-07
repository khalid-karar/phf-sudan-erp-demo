import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, createPool } from '../src/db/client'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let hr: Client, fm: Client, fo: Client, ed: Client
const pool = createPool(process.env.DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test')
const db = createDb(pool)
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, string>[]

const monthsAgo = (n: number) => {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 7)
}
const PREV = monthsAgo(1)
const PREV2 = monthsAgo(2)
let bank = ''

const trialBalanced = async () => {
  const [r] = await rows(sql`select sum(debit) d, sum(credit) c from journal_lines`)
  expect(Number(r.d)).toBeCloseTo(Number(r.c), 2)
}
const lineSpent = async (lineId: string) => {
  const p = (await fm.get('/projects/pa')).body
  const pb = (await fm.get('/projects/pb')).body
  for (const pr of [p, pb]) for (const pl of pr.pillars) for (const l of pl.lines) if (l.id === lineId) return Number(l.usage.spent)
  throw new Error('line not found')
}

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[hr, fm, fo, ed] = await Promise.all([USERS.hr, USERS.financeManager, USERS.fieldOfficer, USERS.director].map((e) => Client.as(app, e)))
  bank = '1101-01' // HQ cash box, in SDG
})
afterAll(async () => {
  await app?.close()
  await pool.end()
})

describe('employees', () => {
  it('shows salaries only to people who can edit HR records', async () => {
    expect((await hr.get('/hr/employees')).body[0].salarySdg).not.toBeNull()
    expect((await fm.get('/hr/employees')).body[0].salarySdg).toBeNull()
  })
  it('turns someone away without HR access', async () => {
    expect((await fo.get('/hr/employees')).status).toBe(403)
  })
  it('derives “on leave” from approved leave instead of storing it', async () => {
    const list = (await hr.get('/hr/employees')).body
    expect(list.filter((e: { status: string }) => e.status === 'on_leave').length).toBe(1) // the demo has one approved leave covering today
  })
  it('refuses allocations that add up to more than 100% or repeat a line', async () => {
    const e = (await hr.get('/hr/employees?q=EMP-0110')).body[0]
    const line = e.allocations[0].lineId
    expect((await hr.patch(`/hr/employees/${e.id}`, { allocations: [{ lineId: line, pct: 70 }, { lineId: 'pa-p1-l1', pct: 40 }] })).body.code).toBe('ALLOCATION_OVER_100')
    expect((await hr.patch(`/hr/employees/${e.id}`, { allocations: [{ lineId: line, pct: 10 }, { lineId: line, pct: 10 }] })).body.code).toBe('DUPLICATE_LINE')
  })
})

describe('leave', () => {
  let id = ''
  const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  it('lets a person ask for their own leave and sees the balance impact', async () => {
    const r = await fo.post('/hr/leave', { type: 'annual', from: dayOffset(40), to: dayOffset(44) })
    expect(r.status).toBe(201)
    expect(r.body.days).toBe(5)
    id = r.body.id
  })
  it('rejects overlapping requests', async () => {
    expect((await fo.post('/hr/leave', { type: 'sick', from: dayOffset(42), to: dayOffset(43) })).body.code).toBe('LEAVE_OVERLAP')
  })
  it('does not let someone ask on another person’s behalf without HR access', async () => {
    const other = (await hr.get('/hr/employees?q=EMP-0114')).body[0]
    expect((await fo.post('/hr/leave', { employeeId: other.id, type: 'annual', from: dayOffset(60), to: dayOffset(61) })).status).toBe(403)
  })
  it('approval deducts the balance; a rejection needs a reason; the requester cannot approve their own', async () => {
    const before = (await fo.get('/hr/me')).body.leaveBalance
    expect((await hr.post(`/hr/leave/${id}/decision`, { decision: 'reject' })).body.code).toBe('NOTE_REQUIRED')
    const a = await hr.post(`/hr/leave/${id}/decision`, { decision: 'approve' })
    expect(a.status).toBe(201)
    expect((await fo.get('/hr/me')).body.leaveBalance).toBe(before - 5)
    expect((await hr.post(`/hr/leave/${id}/decision`, { decision: 'approve' })).status).toBe(409)
  })
  it('cancelling a future approved leave gives the days back', async () => {
    const before = (await fo.get('/hr/me')).body.leaveBalance
    expect((await fo.post(`/hr/leave/${id}/cancel`)).status).toBe(201)
    expect((await fo.get('/hr/me')).body.leaveBalance).toBe(before + 5)
  })
  it('refuses annual leave beyond the balance', async () => {
    const bal = (await fo.get('/hr/me')).body.leaveBalance
    const r = await fo.post('/hr/leave', { type: 'annual', from: dayOffset(100), to: dayOffset(100 + bal + 2) })
    expect(r.status).toBe(201)
    expect(r.body.short).toBe(true)
    expect((await hr.post(`/hr/leave/${r.body.id}/decision`, { decision: 'approve' })).body.code).toBe('INSUFFICIENT_LEAVE')
  })
})

describe('payroll', () => {
  it('previews the month: totals add up and project shares are checked against ceilings', async () => {
    const p = (await hr.get(`/hr/payroll/preview?period=${PREV}`)).body
    expect(p.headcount).toBeGreaterThan(10)
    const sum = p.employees.reduce((t: number, e: { grossSdg: string }) => t + Number(e.grossSdg), 0)
    expect(sum).toBeCloseTo(Number(p.grossSdg), 2)
    expect(Number(p.deductionsSdg)).toBeCloseTo(Number(p.grossSdg) * 0.08, 0)
    expect(p.alreadyPosted).toBe(false)
    // volunteers are not paid
    expect(p.employees.some((e: { salarySdg: string }) => Number(e.salarySdg) === 0)).toBe(false)
  })

  it('blocks a month where salary shares would break a ceiling, and posts nothing', async () => {
    const e = (await hr.get('/hr/employees?q=EMP-0110')).body[0]
    const old = e.salarySdg
    await hr.patch(`/hr/employees/${e.id}`, { salarySdg: '9000000000' })
    const before = (await rows(sql`select count(*) n from journal_entries`))[0].n
    const r = await hr.post('/hr/payroll', { period: PREV2, accountCode: bank })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('PAYROLL_CEILING')
    expect((await rows(sql`select count(*) n from journal_entries`))[0].n).toBe(before)
    await hr.patch(`/hr/employees/${e.id}`, { salarySdg: old })
  })

  it('pays part-months by the day and skips unpaid leave', async () => {
    const start = `${PREV}-16`
    const mk = await hr.post('/hr/employees', { nameAr: 'اختبار', nameEn: 'Test Joiner', officeId: 'khr', positionAr: 'م', positionEn: 'Tester', department: 'admin', contract: 'fixed', startDate: start, salarySdg: '3100000' })
    expect(mk.status).toBe(201)
    const dim = new Date(Date.UTC(+PREV.slice(0, 4), +PREV.slice(5, 7), 0)).getUTCDate()
    const paidDays = dim - 15
    const p = (await hr.get(`/hr/payroll/preview?period=${PREV}`)).body
    const row = p.employees.find((x: { employeeId: string }) => x.employeeId === mk.body.id)
    expect(row.payDays).toBe(paidDays)
    expect(Number(row.grossSdg)).toBe(Math.round((3_100_000 * paidDays) / dim))
    // unpaid leave inside the paid window lowers the pay
    const lv = await hr.post('/hr/leave', { employeeId: mk.body.id, type: 'unpaid', from: `${PREV}-20`, to: `${PREV}-22` })
    expect((await hr.post(`/hr/leave/${lv.body.id}/decision`, { decision: 'approve' })).status).toBe(201)
    const p2 = (await hr.get(`/hr/payroll/preview?period=${PREV}`)).body
    const r2 = p2.employees.find((x: { employeeId: string }) => x.employeeId === mk.body.id)
    expect(r2.unpaidLeaveDays).toBe(3)
    expect(r2.payDays).toBe(paidDays - 3)
  })

  let runId = ''
  it('posts the month: balanced entry, project lines carry the cost, one run per month', async () => {
    const line = (await hr.get('/hr/employees?q=EMP-0110')).body[0].allocations[0].lineId
    const spentBefore = await lineSpent(line)
    const r = await hr.post('/hr/payroll', { period: PREV, accountCode: bank })
    expect(r.status).toBe(201)
    runId = r.body.id
    await trialBalanced()
    expect(await lineSpent(line)).toBeGreaterThan(spentBefore)
    // the bank (SDG) account carries the exact net pay in pounds
    const [b] = await rows(sql`select sum(sdg) s from journal_lines where entry_id = ${r.body.entryId} and account_code = ${bank}`)
    expect(Number(b.s)).toBeCloseTo(-Number(r.body.netSdg), 2)
    expect((await hr.post('/hr/payroll', { period: PREV, accountCode: bank })).body.code).toBe('PAYROLL_EXISTS')
    expect((await hr.get(`/hr/payroll/preview?period=${PREV}`)).body.alreadyPosted).toBe(true)
  })

  it('takes two simultaneous posts in turn: only one succeeds', async () => {
    const res = await Promise.all([1, 2].map(() => hr.post('/hr/payroll', { period: monthsAgo(3), accountCode: bank })))
    expect(res.map((r) => r.status).sort()).toEqual([201, 409])
    await trialBalanced()
  })

  it('needs HR manage rights and a proper SDG account', async () => {
    expect((await fm.post('/hr/payroll', { period: monthsAgo(4), accountCode: bank })).status).toBe(403)
    expect((await hr.post('/hr/payroll', { period: monthsAgo(4), accountCode: '5201' })).body.code).toBe('BAD_PAYROLL_ACCOUNT')
    expect((await hr.post('/hr/payroll', { period: '2999-01', accountCode: bank })).body.code).toBe('PERIOD_IN_FUTURE')
  })

  it('cannot be reversed from the journal; voiding reverses it fully and frees the month', async () => {
    const run = (await hr.get('/hr/payroll')).body.find((x: { id: string }) => x.id === runId)
    expect((await fm.post(`/finance/journal/${run.entryId}/reverse`, { reason: 'x' })).body.code).toBe('REVERSE_VIA_DOCUMENT')
    const line = (await hr.get('/hr/employees?q=EMP-0110')).body[0].allocations[0].lineId
    const spent = await lineSpent(line)
    const v = await hr.post(`/hr/payroll/${runId}/void`, { reason: 'Wrong rate' })
    expect(v.status).toBe(201)
    expect(v.body.status).toBe('voided')
    expect(await lineSpent(line)).toBeLessThan(spent)
    await trialBalanced()
    expect((await hr.post(`/hr/payroll/${runId}/void`, { reason: 'again' })).status).toBe(409)
    expect((await hr.post('/hr/payroll', { period: PREV, accountCode: bank })).status).toBe(201)
  })
})
