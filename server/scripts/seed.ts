/**
 * Demo/staging seed: loads the same sample organisation the clickable demo uses
 * (offices, roles, users, projects, chart of accounts, rates, activities, requests, ledger),
 * so the API and the demo tell the same story. Never run against production data.
 *
 *   SEED_PASSWORD=... npm run db:seed        (wipes and reloads every table)
 */
import { eq, sql } from 'drizzle-orm'
import { hashPassword } from '../src/auth/passwords'
import { fromCents, toCents, toRate4, usdToSdg } from '../src/lib/money'
import { post } from '../src/ledger/posting'
import { createDb, createPool, type DbOrTx } from '../src/db/client'
import * as t from '../src/db/schema'

// The demo's data modules (plain TypeScript, no browser APIs).
import * as demoSeed from '../../src/data/seed'
import * as demoFin from '../../src/data/finance'
import * as demoSup from '../../src/data/supply'
import * as demoPeople from '../../src/data/people'
import * as demoProg from '../../src/data/programme'
import { ensureSlots } from '../src/programme/slots'
import { digits, nameKey } from '../src/patients/names'
import { DEFAULT_RULES } from '../src/notifications/events'
import type { JournalEntry } from '../../src/data/types'

const day = (iso: string) => iso.slice(0, 10)
const cents = (n: number) => toCents(n.toFixed(2))

