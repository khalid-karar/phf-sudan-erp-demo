// The quarterly Detailed Expenditure Report and the Projects statement, computed in the browser for the demo,
// plus the Excel builders used in the demo (live mode downloads the server's own files).
import type { Account, Advance, Expense, Office, Project, RateEntry, User, Voucher } from '../../data/types'
import { findLine, projectUsage, type BudgetData } from '../budget'

export interface ExpRow {
  state: string; date: string; voucher: string; method: string; activityId: string; fundCode: string; activityTitle: string; input: string; category: string; account: string
  authorizedUsd: string; actualUsd: string; authorizedSdg: string; actualSdg: string; comment: string
}
export interface ExpReport {
  project: { code: string; ipCode: string; name: string; donor: string }
  ipName: string
  rows: ExpRow[]
  totals: { authorizedUsd: string; actualUsd: string; authorizedSdg: string; actualSdg: string }
  signatures: { preparedBy: string; preparedTitle: string; approvedBy: string; approvedTitle: string }
}
export interface StRow {
  id: string; code: string; name: string; donor: string; start: string; end: string; rate: string | null; status: 'active' | 'ended'
  budgetUsd: string; budgetSdg: string; receivedUsd: string; receivedSdg: string; spentUsd: string; spentSdg: string; availableUsd: string; availableSdg: string
}
export type StTotals = Pick<StRow, 'budgetUsd' | 'budgetSdg' | 'receivedUsd' | 'receivedSdg' | 'spentUsd' | 'spentSdg' | 'availableUsd' | 'availableSdg'>
export interface Statement { asOf: string; rows: StRow[]; donors: (StTotals & { donor: string; projects: number })[]; total: StTotals }

type Data = BudgetData & { projects: Project[]; expenses: Expense[]; vouchers: Voucher[]; advances: Advance[]; offices: Office[]; rates: RateEntry[]; users: User[]; accounts: Account[]; lineMap: Record<string, string>; org: { shortName: { en: string } } }

const f2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2)
const rateAt = (rates: RateEntry[], d: string) => {
  let r = rates[0]?.rate ?? 0
  for (const x of [...rates].sort((a, b) => a.date.localeCompare(b.date))) if (x.date.slice(0, 10) <= d) r = x.rate
  return r
}
const METHOD: Record<string, string> = { cash: 'Cash', bank: 'Bank transfer', bankak: 'Bankak', advance: 'Advance', transfer: 'Transfer' }

export function demoExpenditure(s: Data, projectId: string, from: string, to: string, sig: Partial<ExpReport['signatures']>): ExpReport {
  const p = s.projects.find((x) => x.id === projectId)!
  const rows: ExpRow[] = []
  const base = (lineId: string, officeId: string) => {
    const hit = findLine(s.projects, lineId)
    const l = hit?.line
    const off = s.offices.find((o) => o.id === officeId)
    return {
      state: l?.state || off?.state.en || '',
      activityId: l?.activityCode || (hit ? `${hit.project.code}-P${hit.pillar.code}` : ''),
      fundCode: l?.fundCode || '',
      activityTitle: hit?.pillar.name.en ?? '',
      input: (l?.name.en ?? '').replace(/\s\[[^\]]*\]$/, ''),
      category: l?.nature || s.accounts.find((a) => a.code === s.lineMap[lineId])?.name.en || '',
      account: l?.donorAccount || s.lineMap[lineId] || '',
    }
  }
  s.expenses
    .filter((e) => e.projectId === projectId && e.date.slice(0, 10) >= from && e.date.slice(0, 10) <= to)
    .forEach((e, i) => {
      const d = e.date.slice(0, 10)
      const v = e.requestId ? s.vouchers.find((x) => x.requestId === e.requestId && x.kind === 'payment') : undefined
      const adv = e.requestId ? s.advances.find((a) => a.requestId === e.requestId) : undefined
      const r = rateAt(s.rates, d)
      const auth = adv ? adv.amountUSD : e.amountUSD
      rows.push({
        ...base(e.lineId, e.officeId),
        date: d,
        voucher: adv?.no ?? v?.no ?? `JV-${d.replace(/-/g, '').slice(2)}-${String(i + 1).padStart(3, '0')}`,
        method: adv ? 'Advance' : v ? METHOD[v.method] ?? 'Payment' : 'Bank transfer',
        authorizedUsd: f2(auth),
        actualUsd: f2(e.amountUSD),
        authorizedSdg: f2(auth * r),
        actualSdg: f2(e.amountUSD * r),
        comment: adv ? 'Advance' : 'Direct payment',
      })
    })
  s.advances
    .filter((a) => a.projectId === projectId && a.status === 'open' && a.issuedAt.slice(0, 10) >= from && a.issuedAt.slice(0, 10) <= to)
    .forEach((a) => {
      const d = a.issuedAt.slice(0, 10)
      const r = rateAt(s.rates, d)
      rows.push({ ...base(a.lineId, a.officeId), date: d, voucher: a.no, method: 'Advance', authorizedUsd: f2(a.amountUSD), actualUsd: '0.00', authorizedSdg: f2(a.amountUSD * r), actualSdg: '0.00', comment: `Advance — not yet liquidated${a.holderName ? ` (${a.holderName})` : ''}` })
    })
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.voucher.localeCompare(b.voucher))
  const sum = (k: keyof ExpRow) => f2(rows.reduce((t, r) => t + Number(r[k]), 0))
  const fm = s.users.find((u) => u.role === 'finance_manager')
  return {
    project: { code: p.code, ipCode: p.code, name: p.name.en, donor: p.donor.en },
    ipName: 'PHF',
    rows,
    totals: { authorizedUsd: sum('authorizedUsd'), actualUsd: sum('actualUsd'), authorizedSdg: sum('authorizedSdg'), actualSdg: sum('actualSdg') },
    signatures: { preparedBy: sig.preparedBy || fm?.name.en || '', preparedTitle: sig.preparedTitle || 'Finance Manager', approvedBy: sig.approvedBy || '', approvedTitle: sig.approvedTitle || 'Finance and Administration Manager' },
  }
}

