// The donor's quarterly "Detailed Expenditure Report": one row per spending transaction of a project in a period,
// with the donor's activity ID, fund code, expense category and account, authorized vs actual amount and balance.
import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { notFound, unprocessable } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { isoDate } from '../common/zod'
import { fromCents, toCents } from '../lib/money'

export const expenditureQuery = z.object({
  projectId: z.string().min(1),
  from: isoDate,
  to: isoDate,
  currency: z.enum(['SDG', 'USD']).default('SDG'),
  preparedBy: z.string().trim().max(120).optional(),
  preparedTitle: z.string().trim().max(120).optional(),
  approvedBy: z.string().trim().max(120).optional(),
  approvedTitle: z.string().trim().max(120).optional(),
})
export type ExpenditureQuery = z.infer<typeof expenditureQuery>

export interface ExpRow {
  state: string
  date: string
  voucher: string
  method: string
  activityId: string
  fundCode: string
  activityTitle: string
  input: string
  category: string
  account: string
  authorizedUsd: string
  actualUsd: string
  authorizedSdg: string
  actualSdg: string
  comment: string
}

const METHOD: Record<string, string> = { cash: 'Cash', bank: 'Bank transfer', bankak: 'Bankak', advance: 'Advance', transfer: 'Transfer' }
const SOURCE: Record<string, string> = { settlement: 'Advance settlement', payroll: 'Payroll', payment: 'Payment', manual: 'Journal entry', reversal: 'Reversal', fx: 'Exchange difference', transfer: 'Transfer', receipt: 'Receipt', advance: 'Advance', opening: 'Opening balance', stock: 'Stock' }
const cleanItem = (n: string) => n.replace(/\s\[[^\]]*\]$/, '')

type R = {
  id: string; date: string; no: string; source: string; memo: string; usd: string; office_state: string
  line_state: string | null; activity_code: string | null; fund_code: string | null; nature: string | null; donor_account: string | null; line_name: string; pillar_name: string
  vno: string | null; vmethod: string | null; vcur: string | null; vamt: string | null; vrate: string | null
  ano: string | null; adv_usd: string | null; adv_cur: string | null; adv_amt: string | null; reimb: string | null
}

@Injectable()
export class ExpenditureService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async build(user: AuthUser, q: ExpenditureQuery) {
    if (q.to < q.from) throw unprocessable('PERIOD', { ar: 'تاريخ النهاية قبل البداية', en: 'The end date is before the start date' })
    const pr = await this.db.execute<{ id: string; code: string; ip_code: string | null; name_en: string; name_ar: string; donor_en: string; budget_rate: string | null }>(sql`select id, code, ip_code, name_en, name_ar, donor_en, budget_rate::text from projects where id = ${q.projectId}`)
    const project = pr.rows[0]
    if (!project) throw notFound({ ar: 'المشروع', en: 'Project' })
    const office = scopeOffice(user)
    const rates = (await this.db.execute<{ date: string; rate: string }>(sql`select date::text, rate::text from exchange_rates order by date`)).rows
    const rateAt = (d: string) => {
      let r = project.budget_rate ?? rates[0]?.rate ?? '0'
      for (const x of rates) {
        if (x.date <= d) r = x.rate
        else break
      }
      return Number(r)
    }
    const toSdg = (usdCents: number, d: string) => Math.round(usdCents * rateAt(d))

    const spent = (
      await this.db.execute<R>(sql`
        select jl.id::text as id, je.date::text as date, je.no, je.source::text as source, je.memo, (jl.debit - jl.credit)::text as usd, o.state_en as office_state,
          bl.state as line_state, bl.activity_code, bl.fund_code, bl.nature, bl.donor_account, bl.name_en as line_name, p.name_en as pillar_name,
          v.no as vno, v.method::text as vmethod, v.currency::text as vcur, v.amount::text as vamt, v.rate::text as vrate,
          ad.no as ano, ad.amount_usd::text as adv_usd, ad.currency::text as adv_cur, ad.amount::text as adv_amt, ad.reimbursed_usd::text as reimb
        from journal_lines jl
          join accounts ac on ac.code = jl.account_code and ac.type = 'expense'
          join journal_entries je on je.id = jl.entry_id
          join budget_lines bl on bl.id = jl.budget_line_id
          join pillars p on p.id = bl.pillar_id
          join offices o on o.id = jl.office_id
          left join vouchers v on v.journal_entry_id = je.id
          left join advances ad on ad.settle_entry_id = je.id
        where bl.project_id = ${q.projectId} and je.date between ${q.from}::date and ${q.to}::date and je.source <> 'stock'
          ${office ? sql`and jl.office_id = ${office}` : sql``}
        order by je.date, jl.id`)
    ).rows

