import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { notFound, unprocessable } from '../common/errors'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { accounts, budgetLines, pillars, projects } from '../db/schema'
import { fromCents, sumCents, toCents } from '../lib/money'
import type { controlBody, linePatch, projectBody } from './budget.schemas'
import { checkCeiling, checkJson, projectUsage, usageJson } from './usage'

/** Serialises budget changes for one project (requests, reallocations, ceiling edits). */
export async function lockProject(tx: DbOrTx, projectId: string) {
  const r = await tx.execute(sql`select id from projects where id = ${projectId} for update`)
  if (!r.rows.length) throw notFound({ ar: 'المشروع', en: 'Project' })
}

@Injectable()
export class BudgetService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list() {
    const ps = await this.db.select().from(projects).orderBy(asc(projects.code))
    const out = []
    for (const p of ps) {
      const u = await projectUsage(this.db, p.id)
      out.push({ ...p, usage: usageJson(u.project) })
    }
    return out
  }

  /** Every active and finished project as a tree, in one request (the app loads this at start-up). */
  async trees() {
    const ps = await this.db.select({ id: projects.id }).from(projects).orderBy(asc(projects.code))
    const out = []
    for (const p of ps) out.push(await this.tree(p.id))
    return out
  }

  /**
   * Cash spending posted to budget lines, one row per ledger line, newest last. In-kind issues are not cash and are left out.
   * Office-limited users get their own office's rows (the budget totals above are organisation-wide either way).
   */
  async expenses(user: AuthUser) {
    const office = scopeOffice(user)
    const r = await this.db.execute<{ id: string; date: string; line_id: string; project_id: string; office_id: string; amount_usd: string; activity_code: string | null; request_id: string | null; has_tech_report: boolean }>(sql`
      select jl.id::text as id, je.date::text as date, jl.budget_line_id as line_id, coalesce(jl.project_id, bl.project_id) as project_id, jl.office_id,
        (jl.debit - jl.credit)::text as amount_usd, a.code as activity_code, coalesce(v.request_id, ad.request_id) as request_id, (fr.id is not null) as has_tech_report
      from journal_lines jl
        join accounts ac on ac.code = jl.account_code and ac.type = 'expense'
        join journal_entries je on je.id = jl.entry_id
        join budget_lines bl on bl.id = jl.budget_line_id
        left join activities a on a.id = jl.activity_id
        left join field_reports fr on fr.activity_id = a.id
        left join vouchers v on v.journal_entry_id = je.id
        left join advances ad on ad.settle_entry_id = je.id
      where je.source <> 'stock' ${office ? sql`and jl.office_id = ${office}` : sql``}
      order by je.date, jl.id`)
    return r.rows.map((x) => ({ id: x.id, date: x.date, lineId: x.line_id, projectId: x.project_id, officeId: x.office_id, amountUsd: x.amount_usd, activityCode: x.activity_code, requestId: x.request_id, hasTechReport: x.has_tech_report }))
  }

  /** Project → pillars → lines, each with its usage. */
  async tree(projectId: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, projectId))
    if (!p) throw notFound({ ar: 'المشروع', en: 'Project' })
    const ps = await this.db.select().from(pillars).where(eq(pillars.projectId, projectId)).orderBy(asc(pillars.sort), asc(pillars.code))
    const ls = await this.db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId)).orderBy(asc(budgetLines.sort), asc(budgetLines.code))
    const u = await projectUsage(this.db, projectId)
    return {
      ...p,
      usage: usageJson(u.project),
      pillars: ps.map((pl) => ({
        ...pl,
        usage: usageJson(u.pillars.get(pl.id)!),
        lines: ls.filter((l) => l.pillarId === pl.id).map((l) => ({ ...l, usage: usageJson(u.lines.get(l.id)!.usage) })),
      })),
    }
  }

  /** Dry-run ceiling check, used by the request form as the user types. */
  async check(lineId: string, amountUsd: string) {
    const [l] = await this.db.select({ projectId: budgetLines.projectId }).from(budgetLines).where(eq(budgetLines.id, lineId))
    if (!l) throw notFound({ ar: 'البند', en: 'Budget line' })
    const u = await projectUsage(this.db, l.projectId)
    return checkJson(checkCeiling(u, lineId, toCents(amountUsd)))
  }

  async create(user: AuthUser, b: z.infer<typeof projectBody>) {
    const pillarSum = sumCents(b.pillars.map((p) => toCents(p.ceilingUsd)))
    if (pillarSum > toCents(b.ceilingUsd))
      throw unprocessable('PILLARS_OVER_PROJECT', { ar: 'مجموع سقوف المحاور أكبر من سقف المشروع', en: 'Pillar ceilings add up to more than the project ceiling' }, { pillars: fromCents(pillarSum), project: b.ceilingUsd })
    for (const p of b.pillars) {
      const s = sumCents(p.lines.map((l) => toCents(l.ceilingUsd)))
      if (s > toCents(p.ceilingUsd))
        throw unprocessable('LINES_OVER_PILLAR', { ar: `مجموع سقوف بنود المحور ${p.code} أكبر من سقفه`, en: `Lines in pillar ${p.code} add up to more than its ceiling` }, { pillar: p.code, lines: fromCents(s), ceiling: p.ceilingUsd })
    }
    return this.db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: b.id,
        code: b.code,
        nameAr: b.nameAr,
        nameEn: b.nameEn,
        donorAr: b.donorAr,
        donorEn: b.donorEn,
        fundId: b.fundId ?? null,
        startDate: b.startDate,
        endDate: b.endDate,
        ceilingUsd: b.ceilingUsd,
        controlMode: b.controlMode,
        tolerancePct: String(b.tolerancePct),
      })
      for (const [i, p] of b.pillars.entries()) {
        const pillarId = `${b.id}-p${i + 1}`
        await tx.insert(pillars).values({ id: pillarId, projectId: b.id, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, ceilingUsd: p.ceilingUsd, sort: i })
        await tx.insert(budgetLines).values(
          p.lines.map((l, j) => ({
            id: `${pillarId}-l${j + 1}`,
            projectId: b.id,
            pillarId,
            code: l.code,
            nameAr: l.nameAr,
            nameEn: l.nameEn,
            ceilingUsd: l.ceilingUsd,
            expenseAccountCode: l.expenseAccountCode ?? null,
            sort: j,
          })),
        )
      }
      await audit(tx, user, 'project.create', 'project', b.id, { code: b.code, ceiling: b.ceilingUsd })
      return { id: b.id }
    })
  }

  async setControl(user: AuthUser, projectId: string, b: z.infer<typeof controlBody>) {
    return this.db.transaction(async (tx) => {
      await lockProject(tx, projectId)
      await tx.update(projects).set({ controlMode: b.controlMode, tolerancePct: String(b.tolerancePct) }).where(eq(projects.id, projectId))
      await audit(tx, user, 'project.control', 'project', projectId, b)
      return { ok: true }
    })
  }

  /** Edits a line. A ceiling can't drop below what is already spent, committed or in approval. */
  async updateLine(user: AuthUser, lineId: string, b: z.infer<typeof linePatch>) {
    return this.db.transaction(async (tx) => {
      const [l] = await tx.select().from(budgetLines).where(eq(budgetLines.id, lineId))
      if (!l) throw notFound({ ar: 'البند', en: 'Budget line' })
      await lockProject(tx, l.projectId)
      if (b.expenseAccountCode) {
        const [a] = await tx.select().from(accounts).where(eq(accounts.code, b.expenseAccountCode))
        if (!a || a.type !== 'expense' || !a.postable)
          throw unprocessable('NOT_EXPENSE_ACCOUNT', { ar: 'اختر حساب مصروفات قابلاً للترحيل', en: 'Choose a postable expense account' })
      }
      if (b.ceilingUsd) {
        const u = (await projectUsage(tx, l.projectId)).lines.get(lineId)!.usage
        const used = u.spent + u.committed + u.pending
        const newCeiling = toCents(b.ceilingUsd) + (u.ceiling - u.original)
        if (newCeiling < used)
          throw unprocessable('CEILING_BELOW_USED', { ar: 'السقف الجديد أقل مما صُرف أو حُجز على البند', en: 'The new ceiling is below what is already spent or reserved' }, { used: fromCents(used) })
      }
      const [row] = await tx.update(budgetLines).set(b).where(eq(budgetLines.id, lineId)).returning()
      await audit(tx, user, 'line.update', 'budget_line', lineId, b)
      return row
    })
  }
}
