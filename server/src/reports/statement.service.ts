// Projects statement ("كشف حساب المشاريع"): every project with its budget, funds received, spending and what is left,
// each in USD and SDG, with totals by donor and overall.
import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { forbidden } from '../common/errors'
import { projectUsage } from '../budget/usage'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { isoDate } from '../common/zod'
import { fromCents } from '../lib/money'

export const statementQuery = z.object({ asOf: isoDate.optional() })

export interface StatementRow {
  id: string
  code: string
  name: string
  donor: string
  start: string
  end: string
  active: boolean
  rate: string | null
  budgetUsd: string
  budgetSdg: string
  receivedUsd: string
  receivedSdg: string
  spentUsd: string
  spentSdg: string
  committedUsd: string
  availableUsd: string
  availableSdg: string
  status: 'active' | 'ended'
}

@Injectable()
export class StatementService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async build(user: AuthUser, asOf?: string) {
    if (scopeOffice(user)) throw forbidden({ ar: 'كشف المشاريع للمقر الرئيسي فقط', en: 'The projects statement is for head office only' })
    const date = asOf ?? new Date().toISOString().slice(0, 10)
    const ps = (await this.db.execute<{ id: string; code: string; name_en: string; donor_en: string; start_date: string; end_date: string; active: boolean; budget_rate: string | null }>(sql`select id, code, name_en, donor_en, start_date::text, end_date::text, active, budget_rate::text from projects order by donor_en, code`)).rows
    const rates = (await this.db.execute<{ date: string; rate: string }>(sql`select date::text, rate::text from exchange_rates order by date`)).rows
    const rateAt = (d: string, fallback: string | null) => {
      let r = fallback ?? rates[0]?.rate ?? '0'
      for (const x of rates) {
        if (x.date <= d) r = x.rate
        else break
      }
      return Number(r)
    }
    const spend = (await this.db.execute<{ project_id: string; date: string; usd: string }>(sql`
      select coalesce(jl.project_id, bl.project_id) as project_id, je.date::text as date, sum(jl.debit - jl.credit)::text as usd
      from journal_lines jl join accounts ac on ac.code = jl.account_code and ac.type = 'expense'
        join journal_entries je on je.id = jl.entry_id join budget_lines bl on bl.id = jl.budget_line_id
      where je.source <> 'stock' and je.date <= ${date}::date group by 1, 2`)).rows
    const recv = (await this.db.execute<{ project_id: string; date: string; usd: string; cur: string; amt: string }>(sql`
      select project_id, date::text as date, sum(amount_usd)::text as usd, currency::text as cur, sum(amount)::text as amt
      from vouchers where kind = 'receipt' and project_id is not null and date <= ${date}::date group by 1, 2, 4`)).rows