    const open = (
      await this.db.execute<{ no: string; date: string; usd: string; holder: string; line_state: string | null; activity_code: string | null; fund_code: string | null; nature: string | null; donor_account: string | null; line_name: string; pillar_name: string; office_state: string; cur: string; amt: string }>(sql`
        select ad.no, ad.issued_at::date::text as date, ad.amount_usd::text as usd, ad.holder_name as holder, bl.state as line_state, bl.activity_code, bl.fund_code, bl.nature, bl.donor_account,
          bl.name_en as line_name, p.name_en as pillar_name, o.state_en as office_state, ad.currency::text as cur, ad.amount::text as amt
        from advances ad join budget_lines bl on bl.id = ad.line_id join pillars p on p.id = bl.pillar_id join offices o on o.id = ad.office_id
        where ad.project_id = ${q.projectId} and ad.status = 'open' and ad.issued_at::date between ${q.from}::date and ${q.to}::date
          ${office ? sql`and ad.office_id = ${office}` : sql``}
        order by ad.issued_at`)
    ).rows

    const rows: ExpRow[] = []
    for (const r of spent) {
      const actual = toCents(r.usd)
      let method = SOURCE[r.source] ?? r.source
      let comment = ''
      let authorized = actual
      let actualSdg = toSdg(actual, r.date)
      let authorizedSdg = actualSdg
      let voucher = r.vno ?? r.ano ?? r.no
      if (r.vno) {
        method = METHOD[r.vmethod ?? ''] ?? 'Payment'
        comment = 'Direct payment'
        // A voucher paid in SDG whose whole amount is this line: report the SDG actually paid, not a re-conversion.
        if (r.vcur === 'SDG' && r.vamt && r.vrate && Math.abs(Number(r.vamt) / Number(r.vrate) - Number(r.usd)) < 0.02) {
          actualSdg = toCents(r.vamt)
          authorizedSdg = actualSdg
        }
      } else if (r.ano) {
        method = 'Advance'
        authorized = toCents(r.adv_usd)
        authorizedSdg = r.adv_cur === 'SDG' ? toCents(r.adv_amt) : toSdg(authorized, r.date)
        comment = toCents(r.reimb) > 0 ? 'Advance + reimbursement' : 'Advance'
        voucher = r.ano
      }
      rows.push({
        state: r.line_state || r.office_state,
        date: r.date,
        voucher,
        method,
        activityId: r.activity_code ?? '',
        fundCode: r.fund_code ?? '',
        activityTitle: r.pillar_name,
        input: cleanItem(r.line_name),
        category: r.nature ?? '',
        account: r.donor_account ?? '',
        authorizedUsd: fromCents(authorized),
        actualUsd: fromCents(actual),
        authorizedSdg: fromCents(authorizedSdg),
        actualSdg: fromCents(actualSdg),
        comment: comment || r.memo.slice(0, 80),
      })
    }
    for (const a of open) {
      const cents = toCents(a.usd)
      rows.push({
        state: a.line_state || a.office_state,
        date: a.date,
        voucher: a.no,
        method: 'Advance',
        activityId: a.activity_code ?? '',
        fundCode: a.fund_code ?? '',
        activityTitle: a.pillar_name,
        input: cleanItem(a.line_name),
        category: a.nature ?? '',
        account: a.donor_account ?? '',
        authorizedUsd: fromCents(cents),
        actualUsd: '0.00',
        authorizedSdg: a.cur === 'SDG' ? fromCents(toCents(a.amt)) : fromCents(toSdg(cents, a.date)),
        actualSdg: '0.00',
        comment: `Advance — not yet liquidated (${a.holder})`,
      })
    }
    rows.sort((x, y) => x.date.localeCompare(y.date) || x.voucher.localeCompare(y.voucher))

    const sum = (f: (r: ExpRow) => string) => fromCents(rows.reduce((t, r) => t + toCents(f(r)), 0))
    const totals = { authorizedUsd: sum((r) => r.authorizedUsd), actualUsd: sum((r) => r.actualUsd), authorizedSdg: sum((r) => r.authorizedSdg), actualSdg: sum((r) => r.actualSdg) }

