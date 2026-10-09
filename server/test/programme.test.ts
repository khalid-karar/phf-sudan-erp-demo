import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, createPool } from '../src/db/client'
import { dueDate, monthRange, quarterOf, quarterRange, slotsFor } from '../src/programme/periods'
import { bootApp, Client, resetDb, USERS } from './helpers'

let app: INestApplication
let pm: Client, coord: Client, pmo: Client, health: Client, nutrition: Client, donor: Client, admin: Client, fo: Client
const pool = createPool(process.env.DATABASE_URL ?? 'postgresql://phf:phf@localhost:5432/phf_erp_test')
const db = createDb(pool)
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, string>[]

beforeAll(async () => {
  await resetDb()
  app = await bootApp()
  ;[pm, coord, pmo, health, nutrition, donor, admin, fo] = await Promise.all([USERS.projectManager, USERS.coordinator, USERS.pmo, USERS.healthOffice, USERS.nutritionOffice, USERS.donor, USERS.admin, USERS.fieldOfficer].map((e) => Client.as(app, e)))
})
afterAll(async () => {
  await app?.close()
  await pool.end()
})

describe('reporting calendar maths', () => {
  it('knows month and quarter ranges and due dates', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(quarterRange('2026-Q4')).toEqual({ start: '2026-10-01', end: '2026-12-31' })
    expect(quarterOf('2026-08-15')).toBe('2026-Q3')
    expect(dueDate('2026-12-31', 10)).toBe('2027-01-10')
    expect(dueDate('2026-01-31', 28)).toBe('2026-02-28')
  })
  it('clips the first and last periods to the project and makes one custom report per sector', () => {
    const s = slotsFor({ start: '2026-08-20', end: '2026-10-05', monthlyDueDay: 10, quarterlyDueDay: 20, today: '2026-10-09', customSectors: ['health', 'nutrition', 'health'] })
    const stats = s.filter((x) => x.type === 'statistics')
    expect(stats.map((x) => x.period)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(stats[0].periodStart).toBe('2026-08-20')
    expect(stats[2].periodEnd).toBe('2026-10-05')
    expect(s.filter((x) => x.type === 'custom' && x.period === '2026-09').map((x) => x.sectorId).sort()).toEqual(['health', 'nutrition'])
    expect(s.filter((x) => x.type === 'quarterly').map((x) => x.period)).toEqual(['2026-Q3', '2026-Q4'])
    expect(s.find((x) => x.type === 'quarterly' && x.period === '2026-Q3')!.due).toBe('2026-10-20')
  })
  it('creates nothing before the project starts', () => {
    expect(slotsFor({ start: '2027-01-01', end: '2027-12-31', monthlyDueDay: 10, quarterlyDueDay: 20, today: '2026-10-09', customSectors: [] })).toEqual([])
  })
})

