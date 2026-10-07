import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let fo: Client, sup: Client, fm: Client, acc: Client

const today = new Date().toISOString().slice(0, 10)
const thisPeriod = today.slice(0, 7)
const tb = async () => (await fm.get('/finance/reports/trial-balance')).body
const lineUsage = async (id: string) => {
  const p = (await fm.get(`/projects/${id.split('-')[0]}`)).body
  for (const pl of p.pillars) for (const l of pl.lines) if (l.id === id) return l.usage
}

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[fo, sup, fm, acc] = await Promise.all([USERS.fieldOfficer, USERS.supervisor, USERS.financeManager, USERS.accountant].map((e) => Client.as(app, e)))
})
afterAll(() => app?.close())

describe('the seeded books', () => {
  it('balance', async () => {
    const t = await tb()
    expect(t.balanced).toBe(true)
    expect(Number(t.totalDebit)).toBeGreaterThan(0)
  })
})

describe('cash advance tied to a field activity', () => {
  let activityId = ''
  let advanceId = ''

  it('issues an advance only for an activity', async () => {
    const a = await fo.post('/activities', { lineId: 'pa-p2-l1', titleAr: 'يوم طبي — ود الحليو', titleEn: 'Medical day — Wad Elhelew', type: 'medical_day', plannedDate: today })
    expect(a.status).toBe(201)
    expect(a.body.code).toMatch(/^ACT-KSL-/)
    activityId = a.body.id
    const r = await fo.post('/requests', { lineId: 'pa-p2-l1', activityId, purpose: 'Transport and incentives', amount: '300', currency: 'USD' })
    expect(r.status).toBe(201)
    await sup.post(`/requests/${r.body.id}/decision`, { decision: 'approve' })
    const before = await lineUsage('pa-p2-l1')
    const pay = await acc.post(`/finance/requests/${r.body.id}/pay`, { method: 'advance', party: 'Mohamed Osman Elamin' })
    expect(pay.status, JSON.stringify(pay.body)).toBe(201)
    advanceId = pay.body.advanceId
    const after = await lineUsage('pa-p2-l1')
    // The money is still committed (held by staff), not yet spent.
    expect(after.spent).toBe(before.spent)
    expect(after.committed).toBe(before.committed)
    expect((await tb()).balanced).toBe(true)
  })

  it('cannot be settled before the field report is in', async () => {
    const r = await acc.post(`/finance/advances/${advanceId}/settle`, { items: [{ description: 'Fuel', amount: '612500' }] })
    expect(r.body.code).toBe('REPORT_REQUIRED')
  })

  it('accepts the field report once, even if the device sends it twice', async () => {
    const body = { clientId: 'device-7f3a-0001', beneficiaries: 120, men: 30, women: 50, children: 40, summary: 'Day completed', via: 'offline' }
    const r1 = await fo.post(`/activities/${activityId}/report`, body)
    const r2 = await fo.post(`/activities/${activityId}/report`, body)
    expect(r1.status).toBe(201)
    expect(r2.body.duplicate).toBe(true)
    expect(r2.body.id).toBe(r1.body.id)
    expect((await fo.post(`/activities/${activityId}/report`, { ...body, clientId: undefined })).body.code).toBe('REPORT_EXISTS')
  })

  it('settles against receipts in pounds: spent goes to the line, the exact change back to the cash box', async () => {
    const before = await lineUsage('pa-p2-l1')
    // $300 was handed out as 735,000 SDG at 2,450. Receipts: 441,000 + 171,500 = 612,500 SDG; change 122,500 SDG.
    expect((await acc.get(`/finance/advances/${advanceId}`)).body).toMatchObject({ currency: 'SDG', amount: '735000.00', issueRate: '2450.0000' })
    const r = await acc.post(`/finance/advances/${advanceId}/settle`, { items: [{ description: 'Fuel', receiptNo: 'R-11', amount: '441000' }, { description: 'Incentives', amount: '171500' }] })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body).toMatchObject({ status: 'settled', spent: '612500.00', spentUsd: '250.00', returnedUsd: '50.00', reimbursedUsd: '0.00' })
    const e = (await fm.get(`/finance/journal/${r.body.entry.id}`)).body
    const back = e.lines.find((l: { debit: string; sdg: string | null }) => l.sdg !== null && l.debit !== '0.00')
    expect(back.sdg).toBe('122500.00') // the pounds actually handed back
    const after = await lineUsage('pa-p2-l1')
    expect(Number(after.spent) - Number(before.spent)).toBeCloseTo(250)
    expect(Number(before.committed) - Number(after.committed)).toBeCloseTo(300)
    expect((await tb()).balanced).toBe(true)
  })
})