    const org = (await this.db.execute<{ short_name_en: string }>(sql`select short_name_en from org_settings limit 1`)).rows[0]
    const fm = (await this.db.execute<{ name_en: string }>(sql`select name_en from users where role_id = 'finance_manager' and active order by name_en limit 1`)).rows[0]
    return {
      project: { id: project.id, code: project.code, ipCode: project.ip_code ?? project.code, name: project.name_en, donor: project.donor_en },
      ipName: org?.short_name_en ?? 'PHF',
      period: { from: q.from, to: q.to },
      currency: q.currency,
      rows,
      totals,
      signatures: {
        preparedBy: q.preparedBy ?? fm?.name_en ?? '',
        preparedTitle: q.preparedTitle ?? 'Finance Manager',
        approvedBy: q.approvedBy ?? '',
        approvedTitle: q.approvedTitle ?? 'Finance and Administration Manager',
      },
    }
  }

  /** The same report as an Excel workbook laid out like the donor's template. */
  async xlsx(user: AuthUser, q: ExpenditureQuery) {
    const d = await this.build(user, q)
    const sdg = d.currency === 'SDG'
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Financial report', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    const title = `Detailed Expenditure Report ${d.period.from.slice(0, 7)} – ${d.period.to.slice(0, 7)}`
    ws.getCell('A1').value = title
    ws.getCell('A1').font = { bold: true, size: 14 }
    ws.getCell('A2').value = 'IP Code'
    ws.getCell('C2').value = d.project.ipCode
    ws.getCell('A3').value = 'IP Name'
    ws.getCell('C3').value = d.ipName
    ws.getCell('A4').value = 'Reporting Period'
    ws.getCell('C4').value = `${d.period.from} to ${d.period.to}`
    ws.getCell('H4').value = `Currency: ${d.currency}`
    for (const c of ['A2', 'A3', 'A4']) ws.getCell(c).font = { bold: true }
    const first = 8
    const last = first + d.rows.length - 1
    const head = ['State', 'Date', 'Voucher #', 'Method of Payment', 'Activity ID', 'Fund code', 'Activity Title', 'Input Description', 'Expense Category', 'Account', 'Authorized Amount', 'Actual Project Expenditure', 'Balance', 'Comment']
    const h = ws.getRow(7)
    head.forEach((t, i) => (h.getCell(i + 1).value = t))
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    h.alignment = { wrapText: true, vertical: 'middle' }
    h.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }))
    d.rows.forEach((r, i) => {
      const row = ws.getRow(first + i)
      const auth = Number(sdg ? r.authorizedSdg : r.authorizedUsd)
      const act = Number(sdg ? r.actualSdg : r.actualUsd)
      row.values = [r.state, r.date, r.voucher, r.method, r.activityId, r.fundCode, r.activityTitle, r.input, r.category, r.account ? Number(r.account) : '', auth, act, { formula: `K${first + i}-L${first + i}`, result: Math.round((auth - act) * 100) / 100 }, r.comment]
      row.getCell(2).numFmt = 'yyyy-mm-dd'
      ;[11, 12, 13].forEach((c) => (row.getCell(c).numFmt = '#,##0.00'))
    })
    const tot = last + 1
    const ta = Number(sdg ? d.totals.authorizedSdg : d.totals.authorizedUsd)
    const tc = Number(sdg ? d.totals.actualSdg : d.totals.actualUsd)
    const t = ws.getRow(tot)
    t.getCell(1).value = 'Total'
    t.getCell(11).value = { formula: d.rows.length ? `SUM(K${first}:K${last})` : '0', result: ta }
    t.getCell(12).value = { formula: d.rows.length ? `SUM(L${first}:L${last})` : '0', result: tc }
    t.getCell(13).value = { formula: `K${tot}-L${tot}`, result: Math.round((ta - tc) * 100) / 100 }
    t.font = { bold: true }
    ;[11, 12, 13].forEach((c) => (t.getCell(c).numFmt = '#,##0.00'))
    ws.getCell('K5').value = { formula: d.rows.length ? `SUBTOTAL(9,K${first}:K${last})` : '0', result: ta }
    ws.getCell('L5').value = { formula: d.rows.length ? `SUBTOTAL(9,L${first}:L${last})` : '0', result: tc }
    ws.getCell('M5').value = { formula: 'K5-L5', result: Math.round((ta - tc) * 100) / 100 }
    ;['K5', 'L5', 'M5'].forEach((c) => (ws.getCell(c).numFmt = '#,##0.00'))
    const s = tot + 2
    ws.getCell(`A${s}`).value = 'Prepared By :'
    ws.getCell(`C${s}`).value = d.signatures.preparedBy
    ws.getCell(`H${s}`).value = 'Approved by:'
    ws.getCell(`I${s}`).value = d.signatures.approvedBy
    ws.getCell(`A${s + 1}`).value = 'Title :'
    ws.getCell(`C${s + 1}`).value = d.signatures.preparedTitle
    ws.getCell(`H${s + 1}`).value = 'Title :'
    ws.getCell(`I${s + 1}`).value = d.signatures.approvedTitle
    ws.getCell(`A${s + 2}`).value = 'Signature :'
    ws.getCell(`H${s + 2}`).value = 'Signature :'
    ws.getCell(`A${s + 3}`).value = 'Date :'
    ws.getCell(`H${s + 3}`).value = 'Date :'
    const widths = [16, 12, 14, 16, 18, 11, 38, 38, 36, 10, 18, 20, 16, 30]
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
    ws.views = [{ state: 'frozen', ySplit: 7 }]
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    return { buf, fileName: `PHF-Expenditure-Report-${d.project.ipCode}-${d.period.from}_${d.period.to}.xlsx` }
  }
}