export function demoStatement(s: Data, asOf: string): Statement {
  const now = rateAt(s.rates, asOf)
  const rows: StRow[] = s.projects.map((p) => {
    const u = projectUsage(p, s)
    let spentSdg = 0
    let spentUsd = 0
    for (const e of s.expenses.filter((x) => x.projectId === p.id && x.date.slice(0, 10) <= asOf)) {
      spentUsd += e.amountUSD
      spentSdg += e.amountUSD * rateAt(s.rates, e.date.slice(0, 10))
    }
    const rec = s.vouchers.filter((v) => v.kind === 'receipt' && v.projectId === p.id && v.date.slice(0, 10) <= asOf)
    const recUsd = rec.reduce((t, v) => t + v.amountUSD, 0)
    const recSdg = rec.reduce((t, v) => t + (v.currency === 'SDG' ? v.amount : v.amountUSD * v.rate), 0)
    return {
      id: p.id, code: p.code, name: p.name.en, donor: p.donor.en, start: p.start.slice(0, 10), end: p.end.slice(0, 10), rate: String(now), status: p.end < asOf ? 'ended' : 'active',
      budgetUsd: f2(u.ceiling), budgetSdg: f2(u.ceiling * now), receivedUsd: f2(recUsd), receivedSdg: f2(recSdg), spentUsd: f2(spentUsd), spentSdg: f2(spentSdg), availableUsd: f2(u.available), availableSdg: f2(u.available * now),
    }
  })
  const tot = (rs: StRow[]): StTotals => {
    const k = ['budgetUsd', 'budgetSdg', 'receivedUsd', 'receivedSdg', 'spentUsd', 'spentSdg', 'availableUsd', 'availableSdg'] as const
    return Object.fromEntries(k.map((x) => [x, f2(rs.reduce((t, r) => t + Number(r[x]), 0))])) as StTotals
  }
  const donors = [...new Set(rows.map((r) => r.donor))].map((donor) => ({ donor, projects: rows.filter((r) => r.donor === donor).length, ...tot(rows.filter((r) => r.donor === donor)) }))
  return { asOf, rows, donors, total: tot(rows) }
}