describe('the ledger protects itself', () => {
  it('rejects an unbalanced manual entry', async () => {
    const r = await acc.post('/finance/journal', {
      date: today,
      memo: 'Bank charges',
      lines: [
        { account: '5205', debit: '10', officeId: 'khr' },
        { account: '1102-02', credit: '9', officeId: 'khr' },
      ],
    })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('LEDGER_UNBALANCED')
  })

  it('refuses header accounts and requires SDG amounts on SDG accounts', async () => {
    const header = await acc.post('/finance/journal', { date: today, memo: 'x', lines: [{ account: '52', debit: '5', officeId: 'khr' }, { account: '1102-02', credit: '5', officeId: 'khr' }] })
    expect(header.body.code).toBe('LEDGER_HEADER_ACCOUNT')
    const noSdg = await acc.post('/finance/journal', { date: today, memo: 'x', lines: [{ account: '5205', debit: '5', officeId: 'ksl' }, { account: '1101-03', credit: '5', officeId: 'ksl' }] })
    expect(noSdg.body.code).toBe('LEDGER_SDG_MISSING')
    const wrongWay = await acc.post('/finance/journal', { date: today, memo: 'x', lines: [{ account: '5205', debit: '5', officeId: 'ksl' }, { account: '1101-03', credit: '5', sdg: '12250', officeId: 'ksl' }] })
    expect(wrongWay.body.code).toBe('LEDGER_SDG_SIGN')
  })

  it('keeps manual entries away from staff advances and over-ceiling lines', async () => {
    const adv = await acc.post('/finance/journal', { date: today, memo: 'x', lines: [{ account: '1103', debit: '5', officeId: 'khr' }, { account: '1102-02', credit: '5', officeId: 'khr' }] })
    expect(adv.body.code).toBe('MANUAL_CONTROL_ACCOUNT')
    const big = await acc.post('/finance/journal', {
      date: today,
      memo: 'Reclassify',
      lines: [
        { account: '5101', debit: '999999', officeId: 'khr', projectId: 'pa', budgetLineId: 'pa-p1-l3' },
        { account: '1102-02', credit: '999999', officeId: 'khr' },
      ],
    })
    expect(big.body.code).toBe('CEILING_EXCEEDED')
  })

  it('posts a manual entry and reverses it, keeping both', async () => {
    const e = await acc.post('/finance/journal', { date: today, memo: 'Bank charges', lines: [{ account: '5205', debit: '12.50', officeId: 'khr' }, { account: '1102-02', credit: '12.50', officeId: 'khr' }] })
    expect(e.status).toBe(201)
    expect((await acc.post(`/finance/journal/${e.body.id}/reverse`, { reason: 'Wrong account' })).status).toBe(403) // accountants can't reverse
    const rev = await fm.post(`/finance/journal/${e.body.id}/reverse`, { reason: 'Wrong account' })
    expect(rev.status).toBe(201)
    expect((await fm.post(`/finance/journal/${e.body.id}/reverse`, { reason: 'Again' })).body.code).toBe('ALREADY_REVERSED')
  })

  it('sends document entries back to their document', async () => {
    const j = (await fm.get('/finance/journal?source=payment&limit=1')).body
    const r = await fm.post(`/finance/journal/${j[0].id}/reverse`, { reason: 'test' })
    expect(r.body.code).toBe('REVERSE_VIA_DOCUMENT')
  })
})