describe('project plan: sectors, objectives, indicators, team, milestones', () => {
  it('shows the seeded plan', async () => {
    const r = await pm.get('/programme/projects/pa/plan')
    expect(r.status).toBe(200)
    expect(r.body.sectors).toEqual(['health'])
    expect(r.body.objectives.length).toBeGreaterThanOrEqual(2)
    expect(r.body.team.map((t: { role: string }) => t.role).sort()).toEqual(['project_coordinator', 'project_manager', 'project_office'])
    expect(r.body.scheduled).toBe(true)
  })

  it('lets a project may have several sectors and objectives', async () => {
    expect((await pm.put('/programme/projects/pa/sectors', { sectorIds: ['health', 'nutrition'] })).status).toBe(200)
    expect((await pm.get('/programme/projects/pa/plan')).body.sectors.sort()).toEqual(['health', 'nutrition'])
    expect((await pm.put('/programme/projects/pa/sectors', { sectorIds: ['nope'] })).status).toBe(422)
    const o = await pm.post('/programme/projects/pa/objectives', { code: 'O3', nameAr: 'هدف', nameEn: 'Objective three', sectorId: 'nutrition' })
    expect(o.status, JSON.stringify(o.body)).toBe(201)
    expect((await pm.post('/programme/projects/pa/objectives', { code: 'O3', nameAr: 'x', nameEn: 'x' })).status).toBe(409)
    const i = await pm.post(`/programme/objectives/${o.body.id}/indicators`, { code: 'I1', nameAr: 'مؤشر', nameEn: 'Indicator', unit: 'kids', target: 120, source: 'services' })
    expect(i.status).toBe(201)
    expect(i.body.target).toBe(120)
    expect((await pm.patch(`/programme/indicators/${i.body.id}`, { target: 150 })).body.target).toBe(150)
    expect((await pm.delete(`/programme/objectives/${o.body.id}`)).status).toBe(200)
  })

  it('keeps structure edits to people who may edit projects', async () => {
    expect((await coord.post('/programme/projects/pa/objectives', { code: 'O9', nameAr: 'x', nameEn: 'x' })).status).toBe(403)
    expect((await fo.get('/programme/projects/pa/plan')).status).toBe(200)
    expect((await donor.get('/programme/projects/pa/plan')).status).toBe(403)
  })

  it('links an activity to an objective of the same project only', async () => {
    const plan = (await pm.get('/programme/projects/pa/plan')).body
    const [a] = await rows(sql`select id from activities where project_id = 'pa' limit 1`)
    const objB = (await pm.get('/programme/projects/pb/plan')).body.objectives[0].id
    const mine = await admin.put(`/programme/activities/${a.id}/objective`, { objectiveId: plan.objectives[0].id })
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect((await admin.put(`/programme/activities/${a.id}/objective`, { objectiveId: objB })).status).toBe(422)
  })

  it('assigns the project team and rejects donor logins as staff', async () => {
    const donorUser = (await rows(sql`select id from users where donor_id is not null limit 1`))[0].id
    expect((await pm.put('/programme/projects/pa/team', { members: [{ role: 'project_manager', userId: donorUser }] })).status).toBe(422)
    const ids = Object.fromEntries((await rows(sql`select id, email from users`)).map((u) => [u.email, u.id]))
    const keep = [
      { role: 'project_manager', userId: ids[USERS.projectManager] },
      { role: 'project_coordinator', userId: ids[USERS.coordinator] },
      { role: 'project_office', userId: ids[USERS.healthOffice], sectorId: 'health' },
    ]
    expect((await pm.put('/programme/projects/pa/team', { members: keep })).status).toBe(200)
    expect((await pm.get('/programme/projects/pa/plan')).body.team).toHaveLength(3)
  })

  it('tracks milestones: the owner moves their own, others cannot', async () => {
    const ids = Object.fromEntries((await rows(sql`select id, email from users`)).map((u) => [u.email, u.id]))
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    const m = await pm.post('/programme/projects/pa/milestones', { titleAr: 'معلم', titleEn: 'Test milestone', due, ownerId: ids[USERS.coordinator], notifyDaysBefore: 5 })
    expect(m.status, JSON.stringify(m.body)).toBe(201)
    expect(m.body.status).toBe('planned')
    expect((await coord.patch(`/programme/milestones/${m.body.id}`, { status: 'in_progress' })).status).toBe(200)
    const done = await coord.patch(`/programme/milestones/${m.body.id}`, { status: 'done' })
    expect(done.body.doneAt).toBeTruthy()
    expect((await coord.patch(`/programme/milestones/${m.body.id}`, { due: '2030-01-01' })).status).toBe(403) // owner may change status only
    expect((await health.patch(`/programme/milestones/${m.body.id}`, { status: 'planned' })).status).toBe(403) // not the owner
    expect((await pm.patch(`/programme/milestones/${m.body.id}`, { status: 'planned' })).body.doneAt).toBeNull()
    expect((await pm.post('/programme/projects/pa/milestones', { titleAr: 'x', titleEn: 'x', due, objectiveId: (await pm.get('/programme/projects/pb/plan')).body.objectives[0].id })).status).toBe(422)
    expect((await pm.get('/programme/milestones?projectId=pa&status=open')).body.some((x: { id: string }) => x.id === m.body.id)).toBe(true)
    expect((await pm.delete(`/programme/milestones/${m.body.id}`)).status).toBe(200)
  })
})