    const rows: StatementRow[] = []
    for (const p of ps) {
      const u = (await projectUsage(this.db, p.id)).project
      const rateNow = rateAt(date, p.budget_rate)
      const budgetRate = Number(p.budget_rate ?? rateNow)
      let spentSdg = 0
      let spentUsd = 0
      for (const s of spend.filter((x) => x.project_id === p.id)) {
        const c = Math.round(Number(s.usd) * 100)
        spentUsd += c
        spentSdg += Math.round(c * rateAt(s.date, p.budget_rate))
      }
      let recvUsd = 0
      let recvSdg = 0
      for (const r of recv.filter((x) => x.project_id === p.id)) {
        recvUsd += Math.round(Number(r.usd) * 100)
        recvSdg += r.cur === 'SDG' ? Math.round(Number(r.amt) * 100) : Math.round(Math.round(Number(r.usd) * 100) * rateAt(r.date, p.budget_rate))
      }
      rows.push({
        id: p.id,
        code: p.code,
        name: p.name_en,
        donor: p.donor_en,
        start: p.start_date,
        end: p.end_date,
        active: p.active,
        rate: p.budget_rate,
        budgetUsd: fromCents(u.ceiling),
        budgetSdg: fromCents(Math.round(u.ceiling * budgetRate)),
        receivedUsd: fromCents(recvUsd),
        receivedSdg: fromCents(recvSdg),
        spentUsd: fromCents(spentUsd),
        spentSdg: fromCents(spentSdg),
        committedUsd: fromCents(u.committed + u.pending),
        availableUsd: fromCents(u.available),
        availableSdg: fromCents(Math.round(u.available * rateNow)),
        status: p.end_date < date ? 'ended' : 'active',
      })
    }
    const add = (rs: StatementRow[], f: (r: StatementRow) => string) => fromCents(rs.reduce((t, r) => t + Math.round(Number(f(r)) * 100), 0))
    const totalOf = (rs: StatementRow[]) => ({
      budgetUsd: add(rs, (r) => r.budgetUsd), budgetSdg: add(rs, (r) => r.budgetSdg), receivedUsd: add(rs, (r) => r.receivedUsd), receivedSdg: add(rs, (r) => r.receivedSdg),
      spentUsd: add(rs, (r) => r.spentUsd), spentSdg: add(rs, (r) => r.spentSdg), availableUsd: add(rs, (r) => r.availableUsd), availableSdg: add(rs, (r) => r.availableSdg),
    })
    const donors = [...new Set(rows.map((r) => r.donor))].map((donor) => ({ donor, projects: rows.filter((r) => r.donor === donor).length, ...totalOf(rows.filter((r) => r.donor === donor)) }))
    return { asOf: date, rows, donors, total: totalOf(rows) }
  }

  async xlsx(user: AuthUser, asOf?: string) {
    const d = await this.build(user, asOf)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Projects')
    ws.getCell('A1').value = `Projects statement — as of ${d.asOf}`
    ws.getCell('A1').font = { bold: true, size: 14 }
    const head = ['#', 'Project', 'Donor', 'Period', 'Status', 'Rate (SDG/USD)', 'Budget USD', 'Budget SDG', 'Received USD', 'Received SDG', 'Spent USD', 'Spent SDG', 'Available USD', 'Available SDG']
    const hr = ws.getRow(3)
    head.forEach((t, i) => (hr.getCell(i + 1).value = t))
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    hr.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }))
    d.rows.forEach((r, i) => {
      ws.getRow(4 + i).values = [i + 1, `${r.code} — ${r.name}`, r.donor, `${r.start} / ${r.end}`, r.status, r.rate ? Number(r.rate) : '', Number(r.budgetUsd), Number(r.budgetSdg), Number(r.receivedUsd), Number(r.receivedSdg), Number(r.spentUsd), Number(r.spentSdg), Number(r.availableUsd), Number(r.availableSdg)]
    })
    const last = 3 + d.rows.length
    const t = ws.getRow(last + 1)
    t.getCell(2).value = 'Total'
    for (let c = 7; c <= 14; c++) {
      const L = String.fromCharCode(64 + c)
      t.getCell(c).value = { formula: d.rows.length ? `SUM(${L}4:${L}${last})` : '0', result: 0 }
    }
    const tv = [d.total.budgetUsd, d.total.budgetSdg, d.total.receivedUsd, d.total.receivedSdg, d.total.spentUsd, d.total.spentSdg, d.total.availableUsd, d.total.availableSdg]
    tv.forEach((v, i) => (t.getCell(7 + i).value = { formula: d.rows.length ? `SUM(${String.fromCharCode(71 + i)}4:${String.fromCharCode(71 + i)}${last})` : '0', result: Number(v) }))
    t.font = { bold: true }
    for (let r = 4; r <= last + 1; r++) for (let c = 7; c <= 14; c++) ws.getRow(r).getCell(c).numFmt = '#,##0.00'
    ;[5, 34, 26, 24, 10, 12, 16, 20, 16, 20, 16, 20, 16, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w))
    const w2 = wb.addWorksheet('Donors')
    ;['Donor', 'Projects', 'Budget USD', 'Budget SDG', 'Received USD', 'Received SDG', 'Spent USD', 'Spent SDG'].forEach((h, i) => (w2.getRow(1).getCell(i + 1).value = h))
    w2.getRow(1).font = { bold: true }
    d.donors.forEach((x, i) => (w2.getRow(2 + i).values = [x.donor, x.projects, Number(x.budgetUsd), Number(x.budgetSdg), Number(x.receivedUsd), Number(x.receivedSdg), Number(x.spentUsd), Number(x.spentSdg)]))
    ;[30, 10, 16, 20, 16, 20, 16, 20].forEach((w, i) => (w2.getColumn(i + 1).width = w))
    return { buf: Buffer.from(await wb.xlsx.writeBuffer()), fileName: `PHF-Projects-Statement-${d.asOf}.xlsx` }
  }
}