export async function seed(db: DbOrTx, password: string) {
  await db.execute(sql`
    truncate donors, report_templates, deliveries, notification_recipients, notifications, notif_rules, deadlines, channel_settings, beneficiary_services, beneficiaries, payroll_runs, leave_requests, employee_allocations, employees, stock_moves, stock_levels, shipment_lines, shipments, fuel_logs, vehicles, items, audit_log, advance_items, advances, vouchers, period_closes, exchange_rates, journal_lines, journal_entries,
      ledger_accounts, approval_steps, reallocations, spend_requests, field_reports, activities, approval_rules,
      budget_lines, pillars, projects, funds, accounts, refresh_tokens, users, roles, offices, org_settings, doc_counters
    restart identity cascade`)

  const o = demoSeed.orgDefaults
  await db.insert(t.orgSettings).values({
    nameAr: o.name.ar,
    nameEn: o.name.en,
    shortNameAr: o.shortName.ar,
    shortNameEn: o.shortName.en,
    hqNameAr: o.hqName.ar,
    hqNameEn: o.hqName.en,
    fiscalYearStartMonth: o.fiscalYearStartMonth,
    defaultLang: o.defaultLang,
  })

  await db.insert(t.offices).values(
    demoSeed.offices.map((x) => ({ id: x.id, nameAr: x.name.ar, nameEn: x.name.en, stateAr: x.state.ar, stateEn: x.state.en, type: x.type ?? (x.isHQ ? 'hq' : 'office'), lat: x.lat, lon: x.lon, phone: x.phone ?? null, active: x.active !== false })),
  )
  await db.insert(t.roles).values(
    demoSeed.roles.map((r) => ({ id: r.id, nameAr: r.name.ar, nameEn: r.name.en, descAr: r.description.ar, descEn: r.description.en, permissions: r.permissions, scope: r.scope, canApprove: r.canApprove, system: !!r.system })),
  )
  await db.insert(t.donors).values(demoProg.donors.map((d) => ({ id: d.id, code: d.code, nameAr: d.name.ar, nameEn: d.name.en })))
  const passwordHash = await hashPassword(password)
  await db.insert(t.users).values(
    demoSeed.users.map((u) => ({ id: u.id, email: u.email!, nameAr: u.name.ar, nameEn: u.name.en, phone: u.phone ?? null, passwordHash, roleId: u.role, officeId: u.officeId, active: u.active !== false, donorId: u.donorId ?? null })),
  )
  for (const o of demoSeed.offices) if (o.managerId) await db.update(t.offices).set({ managerId: o.managerId }).where(eq(t.offices.id, o.id))

  // Chart of accounts and the accounts that play system roles.
  await db.insert(t.accounts).values(
    demoFin.accounts.map((a) => ({ code: a.code, parentCode: a.parent, nameAr: a.name.ar, nameEn: a.name.en, type: a.type, postable: a.postable, currency: a.currency ?? 'USD', officeId: a.officeId ?? null })),
  )
  await db.insert(t.ledgerAccounts).values(
    Object.entries({ cash_boxes: '1101', banks: '1102', advances: demoFin.ADVANCES, fx_gain: demoFin.FX_GAIN, fx_loss: demoFin.FX_LOSS, inventory: '1105', inkind_revenue: '4103', salaries: '5201', payroll_deductions: '2104' }).map(
      ([key, accountCode]) => ({ key, accountCode }),
    ),
  )

  // Funds, projects, pillars, lines (each line mapped to its expense account).
  await db.insert(t.funds).values(demoSeed.funds.map((f) => ({ id: f.id, type: f.type, nameAr: f.name.ar, nameEn: f.name.en, donorAr: f.donor.ar, donorEn: f.donor.en })))
  const lineMap = demoFin.defaultLineMap()
  for (const p of demoSeed.projects) {
    const ceiling = p.pillars.reduce((s, pl) => s + cents(pl.ceilingUSD), 0)
    await db.insert(t.projects).values({
      id: p.id,
      code: p.code,
      nameAr: p.name.ar,
      nameEn: p.name.en,
      donorAr: p.donor.ar,
      donorEn: p.donor.en,
      fundId: p.fundId,
      donorId: demoProg.projectDonor[p.id] ?? null,
      startDate: day(p.start),
      endDate: day(p.end),
      ceilingUsd: fromCents(ceiling),
      controlMode: p.controlMode,
      tolerancePct: String(p.tolerancePct),
    })
    for (const [i, pl] of p.pillars.entries()) {
      await db.insert(t.pillars).values({ id: pl.id, projectId: p.id, code: pl.code, nameAr: pl.name.ar, nameEn: pl.name.en, ceilingUsd: pl.ceilingUSD.toFixed(2), sort: i })
      await db.insert(t.budgetLines).values(
        pl.lines.map((l, j) => ({ id: l.id, projectId: p.id, pillarId: pl.id, code: l.code, nameAr: l.name.ar, nameEn: l.name.en, ceilingUsd: l.ceilingUSD.toFixed(2), expenseAccountCode: lineMap[l.id] ?? null, sort: j })),
      )
    }
  }

  // Exchange rates (one per date).
  const rates = new Map<string, number>()
  for (const r of demoFin.rates) rates.set(day(r.date), r.rate)
  await db.insert(t.exchangeRates).values([...rates].map(([date, rate]) => ({ date, rate: String(rate), source: 'Approved rate — Bank of Khartoum' })))

  await db.insert(t.approvalRules).values(
    demoSeed.buildSeed().rules.map((r) => ({ id: r.id, nameAr: r.name.ar, nameEn: r.name.en, kind: r.appliesTo, minUsd: r.minUSD.toFixed(2), maxUsd: r.maxUSD === null ? null : r.maxUSD.toFixed(2), officeId: r.officeId, chain: r.chain, active: r.active })),
  )

  // Field activities and their reports.
  const activityId = new Map<string, string>()
  for (const a of demoFin.fieldActivities) {
    const [row] = await db
      .insert(t.activities)
      .values({ code: a.code, officeId: a.officeId, projectId: a.projectId, lineId: a.lineId, titleAr: a.title.ar, titleEn: a.title.en, type: a.type ?? 'other', plannedDate: day(a.date), location: a.location ?? null, plannedUsd: a.plannedUSD?.toFixed(2) ?? null, inKind: !!a.inKind })
      .returning({ id: t.activities.id })
    activityId.set(a.code, row.id)
    if (a.report) {
      await db.insert(t.fieldReports).values({
        no: a.report.no,
        activityId: row.id,
        doneOn: a.report.doneOn ? day(a.report.doneOn) : null,
        beneficiaries: a.report.beneficiaries,
        men: a.report.men ?? null,
        women: a.report.women ?? null,
        children: a.report.children ?? null,
        summary: a.report.summary.en,
        issues: a.report.issues ?? null,
        actualUsd: a.report.actualUSD?.toFixed(2) ?? null,
        via: a.report.via ?? 'online',
        submittedAt: new Date(a.report.submittedAt),
      })
    }
  }

  // Ledger history: the demo's finance and supply journals, posted through the real posting path.
  const s = demoSeed.buildSeed()
  const fin = demoFin.buildFinance(s.expenses, lineMap)
  const sup = demoSup.buildSupply(demoFin.fieldActivities, (iso: string) => demoFin.rateOn(iso))
  // Supply-chain entries (in-kind receipts, issues, shipments) are stock movements.
  const stockIds = new Set(sup.journal.map((e) => e.id))
  const journal: JournalEntry[] = [...fin.journal, ...sup.journal].sort((a, b) => +new Date(a.date) - +new Date(b.date))
  const sdgAccounts = new Set(demoFin.accounts.filter((a) => a.currency === 'SDG').map((a) => a.code))
  const entryId = new Map<string, string>()
  // Which activity each spending entry paid for: the demo makes one payment voucher per expense, in date order,
  // and settles ADV-0015 against ACT-PTS-0044. Carrying that onto the ledger line is what lets the app match spending to field reports.
  const actOfEntry = new Map<string, string>()
  const byDate = [...s.expenses].sort((a, b) => +new Date(a.date) - +new Date(b.date))
  fin.vouchers.filter((v) => v.kind === 'payment').forEach((v, i) => byDate[i]?.activityCode && actOfEntry.set(v.journalId, byDate[i].activityCode!))
  for (const e of fin.journal) if (e.source === 'settlement' && e.ref === 'ADV-0015') actOfEntry.set(e.id, 'ACT-PTS-0044')
  for (const e of journal) {
    const code = actOfEntry.get(e.id)
    const lines = e.lines.map((l) => ({
      account: l.account,
      debit: cents(l.debit),
      credit: cents(l.credit),
      sdg: sdgAccounts.has(l.account) ? (l.sdg !== undefined ? cents(l.sdg) : usdToSdg(cents(l.debit) - cents(l.credit), toRate4(demoFin.rateOn(e.date)))) : null,
      officeId: l.officeId ?? 'khr',
      projectId: l.projectId ?? null,
      budgetLineId: l.lineId ?? null,
      activityId: code && l.lineId && l.debit > 0 ? (activityId.get(code) ?? null) : null,
    }))
    // Float rounding in the demo can leave a cent or two; put it on the largest line so the entry balances.
    const diff = lines.reduce((x, l) => x + l.debit - l.credit, 0)
    if (diff !== 0 && Math.abs(diff) <= 5) {
      const big = [...lines].sort((a, b) => b.debit + b.credit - (a.debit + a.credit))[0]
      if (big.debit > 0) big.debit -= diff
      else big.credit += diff
    }
    const row = await post(db, null, { date: day(e.date), memo: e.memo.en, source: (stockIds.has(e.id) ? 'stock' : e.source) as never, ref: e.ref ?? null, lines })
    entryId.set(e.id, row.id)
  }

  // Requests (with their approval history), reallocations and advances.
  const userIds = new Set(demoSeed.users.map((u) => u.id))
  const requestRow = new Map<string, string>()
  for (const r of s.requests) {
    const [row] = await db
      .insert(t.spendRequests)
      .values({
        code: r.code,
        officeId: r.officeId,
        projectId: r.projectId,
        lineId: r.lineId,
        activityId: r.activityCode ? (activityId.get(r.activityCode) ?? null) : null,
        purpose: r.purpose.en,
        amount: r.amount.toFixed(2),
        currency: r.currency,
        rate: String(r.rate),
        amountUsd: r.amountUSD.toFixed(2),
        overCeiling: r.overCeiling,
        status: r.status,
        ruleId: r.ruleId ?? null,
        requesterId: r.requesterId,
        createdAt: new Date(r.createdAt),
      })
      .returning({ id: t.spendRequests.id })
    requestRow.set(r.id, row.id)
    if (r.steps.length)
      await db.insert(t.approvalSteps).values(r.steps.map((st, i) => ({ requestId: row.id, seq: i + 1, roleId: st.role, status: st.status, byId: st.by && userIds.has(st.by) ? st.by : null, at: st.at ? new Date(st.at) : null, note: st.note ?? null })))
  }
  for (const r of s.reallocations) {
    const [row] = await db
      .insert(t.reallocations)
      .values({ code: r.code, projectId: r.projectId, fromLineId: r.fromLineId, toLineId: r.toLineId, amountUsd: r.amountUSD.toFixed(2), reason: r.reason.en, status: r.status, requesterId: r.requesterId, createdAt: new Date(r.createdAt) })
      .returning({ id: t.reallocations.id })
    await db.insert(t.approvalSteps).values(r.steps.map((st, i) => ({ reallocationId: row.id, seq: i + 1, roleId: st.role, status: st.status, byId: st.by ?? null, at: st.at ? new Date(st.at) : null })))
  }
  // Receipt and payment vouchers for the history above (each points at its journal entry).
  const payOrder = [...s.expenses].sort((a, b) => +new Date(a.date) - +new Date(b.date))
  let pvIndex = 0
  for (const v of fin.vouchers) {
    const ex = v.kind === 'payment' ? payOrder[pvIndex++] : undefined
    await db.insert(t.vouchers).values({
      no: v.no,
      kind: v.kind,
      date: day(v.date),
      method: v.method,
      accountCode: v.account,
      currency: v.currency,
      amount: v.amount.toFixed(2),
      rate: String(v.rate),
      amountUsd: v.amountUSD.toFixed(2),
      party: v.party.en,
      memo: v.memo.en,
      officeId: v.officeId,
      projectId: v.projectId ?? null,
      lineId: v.lineId ?? null,
      requestId: ex?.requestId ? (requestRow.get(ex.requestId) ?? null) : null,
      journalEntryId: entryId.get(v.journalId)!,
    })
  }
  const staffName = new Map(demoFin.staff.map((x) => [x.id, x.name.en]))
  for (const a of fin.advances) {
    await db.insert(t.advances).values({
      no: a.no,
      holderName: staffName.get(a.staffId) ?? a.staffId,
      officeId: a.officeId,
      projectId: a.projectId,
      lineId: a.lineId,
      activityId: activityId.get(a.activityCode) ?? null,
      amountUsd: a.amountUSD.toFixed(2),
      // Advances are handed out in pounds from the office cash box.
      currency: 'SDG',
      amount: fromCents(usdToSdg(cents(a.amountUSD), toRate4(demoFin.rateOn(a.issuedAt)))),
      issueRate: String(demoFin.rateOn(a.issuedAt)),
      issuedAt: new Date(a.issuedAt),
      dueAt: day(a.dueAt),
      status: a.status,
      settledAt: a.settlement ? new Date(a.settlement.at) : null,
    })
  }

  // Supply chain: item catalogue, stock levels, movements, shipments, fleet and fuel logs.
  await db.insert(t.items).values(
    demoSup.items.map((i) => ({ id: i.id, code: i.code, nameAr: i.name.ar, nameEn: i.name.en, unitAr: i.unit.ar, unitEn: i.unit.en, category: i.category, unitValue: i.unitValueUSD.toFixed(2), minQty: i.min, expenseAccountCode: demoSup.categoryAccount[i.category], active: i.active ?? true })),
  )
  await db.insert(t.vehicles).values(
    sup.vehicles.map((v) => ({ id: v.id, plate: v.plate, modelAr: v.model.ar, modelEn: v.model.en, kind: v.kind, officeId: v.officeId, driver: v.driver.en, status: v.status, odometer: v.odometer, nextServiceKm: v.nextServiceKm })),
  )
  const fuel = sup.vehicles.flatMap((v) => v.fuel.map((f) => ({ id: f.id, vehicleId: v.id, date: day(f.date), liters: f.liters.toFixed(2), costSdg: f.costSDG.toFixed(2), odometer: f.odometer, officeId: f.officeId })))
  if (fuel.length) await db.insert(t.fuelLogs).values(fuel)
  const codeById = new Map(demoFin.fieldActivities.map((a) => [a.id, a.code]))
  const shipmentNos = new Map(sup.shipments.map((x) => [x.id, x.no]))
  await db.insert(t.shipments).values(
    sup.shipments.map((x) => ({
      id: x.id,
      no: x.no,
      fromOfficeId: x.fromOfficeId,
      toOfficeId: x.toOfficeId,
      vehicleId: x.vehicleId ?? null,
      driver: x.driver ?? null,
      status: x.status,
      note: x.note ?? null,
      createdAt: new Date(x.createdAt),
      departedAt: x.departedAt ? new Date(x.departedAt) : null,
      deliveredAt: x.deliveredAt ? new Date(x.deliveredAt) : null,
    })),
  )
  await db.insert(t.shipmentLines).values(sup.shipments.flatMap((x) => x.lines.map((l) => ({ shipmentId: x.id, itemId: l.itemId, qty: l.qty, received: l.received ?? null }))))
  const shipmentByNo = new Map([...shipmentNos].map(([id, no]) => [no, id]))
  await db.insert(t.stockMoves).values(
    sup.moves.map((m) => ({
      no: m.no,
      kind: m.kind,
      date: day(m.date),
      itemId: m.itemId,
      officeId: m.officeId,
      qty: m.qty,
      valueUsd: m.valueUSD.toFixed(2),
      ref: m.ref ?? null,
      source: m.source?.en ?? null,
      activityId: m.activityId ? (activityId.get(codeById.get(m.activityId) ?? '') ?? null) : null,
      shipmentId: m.ref ? (shipmentByNo.get(m.ref) ?? null) : null,
      expiry: m.expiry ? day(m.expiry) : null,
    })),
  )
  await db.insert(t.stockLevels).values(sup.stock.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, officeId: l.officeId, qty: l.qty })))

  // People: employees (with the project shares their salary is charged to) and leave requests.
  const employeeIds = new Map<string, string>()
  for (const e of demoPeople.employees) {
    const [row] = await db
      .insert(t.employees)
      .values({
        no: e.no,
        nameAr: e.name.ar,
        nameEn: e.name.en,
        officeId: e.officeId,
        positionAr: e.position.ar,
        positionEn: e.position.en,
        department: e.department,
        contract: e.contract,
        startDate: day(e.startDate),
        endDate: e.endDate ? day(e.endDate) : null,
        salarySdg: e.salarySDG.toFixed(2),
        phone: e.phone ?? null,
        status: e.status === 'ended' ? 'ended' : 'active',
        userId: e.userId && userIds.has(e.userId) ? e.userId : null,
        leaveBalance: e.leaveBalance,
      })
      .returning({ id: t.employees.id })
    employeeIds.set(e.id, row.id)
    if (e.allocations.length) await db.insert(t.employeeAllocations).values(e.allocations.map((a) => ({ employeeId: row.id, projectId: a.projectId, lineId: a.lineId, pct: a.pct })))
  }
  const inclusive = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / 86_400_000) + 1
  for (const l of demoPeople.leaves)
    await db.insert(t.leaveRequests).values({
      employeeId: employeeIds.get(l.employeeId)!,
      type: l.type,
      fromDate: day(l.from),
      toDate: day(l.to),
      days: inclusive(day(l.from), day(l.to)),
      note: l.note ?? null,
      status: l.status,
      decidedById: l.decidedBy && userIds.has(l.decidedBy) ? l.decidedBy : null,
      decidedAt: l.status === 'pending' ? null : new Date(l.createdAt),
      createdAt: new Date(l.createdAt),
    })

  // Patients: the beneficiary register and the services each person received.
  const demoBens = demoPeople.buildBeneficiaries(demoFin.fieldActivities)
  const benCounters = new Map<string, number>()
  for (const b of demoBens) {
    const [row] = await db
      .insert(t.beneficiaries)
      .values({
        no: b.no, nameAr: b.name.ar, nameEn: b.name.en, nameKey: nameKey(b.name.ar, b.name.en), gender: b.gender, birthYear: b.birthYear, officeId: b.officeId,
        locality: b.locality || null, displaced: b.displaced, phone: b.phone ?? null, phoneDigits: digits(b.phone) || null, registeredAt: day(b.registeredAt),
        registeredById: b.registeredBy && userIds.has(b.registeredBy) ? b.registeredBy : null,
      })
      .returning({ id: t.beneficiaries.id })
    const m = /^(BEN-[A-Z]+)-(\d+)$/.exec(b.no)
    if (m) benCounters.set(m[1], Math.max(benCounters.get(m[1]) ?? 0, Number(m[2])))
    await db.insert(t.beneficiaryServices).values(
      b.services.map((sv) => ({ beneficiaryId: row.id, date: day(sv.date), type: sv.type, officeId: sv.officeId, activityId: sv.activityId ? (activityId.get(demoFin.fieldActivities.find((a) => a.id === sv.activityId)?.code ?? '') ?? null) : null, note: sv.note ?? null })),
    )
  }

  // Alerts: the standard notification rules and the demo's calendar of deadlines.
  await db.insert(t.notifRules).values(DEFAULT_RULES)
  await db.insert(t.deadlines).values(
    s.deadlines.map((d) => ({ titleAr: d.title.ar, titleEn: d.title.en, projectId: d.projectId ?? null, due: day(d.due), notifyDaysBefore: d.notifyDaysBefore, ownerRoleId: d.owner, recurrence: d.recurrence ?? 'none', done: !!d.done })),
  )

  // Continue document numbering after the demo's numbers.
  const maxNo = (codes: string[]) => Math.max(0, ...codes.map((c) => Number(c.split('-').pop()) || 0))
  await db.insert(t.docCounters).values([
    { key: 'SR', next: maxNo(s.requests.map((r) => r.code)) + 1 },
    { key: 'RA', next: maxNo(s.reallocations.map((r) => r.code)) + 1 },
    { key: 'ADV', next: maxNo(fin.advances.map((a) => a.no)) + 1 },
    { key: 'PV', next: fin.nextPv },
    { key: 'RV', next: fin.nextRv },
    ...[...benCounters].map(([key, n]) => ({ key, next: n + 1 })),
    { key: 'EMP', next: Math.max(0, ...demoPeople.employees.map((e) => Number(e.no.split('-').pop()) || 0)) + 1 },
    { key: 'GRN', next: maxNo(sup.moves.filter((m) => m.kind === 'receipt').map((m) => m.no)) + 1 },
    { key: 'ISS', next: maxNo(sup.moves.filter((m) => m.kind === 'issue').map((m) => m.no)) + 1 },
    { key: 'TRF', next: maxNo(sup.moves.filter((m) => m.kind.startsWith('transfer')).map((m) => m.no)) + 1 },
    { key: 'WO', next: 1 },
    { key: 'SHP', next: maxNo(sup.shipments.map((x) => x.no)) + 1 },
    { key: 'TR', next: maxNo(demoFin.fieldActivities.filter((a) => a.report).map((a) => a.report!.no)) + 1 },
  ]).onConflictDoUpdate({ target: t.docCounters.key, set: { next: sql`excluded.next` } })

  await seedProgramme(db, activityId)

  return { journalEntries: journal.length, requests: s.requests.length, activities: demoFin.fieldActivities.length }
}