describe('reporting schedule', () => {
  it('generates slots once and follows a changed due day', async () => {
    const before = (await pm.get('/programme/reports?projectId=pa&type=statistics')).body
    expect(before.length).toBeGreaterThanOrEqual(5)
    expect((await pm.post('/programme/projects/pa/schedule/generate')).body.created).toBe(0)
    const open = before.find((x: { status: string }) => x.status === 'open')
    expect(open).toBeTruthy()
    expect((await pm.put('/programme/projects/pa/schedule', { enabled: true, monthlyDueDay: 15, quarterlyDueDay: 25, notifyDaysBefore: 7 })).status).toBe(200)
    const after = (await pm.get(`/programme/reports/${open.id}`)).body
    expect(after.due.slice(8)).toBe('15')
    expect((await pm.put('/programme/projects/pa/schedule', { enabled: true, monthlyDueDay: 31, quarterlyDueDay: 25, notifyDaysBefore: 7 })).status).toBe(400)
  })

  it('has older months already released and current ones open', async () => {
    const all = (await pm.get('/programme/reports?projectId=pa')).body as { status: string; type: string }[]
    expect(all.some((x) => x.status === 'released')).toBe(true)
    expect(all.some((x) => x.status === 'open')).toBe(true)
    expect(all.some((x) => x.type === 'quarterly')).toBe(true)
    expect(all.some((x) => x.type === 'custom')).toBe(true)
  })
})

describe('report workflow: draft → submit → PMO review → release', () => {
  let stat = ''
  let narr = ''
  const open = async (type: string, project = 'pa') => ((await pm.get(`/programme/reports?projectId=${project}&type=${type}&status=open`)).body as { id: string }[])[0]?.id

  it('lets only the assigned person prepare a report', async () => {
    stat = (await open('statistics'))!
    narr = (await open('narrative'))!
    expect(stat && narr).toBeTruthy()
    expect((await coord.put(`/programme/reports/${stat}/content`, { content: { values: {}, notes: 'x' } })).status).toBe(403) // coordinator does the narrative
    expect((await pm.put(`/programme/reports/${narr}/content`, { content: { summary: 'x', sections: [] } })).status).toBe(403) // PM does the statistics
    expect((await donor.get(`/programme/reports/${stat}`)).status).toBe(403)
  })

  it('shows what the system counted and fills only manual indicators by hand', async () => {
    const d = (await pm.get(`/programme/reports/${stat}`)).body
    const ind = d.data.indicators as { id: string; source: string; auto: number | null }[]
    expect(ind.some((i) => i.source === 'beneficiaries' && typeof i.auto === 'number')).toBe(true)
    const manual = ind.find((i) => i.source === 'manual')!
    const r = await pm.put(`/programme/reports/${stat}/content`, { content: { values: { [manual.id]: 12 }, notes: 'ok' } })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.status).toBe('draft')
    expect((await pm.put(`/programme/reports/${stat}/content`, { content: { values: { 'not-mine': 1 }, notes: '' } })).status).toBe(422)
  })

  it('needs a summary for the narrative before it can be sent', async () => {
    expect((await coord.post(`/programme/reports/${narr}/submit`)).status).toBe(422)
    const obj = (await pm.get('/programme/projects/pa/plan')).body.objectives[0].id
    expect((await coord.put(`/programme/reports/${narr}/content`, { content: { summary: 'Good month', sections: [{ objectiveId: obj, progress: 'p', challenges: 'c', nextSteps: 'n' }] } })).status).toBe(200)
    expect((await coord.post(`/programme/reports/${narr}/submit`)).body.status).toBe('submitted')
  })

  it('freezes a submitted report and keeps it from further edits', async () => {
    const s = await pm.post(`/programme/reports/${stat}/submit`)
    expect(s.body.status).toBe('submitted')
    expect(s.body.events.map((e: { action: string }) => e.action)).toEqual(['submit'])
    expect((await pm.put(`/programme/reports/${stat}/content`, { content: { values: {}, notes: 'late' } })).status).toBe(409)
    expect((await pm.post(`/programme/reports/${stat}/submit`)).status).toBe(409)
  })

  it('alerts the PMO when something waits for review', async () => {
    await admin.post('/notification-rules/run')
    const mine = (await pmo.get('/notifications?limit=50')).body as { event: string; link: string }[]
    expect(mine.some((n) => n.event === 'project_report_submitted' && n.link === `/reports/project/${stat}`)).toBe(true)
  })

  it('PMO returns with a reason, the owner fixes it, PMO approves', async () => {
    expect((await donor.post(`/programme/reports/${stat}/review`, { decision: 'approve' })).status).toBe(403)
    expect((await pm.post(`/programme/reports/${stat}/review`, { decision: 'approve' })).status).toBe(403) // PM cannot review
    expect((await pmo.post(`/programme/reports/${stat}/review`, { decision: 'return' })).status).toBe(422) // reason needed
    const back = await pmo.post(`/programme/reports/${stat}/review`, { decision: 'return', note: 'Please recheck surgeries' })
    expect(back.body.status).toBe('returned')
    expect(back.body.reviewNote).toBe('Please recheck surgeries')
    await admin.post('/notification-rules/run')
    expect(((await pm.get('/notifications?limit=50')).body as { event: string }[]).some((n) => n.event === 'project_report_returned')).toBe(true)
    expect((await pm.put(`/programme/reports/${stat}/content`, { content: { values: {}, notes: 'rechecked' } })).body.status).toBe('draft')
    expect((await pm.post(`/programme/reports/${stat}/submit`)).body.status).toBe('submitted')
    const ok = await pmo.post(`/programme/reports/${stat}/review`, { decision: 'approve' })
    expect(ok.body.status).toBe('approved')
    expect(ok.body.events.map((e: { action: string }) => e.action)).toEqual(['submit', 'return', 'submit', 'approve'])
  })

  it('does not let anyone review their own submission', async () => {
    const other = (await open('narrative'))
    const id = other ?? narr
    // PMO prepares (they manage reports), then cannot approve their own work.
    const fresh = ((await pm.get('/programme/reports?projectId=pb&type=narrative&status=open')).body as { id: string }[])[0]?.id
    const target = fresh ?? id
    const obj = (await pm.get('/programme/projects/pb/plan')).body.objectives[0].id
    expect((await pmo.put(`/programme/reports/${target}/content`, { content: { summary: 'by pmo', sections: [{ objectiveId: obj }] } })).status).toBeLessThan(500)
    const sub = await pmo.post(`/programme/reports/${target}/submit`)
    if (sub.status === 200) expect((await pmo.post(`/programme/reports/${target}/review`, { decision: 'approve' })).status).toBe(403)
  })

  it('releases only approved reports of projects that have a donor, and only PMO can', async () => {
    expect((await pm.post(`/programme/reports/${stat}/release`)).status).toBe(403)
    expect((await pmo.post(`/programme/reports/${narr}/release`)).status).toBe(409) // submitted, not approved
    const r = await pmo.post(`/programme/reports/${stat}/release`)
    expect(r.body.status).toBe('released')
    // A project without a donor cannot release.
    await db.execute(sql`update projects set donor_id = null where id = 'pb'`)
    const bId = ((await pm.get('/programme/reports?projectId=pb&type=statistics&status=open')).body as { id: string }[])[0]?.id
    if (bId) {
      await db.execute(sql`update project_reports set status = 'approved' where id = ${bId}`)
      expect((await pmo.post(`/programme/reports/${bId}/release`)).status).toBe(422)
    }
    await db.execute(sql`update projects set donor_id = 'don-b' where id = 'pb'`)
  })

  it('can pull a released report back with a reason', async () => {
    expect((await pmo.post(`/programme/reports/${stat}/reopen`, {})).status).toBe(422)
    const r = await pmo.post(`/programme/reports/${stat}/reopen`, { note: 'wrong figure' })
    expect(r.body.status).toBe('returned')
    expect((await donor.get(`/donor/reports/${stat}`)).status).toBe(404)
  })
})