const save = (buf: ArrayBuffer, name: string) => {
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Same layout as the server's file and the donor's template. */
export async function downloadExpenditureXlsx(d: ExpReport, from: string, to: string, currency: 'SDG' | 'USD') {
  const ExcelJS = (await import('exceljs')).default
  const sdg = currency === 'SDG'
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Financial report', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.getCell('A1').value = `Detailed Expenditure Report ${from.slice(0, 7)} – ${to.slice(0, 7)}`
  ws.getCell('A1').font = { bold: true, size: 14 }
  ;[['A2', 'IP Code', d.project.ipCode], ['A3', 'IP Name', d.ipName], ['A4', 'Reporting Period', `${from} to ${to}`]].forEach(([c, l, v], i) => {
    ws.getCell(c).value = l
    ws.getCell(c).font = { bold: true }
    ws.getCell(`C${2 + i}`).value = v
  })
  ws.getCell('H4').value = `Currency: ${currency}`
  const head = ['State', 'Date', 'Voucher #', 'Method of Payment', 'Activity ID', 'Fund code', 'Activity Title', 'Input Description', 'Expense Category', 'Account', 'Authorized Amount', 'Actual Project Expenditure', 'Balance', 'Comment']
  const h = ws.getRow(7)
  head.forEach((t, i) => (h.getCell(i + 1).value = t))
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  h.alignment = { wrapText: true, vertical: 'middle' }
  h.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }))
  const first = 8
  d.rows.forEach((r, i) => {
    const a = Number(sdg ? r.authorizedSdg : r.authorizedUsd)
    const c = Number(sdg ? r.actualSdg : r.actualUsd)
    const row = ws.getRow(first + i)
    row.values = [r.state, r.date, r.voucher, r.method, r.activityId, r.fundCode, r.activityTitle, r.input, r.category, r.account, a, c, { formula: `K${first + i}-L${first + i}`, result: a - c }, r.comment]
    ;[11, 12, 13].forEach((k) => (row.getCell(k).numFmt = '#,##0.00'))
  })
  const last = first + d.rows.length - 1
  const t = ws.getRow(last + 1)
  const ta = Number(sdg ? d.totals.authorizedSdg : d.totals.authorizedUsd)
  const tc = Number(sdg ? d.totals.actualSdg : d.totals.actualUsd)
  t.getCell(1).value = 'Total'
  t.getCell(11).value = { formula: d.rows.length ? `SUM(K${first}:K${last})` : '0', result: ta }
  t.getCell(12).value = { formula: d.rows.length ? `SUM(L${first}:L${last})` : '0', result: tc }
  t.getCell(13).value = { formula: `K${last + 1}-L${last + 1}`, result: ta - tc }
  t.font = { bold: true }
  ;[11, 12, 13].forEach((k) => (t.getCell(k).numFmt = '#,##0.00'))
  const s0 = last + 3
  ;[['Prepared By :', d.signatures.preparedBy, 'Approved by:', d.signatures.approvedBy], ['Title :', d.signatures.preparedTitle, 'Title :', d.signatures.approvedTitle], ['Signature :', '', 'Signature :', ''], ['Date :', '', 'Date :', '']].forEach(([a, b, c, e], i) => {
    ws.getCell(`A${s0 + i}`).value = a
    ws.getCell(`C${s0 + i}`).value = b
    ws.getCell(`H${s0 + i}`).value = c
    ws.getCell(`I${s0 + i}`).value = e
  })
  ;[16, 12, 14, 16, 18, 11, 38, 38, 36, 10, 18, 20, 16, 30].forEach((w, i) => (ws.getColumn(i + 1).width = w))
  ws.views = [{ state: 'frozen', ySplit: 7 }]
  save(await wb.xlsx.writeBuffer(), `PHF-Expenditure-Report-${d.project.ipCode}-${from}_${to}.xlsx`)
}

export async function downloadStatementXlsx(d: Statement) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Projects')
  ws.getCell('A1').value = `Projects statement — as of ${d.asOf}`
  ws.getCell('A1').font = { bold: true, size: 14 }
  const head = ['#', 'Project', 'Donor', 'Period', 'Status', 'Rate (SDG/USD)', 'Budget USD', 'Budget SDG', 'Received USD', 'Received SDG', 'Spent USD', 'Spent SDG', 'Available USD', 'Available SDG']
  head.forEach((t, i) => (ws.getRow(3).getCell(i + 1).value = t))
  ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(3).eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }))
  d.rows.forEach((r, i) => (ws.getRow(4 + i).values = [i + 1, `${r.code} — ${r.name}`, r.donor, `${r.start} / ${r.end}`, r.status, r.rate ? Number(r.rate) : '', ...[r.budgetUsd, r.budgetSdg, r.receivedUsd, r.receivedSdg, r.spentUsd, r.spentSdg, r.availableUsd, r.availableSdg].map(Number)]))
  const tr = ws.getRow(4 + d.rows.length)
  tr.getCell(2).value = 'Total'
  ;[d.total.budgetUsd, d.total.budgetSdg, d.total.receivedUsd, d.total.receivedSdg, d.total.spentUsd, d.total.spentSdg, d.total.availableUsd, d.total.availableSdg].forEach((v, i) => (tr.getCell(7 + i).value = Number(v)))
  tr.font = { bold: true }
  for (let r = 4; r <= 4 + d.rows.length; r++) for (let c = 7; c <= 14; c++) ws.getRow(r).getCell(c).numFmt = '#,##0'
  ;[5, 34, 26, 24, 10, 12, 16, 20, 16, 20, 16, 20, 16, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w))
  const w2 = wb.addWorksheet('Donors')
  ;['Donor', 'Projects', 'Budget USD', 'Budget SDG', 'Received USD', 'Received SDG', 'Spent USD', 'Spent SDG'].forEach((h, i) => (w2.getRow(1).getCell(i + 1).value = h))
  w2.getRow(1).font = { bold: true }
  d.donors.forEach((x, i) => (w2.getRow(2 + i).values = [x.donor, x.projects, ...[x.budgetUsd, x.budgetSdg, x.receivedUsd, x.receivedSdg, x.spentUsd, x.spentSdg].map(Number)]))
  ;[30, 10, 16, 20, 16, 20, 16, 20].forEach((w, i) => (w2.getColumn(i + 1).width = w))
  save(await wb.xlsx.writeBuffer(), `PHF-Projects-Statement-${d.asOf}.xlsx`)
}