/** Project plans (sectors, objectives, team, milestones), report templates and the reporting calendar for the sample projects. */
async function seedProgramme(db: DbOrTx, activityId: Map<string, string>) {
  const objIds: Record<string, Record<string, string>> = {}
  const indIds: Record<string, Record<string, string>> = {}
  for (const tpl of demoProg.templates)
    await db.insert(t.reportTemplates).values({ id: tpl.id, nameAr: tpl.name.ar, nameEn: tpl.name.en, sectorId: tpl.sectorId, fields: tpl.fields.map((f) => ({ ...f, columns: f.columns?.map((c) => ({ ...c, label: c.label })) })) })
  for (const [pid, plan] of Object.entries(demoProg.plans)) {
    objIds[pid] = {}
    indIds[pid] = {}
    await db.insert(t.projectSectors).values(plan.sectors.map((sectorId) => ({ projectId: pid, sectorId })))
    for (const [oi, o] of plan.objectives.entries()) {
      const [ob] = await db.insert(t.objectives).values({ projectId: pid, sectorId: o.sectorId, code: o.code, nameAr: o.name.ar, nameEn: o.name.en, sort: oi + 1 }).returning({ id: t.objectives.id })
      objIds[pid][o.code] = ob.id
      for (const [ii, i] of o.indicators.entries()) {
        const [ind] = await db.insert(t.indicators).values({ objectiveId: ob.id, code: i.code, nameAr: i.name.ar, nameEn: i.name.en, unit: i.unit.en, target: String(i.target), source: i.source, sort: ii + 1 }).returning({ id: t.indicators.id })
        indIds[pid][`${o.code}.${i.code}`] = ind.id
      }
    }
    await db.insert(t.projectTeam).values(plan.team.map((m) => ({ projectId: pid, role: m.role, userId: m.userId, sectorId: m.sectorId ?? null })))
    await db.insert(t.milestones).values(plan.milestones.map((m) => ({ projectId: pid, titleAr: m.title.ar, titleEn: m.title.en, due: demoProg.day(m.due), ownerId: m.ownerId, status: m.status, objectiveId: m.objective ? objIds[pid][m.objective] : null, notifyDaysBefore: m.notifyDaysBefore, doneAt: m.status === 'done' ? new Date() : null })))
    await db.insert(t.reportingSchedules).values({ projectId: pid, enabled: true, ...plan.schedule })
  }
  for (const a of demoFin.fieldActivities) {
    const code = demoProg.objectiveFor(a.projectId, a.type)
    if (code && objIds[a.projectId]?.[code]) await db.update(t.activities).set({ objectiveId: objIds[a.projectId][code] }).where(eq(t.activities.id, activityId.get(a.code)!))
  }
  // The calendar, with the older months already released so the donor portal has something to show.
  await ensureSlots(db)
  const old = new Date(Date.now() - demoProg.RELEASED_BEFORE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const slots = await db.select().from(t.projectReports)
  for (const r of slots) {
    if (r.periodEnd >= old) continue
    const content = demoProg.sampleContent(r.type, demoProg.plans[r.projectId], r.period, { objectives: objIds[r.projectId] ?? {}, indicators: indIds[r.projectId] ?? {} }, r.templateId)
    const at = new Date(Date.parse(r.due) - 2 * 86_400_000)
    await db.update(t.projectReports).set({ content, status: 'released', submittedAt: at, submittedById: r.type === 'narrative' ? 'u-pc' : 'u-pm', reviewedAt: at, reviewedById: 'u-pmo', releasedAt: at, releasedById: 'u-pmo' }).where(eq(t.projectReports.id, r.id))
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'yes') throw new Error('Refusing to seed in production (set ALLOW_SEED=yes for a staging server)')
  const password = process.env.SEED_PASSWORD ?? 'Phf-Demo-2026'
  const pool = createPool(url)
  const db = createDb(pool)
  db.transaction((tx) => seed(tx, password))
    .then((r) => console.log('Seeded:', r, `\nAll demo users sign in with the password "${password}"`))
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