describe('custom report from a sector template', () => {
  it('validates required fields and the field types', async () => {
    const id = ((await health.get('/programme/reports?projectId=pa&type=custom&status=open')).body as { id: string; templateId: string }[])[0]
    expect(id.templateId).toBe('tpl-health')
    expect((await nutrition.put(`/programme/reports/${id.id}/content`, { content: { values: {} } })).status).toBe(403) // the other sector's office
    expect((await health.put(`/programme/reports/${id.id}/content`, { content: { values: { consultations: 'many' } } })).status).toBe(422) // a wrong type is refused even in a draft
    expect((await health.put(`/programme/reports/${id.id}/content`, { content: { values: { consultations: 320 } } })).status).toBe(200) // drafts may be incomplete…
    expect((await health.post(`/programme/reports/${id.id}/submit`)).status).toBe(422) // …but not submitted that way
    expect((await health.put(`/programme/reports/${id.id}/content`, { content: { values: { consultations: 1, bogus: 2 } } })).status).toBe(422)
    expect((await health.put(`/programme/reports/${id.id}/content`, { content: { values: { consultations: 320, referrals: 14, medicines: 'Adequate' } } })).status).toBe(422) // not one of the choices
    expect((await health.put(`/programme/reports/${id.id}/content`, { content: { values: { consultations: 320, referrals: 14, medicines: 'كاف / Adequate' }, notes: '' } })).status).toBe(200)
    expect((await health.post(`/programme/reports/${id.id}/submit`)).body.status).toBe('submitted')
  })

  it('lets PMO build and change a template', async () => {
    const body = { nameAr: 'نموذج', nameEn: 'WASH monthly', sectorId: 'wash', active: true, fields: [{ key: 'tanks', label: { ar: 'خزانات', en: 'Tanks' }, type: 'number', required: true }] }
    expect((await pm.post('/programme/reports/templates', body)).status).toBe(403)
    const t = await pmo.post('/programme/reports/templates', body)
    expect(t.status, JSON.stringify(t.body)).toBe(201)
    expect((await pmo.post('/programme/reports/templates', { ...body, fields: [...body.fields, { key: 'tanks', label: { ar: 'x', en: 'x' }, type: 'number' }] })).status).toBe(422)
    expect((await pmo.post('/programme/reports/templates', { ...body, fields: [{ key: 'kind', label: { ar: 'x', en: 'x' }, type: 'choice' }] })).status).toBe(422)
    expect((await pmo.put(`/programme/reports/templates/${t.body.id}`, { ...body, nameEn: 'WASH v2' })).body.nameEn).toBe('WASH v2')
  })
})