describe('receipts, exchange rates and revaluation', () => {
  it('records a grant received in SDG at today’s rate', async () => {
    const r = await acc.post('/finance/receipts', { accountCode: '1102-01', revenueAccountCode: '4101', amount: '24500000', currency: 'SDG', party: 'Kuwait HQ', memo: 'October transfer', projectId: 'pa' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.voucher.amountUsd).toBe('10000.00')
  })

  it('revalues SDG balances when the rate moves, then has nothing left to revalue', async () => {
    expect((await acc.post('/finance/rates', { date: today, rate: '2600', source: 'Bank of Khartoum' })).status).toBe(201)
    const p = (await fm.get('/finance/revaluation')).body
    expect(p.rows.length).toBeGreaterThan(0)
    expect(p.net).toBeLessThan(0) // SDG lost value → loss
    const r = await fm.post('/finance/revaluation', {})
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect((await tb()).balanced).toBe(true)
    expect((await fm.post('/finance/revaluation', {})).body.code).toBe('NOTHING_TO_REVALUE')
    const cash = (await fm.get('/finance/cash-position')).body as { code: string; usd: string; sdg: string | null }[]
    const bank = cash.find((c) => c.code === '1102-01')!
    expect(Number(bank.usd)).toBeCloseTo(Number(bank.sdg) / 2600, 1)
  })
})

describe('month close', () => {
  const last = (() => {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - 1)
    return d.toISOString().slice(0, 7)
  })()

  it('will not close a month that has not ended', async () => {
    const s = (await fm.get(`/finance/close/${thisPeriod}`)).body as { officeId: string; checks: Record<string, boolean> }[]
    expect(s.find((x) => x.officeId === 'dgl')!.checks.monthEnded).toBe(false)
  })

  it('lists what blocks each office, and locks a clean office’s month', async () => {
    const status = (await fm.get(`/finance/close/${last}`)).body as { officeId: string; canClose: boolean; checks: Record<string, boolean> }[]
    const dgl = status.find((s) => s.officeId === 'dgl')!
    expect(dgl.checks.cashCounted).toBe(false)
    expect((await fm.post(`/finance/close/${last}/dgl`)).body.code).toBe('CLOSE_CHECKS_FAILED')
    await acc.put(`/finance/close/${last}/dgl/cash-counted`, { counted: true })
    const r = await fm.post(`/finance/close/${last}/dgl`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })

  it('then refuses new entries for that office and month', async () => {
    const r = await acc.post('/finance/journal', { date: `${last}-15`, memo: 'Late', lines: [{ account: '5205', debit: '5', officeId: 'dgl' }, { account: '1102-02', credit: '5', officeId: 'khr' }] })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('LEDGER_PERIOD_CLOSED')
  })

  it('keeps the exchange rates of a closed month', async () => {
    const r = await acc.post('/finance/rates', { date: `${last}-10`, rate: '2111', source: 'late edit' })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('RATE_PERIOD_CLOSED')
  })

  it('can be reopened by the finance manager, with a reason', async () => {
    expect((await fm.post(`/finance/close/${last}/dgl/reopen`, { reason: 'Late invoice from the pharmacy' })).status).toBe(200)
  })
})

describe('chart of accounts', () => {
  it('adds an account under a header with a suggested code', async () => {
    const s = (await fm.get('/finance/accounts/suggest-code/52')).body.code
    expect(s).toBe('5210')
    const r = await fm.post('/finance/accounts', { code: s, parentCode: '52', nameAr: 'صيانة المركبات', nameEn: 'Vehicle maintenance' })
    expect(r.status).toBe(201)
    expect(r.body.type).toBe('expense')
  })

  it('will not deactivate an account that still has a balance', async () => {
    expect((await fm.patch('/finance/accounts/1102-02', { active: false })).body.code).toBe('ACCOUNT_HAS_BALANCE')
  })
})

describe('office-scoped finance staff', () => {
  it('only see and act on their own office', async () => {
    const admin = await Client.as(app, USERS.admin)
    const perms = (await admin.get('/roles')).body.find((r: { id: string }) => r.id === 'accountant').permissions
    expect((await admin.post('/roles', { id: 'office_accountant', nameAr: 'محاسب مكتب', nameEn: 'Office accountant', permissions: perms, scope: 'office', canApprove: false })).status).toBe(201)
    const u = await admin.post('/users', { email: 'ksl.accounts@kphfs.org', nameAr: 'محاسب كسلا', nameEn: 'Kassala accountant', roleId: 'office_accountant', officeId: 'ksl', password: 'Kassala-Acc-2026' })
    expect(u.status).toBe(201)
    const ka = await Client.as(app, 'ksl.accounts@kphfs.org', 'Kassala-Acc-2026')
    const all = (await fm.get('/finance/advances')).body as { id: string; officeId: string }[]
    const other = all.find((a) => a.officeId !== 'ksl')!
    expect((await ka.get(`/finance/advances/${other.id}`)).status).toBe(404)
    expect(((await ka.get('/finance/advances')).body as { officeId: string }[]).every((a) => a.officeId === 'ksl')).toBe(true)
    expect(((await ka.get('/finance/cash-position')).body as { office_id: string }[]).every((a) => a.office_id === 'ksl')).toBe(true)
    expect((await ka.put(`/finance/close/${thisPeriod}/gdf/cash-counted`, { counted: true })).status).toBe(403)
    const je = await ka.post('/finance/journal', { date: today, memo: 'x', lines: [{ account: '5205', debit: '5', officeId: 'gdf' }, { account: '1102-02', credit: '5', officeId: 'gdf' }] })
    expect(je.status).toBe(403)
  })
})