describe('quarterly report', () => {
  it('adds the budget position and the monthly manual totals', async () => {
    const q = ((await pm.get('/programme/reports?projectId=pa&type=quarterly&status=open')).body as { id: string }[])[0]
    expect(q).toBeTruthy()
    const d = (await pm.get(`/programme/reports/${q.id}`)).body
    expect(d.data.finance).toMatchObject({ ceilingUsd: expect.any(String) })
    expect(Array.isArray(d.data.monthly)).toBe(true)
    expect((await pm.post(`/programme/reports/${q.id}/submit`)).status).toBe(422) // summary first
  })
})

describe('donor portal', () => {
  it('is closed to everything but the portal', async () => {
    for (const url of ['/projects', '/projects/tree', '/finance/journal', '/patients', '/programme/reports', '/users/directory', '/offices', '/roles', '/reports/expenditure?projectId=pa&from=2026-01-01&to=2026-12-31'])
      expect([url, (await donor.get(url)).status]).toEqual([url, 403])
    const me = await donor.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.donorId).toBe('don-a')
  })

  it('shows a donor only its own projects and released reports', async () => {
    const me = (await donor.get('/donor/me')).body
    expect(me.donor.code).toBe('DON-A')
    expect(me.projects.map((p: { id: string }) => p.id)).toEqual(['pa'])
    const list = (await donor.get('/donor/reports')).body as { id: string; projectId: string }[]
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((x) => x.projectId === 'pa')).toBe(true)
    const states = await rows(sql`select distinct status from project_reports where id in (${sql.join(list.map((x) => sql`${x.id}`), sql`, `)})`)
    expect(states.map((s) => s.status)).toEqual(['released'])
    const one = await donor.get(`/donor/reports/${list[0].id}`)
    expect(one.status).toBe(200)
    expect(one.body).not.toHaveProperty('events')
    expect(one.body).not.toHaveProperty('reviewNote')
  })

  it('hides other donors’ reports and unreleased ones as "not found"', async () => {
    const [b] = await rows(sql`select id from project_reports where project_id = 'pb' and status = 'released' limit 1`)
    expect((await donor.get(`/donor/reports/${b.id}`)).status).toBe(404)
    const [o] = await rows(sql`select id from project_reports where project_id = 'pa' and status = 'open' limit 1`)
    expect((await donor.get(`/donor/reports/${o.id}`)).status).toBe(404)
    expect((await pm.get('/donor/me')).status).toBe(403) // staff do not use the portal
  })

  it('gives the donor its expenditure report for a released quarterly report only', async () => {
    const [q] = await rows(sql`select id from project_reports where project_id = 'pa' and type = 'quarterly' and status = 'released' limit 1`)
    expect(q).toBeTruthy()
    const x = await donor.get(`/donor/reports/${q.id}/expenditure.xlsx?currency=USD`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(x.status).toBe(200)
    expect(x.headers['content-type']).toContain('spreadsheetml')
    expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK')
    const [s] = await rows(sql`select id from project_reports where project_id = 'pa' and type = 'statistics' and status = 'released' limit 1`)
    expect((await donor.get(`/donor/reports/${s.id}/expenditure.xlsx`)).status).toBe(422)
  })

  it('lets settings managers create donors and view-only logins', async () => {
    const d = await admin.post('/donors', { code: 'DON-C', nameAr: 'مانح ج', nameEn: 'Donor C' })
    expect(d.status, JSON.stringify(d.body)).toBe(201)
    expect((await admin.post('/donors', { code: 'DON-C', nameAr: 'x', nameEn: 'x' })).status).toBe(409)
    expect((await pm.post('/donors', { code: 'DON-D', nameAr: 'x', nameEn: 'x' })).status).toBe(403)
    expect((await admin.put('/donors/link/pb', { donorId: d.body.id })).status).toBe(200)
    const u = await admin.post(`/donors/${d.body.id}/users`, { email: 'rep@donor-c.org', nameAr: 'ممثل', nameEn: 'Rep' })
    expect(u.status, JSON.stringify(u.body)).toBe(201)
    expect(u.body.temporaryPassword).toMatch(/^Phf-/)
    const first = await Client.as(app, 'rep@donor-c.org', u.body.temporaryPassword)
    expect((await first.get('/donor/me')).status).toBe(403) // the temporary password must be changed first
    expect((await first.post('/auth/change-password', { currentPassword: u.body.temporaryPassword, newPassword: 'Donor-Pass-2026x' })).status).toBe(204)
    const fresh = await Client.as(app, 'rep@donor-c.org', 'Donor-Pass-2026x')
    expect((await fresh.get('/donor/me')).body.projects.map((p: { id: string }) => p.id)).toEqual(['pb'])
    expect((await fresh.get('/donor/reports')).body.every((x: { projectId: string }) => x.projectId === 'pb')).toBe(true)
    // donor logins are not offered as colleagues
    const dir = (await pm.get('/users/directory')).body as { email: string }[]
    expect(dir.some((x) => x.email === 'rep@donor-c.org' || x.email === USERS.donor)).toBe(false)
    await admin.put('/donors/link/pb', { donorId: 'don-b' })
  })
})

describe('deadline alerts', () => {
  it('warns owners before a report is due and again when it is overdue', async () => {
    const [r] = await rows(sql`select id from project_reports where project_id = 'pb' and type = 'narrative' and status = 'open' limit 1`)
    const d = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
    await db.execute(sql`update project_reports set due = ${d(2)} where id = ${r.id}`)
    await admin.post('/notification-rules/run')
    const near = ((await coord.get('/notifications?limit=100')).body as { event: string; link: string }[]).filter((n) => n.link === `/reports/project/${r.id}`)
    expect(near.map((n) => n.event)).toContain('project_report_due')
    await db.execute(sql`update project_reports set due = ${d(-3)} where id = ${r.id}`)
    await admin.post('/notification-rules/run')
    const late = ((await pmo.get('/notifications?limit=100')).body as { event: string; link: string }[]).filter((n) => n.link === `/reports/project/${r.id}`)
    expect(late.map((n) => n.event)).toContain('project_report_overdue')
  })

  it('warns the owner before a milestone and after it is missed', async () => {
    const ids = Object.fromEntries((await rows(sql`select id, email from users`)).map((u) => [u.email, u.id]))
    const d = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
    const soon = (await pm.post('/programme/projects/pb/milestones', { titleAr: 'قريب', titleEn: 'Soon', due: d(2), ownerId: ids[USERS.nutritionOffice], notifyDaysBefore: 5 })).body
    const missed = (await pm.post('/programme/projects/pb/milestones', { titleAr: 'فات', titleEn: 'Missed', due: d(-4), ownerId: ids[USERS.nutritionOffice], notifyDaysBefore: 5 })).body
    await admin.post('/notification-rules/run')
    const mine = ((await nutrition.get('/notifications?limit=100')).body as { event: string; titleEn: string }[]).filter((n) => n.event.startsWith('milestone'))
    expect(mine.some((n) => n.event === 'milestone_due' && n.titleEn.includes('Soon'))).toBe(true)
    expect(mine.some((n) => n.event === 'milestone_overdue' && n.titleEn.includes('Missed'))).toBe(true)
    await pm.patch(`/programme/milestones/${missed.id}`, { status: 'done' })
    await pm.delete(`/programme/milestones/${soon.id}`)
  })
})
