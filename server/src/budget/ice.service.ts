import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { sha256, storeBlob, cleanName } from '../attachments/files'
import { audit } from '../common/audit'
import { unprocessable } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { accounts, attachments, donorImportProfiles } from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { fromCents, toCents } from '../lib/money'
import { BudgetService } from './budget.service'
import { localAccount } from './natures'
import { parseIce, type IceParsed } from './ice'
import { isoDate } from '../common/zod'

export const previewFields = z.object({ donorId: z.string().max(60).optional() })
export const iceFields = z.object({
  donorId: z.string().max(60).optional(),
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  code: z.string().trim().min(1).max(30).optional(),
  nameAr: z.string().trim().min(1).max(300),
  nameEn: z.string().trim().min(1).max(300),
  donorAr: z.string().trim().min(1).max(300),
  donorEn: z.string().trim().min(1).max(300),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  rate: z.coerce.number().positive().optional(),
  controlMode: z.enum(['hard', 'soft']).default('hard'),
  tolerancePct: z.coerce.number().min(0).max(50).default(0),
})

const bad = (e: unknown) => {
  const m = e instanceof Error ? e.message : ''
  if (m === 'NOT_XLSX') return unprocessable('NOT_XLSX', { ar: 'الملف ليس ملف Excel (.xlsx) صالحاً', en: 'That is not a valid Excel (.xlsx) file' })
  if (m === 'NO_SHEET') return unprocessable('NO_SHEET', { ar: 'لم أجد جدول الميزانية (عمود Activity ID) في الملف', en: 'No budget table (an "Activity ID" column) was found in the file' })
  if (m.startsWith('NO_COLUMN')) return unprocessable('NO_COLUMN', { ar: `عمود ناقص في الملف: ${m.slice(10)}`, en: `A required column is missing: ${m.slice(10)}` })
  if (m === 'NO_ROWS') return unprocessable('NO_ROWS', { ar: 'لا توجد بنود بمبالغ في الملف', en: 'The file has no budget rows with an amount' })
  return e
}

@Injectable()
export class IceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly budget: BudgetService,
  ) {}

  private async read(file: { buffer: Buffer } | undefined, donorId?: string): Promise<IceParsed> {
    if (!file?.buffer?.length) throw unprocessable('NO_FILE', { ar: 'لم يُرفق ملف', en: 'No file was attached' })
    // Each funding entity can name its columns differently; without a saved profile the ICE layout is used.
    const prof = donorId ? (await this.db.select().from(donorImportProfiles).where(eq(donorImportProfiles.donorId, donorId)))[0] : undefined
    try {
      return await parseIce(file.buffer, prof ? { headers: prof.headers } : undefined)
    } catch (e) {
      throw bad(e)
    }
  }

  private summary(p: IceParsed) {
    const rate = p.rate
    const byAct = new Map<string, { code: string; title: string; lines: number; totalCents: number }>()
    const byState = new Map<string, number>()
    const byFund = new Map<string, number>()
    let total = 0
    for (const l of p.lines) {
      const c = toCents(l.totalUsd)
      total += c
      const a = byAct.get(l.activityCode) ?? { code: l.activityCode, title: l.activityTitle, lines: 0, totalCents: 0 }
      a.lines++
      a.totalCents += c
      byAct.set(l.activityCode, a)
      byState.set(l.state || '—', (byState.get(l.state || '—') ?? 0) + c)
      byFund.set(l.fundCode || '—', (byFund.get(l.fundCode || '—') ?? 0) + c)
    }
    const sdg = (c: number) => (rate ? fromCents(Math.round(c * rate)) : null)
    const rows = (m: Map<string, number>) => [...m].map(([key, c]) => ({ key, usd: fromCents(c), sdg: sdg(c) })).sort((a, b) => Number(b.usd) - Number(a.usd))
    return {
      sheet: p.sheet,
      ipCode: p.ipCode,
      rate,
      startDate: p.startDate,
      endDate: p.endDate,
      lineCount: p.lines.length,
      totalUsd: fromCents(total),
      totalSdg: sdg(total),
      activities: [...byAct.values()].map((a) => ({ code: a.code, title: a.title, lines: a.lines, usd: fromCents(a.totalCents), sdg: sdg(a.totalCents) })),
      states: rows(byState),
      funds: rows(byFund),
      noNature: p.lines.filter((l) => !l.nature).length,
      warnings: p.warnings,
    }
  }

  async preview(file: { buffer: Buffer } | undefined, donorId?: string) {
    return this.summary(await this.read(file, donorId))
  }

  /** Builds the project, its activities (pillars) and budget lines from the file and keeps the file with the project. */
  async import(user: AuthUser, file: { buffer: Buffer; originalname?: string } | undefined, f: z.infer<typeof iceFields>) {
    const p = await this.read(file, f.donorId)
    const buf = file!.buffer
    const order: string[] = []
    const groups = new Map<string, typeof p.lines>()
    for (const l of p.lines) {
      if (!groups.has(l.activityCode)) {
        groups.set(l.activityCode, [])
        order.push(l.activityCode)
      }
      groups.get(l.activityCode)!.push(l)
    }
    const usable = new Set((await this.db.select({ code: accounts.code }).from(accounts).where(and(eq(accounts.type, 'expense'), eq(accounts.postable, true)))).map((a) => a.code))
    const fallback = usable.has('5299') ? '5299' : [...usable][0] ?? null
    let seq = 0
    let all = 0
    const pillars = order.map((code) => {
      const ls = groups.get(code)!
      const sum = ls.reduce((a, l) => a + toCents(l.totalUsd), 0)
      all += sum
      const title = (ls[0].activityTitle || code).slice(0, 300)
      return {
        code: code.slice(0, 20),
        nameAr: title,
        nameEn: title,
        ceilingUsd: fromCents(sum),
        lines: ls.map((l) => {
          const name = `${l.item}${l.description && l.description !== l.item ? ` — ${l.description}` : ''}${l.state ? ` [${l.state}]` : ''}`.slice(0, 300)
          return {
            code: `B${String(++seq).padStart(3, '0')}`,
            nameAr: name,
            nameEn: name,
            ceilingUsd: l.totalUsd,
            expenseAccountCode: usable.has(localAccount(l.nature)) ? localAccount(l.nature) : fallback,
            detail: {
              activityCode: l.activityCode,
              fundCode: l.fundCode || null,
              state: l.state || null,
              description: l.description.slice(0, 600) || null,
              unit: l.unit || null,
              unitQty: l.qty,
              duration: l.duration,
              unitCostUsd: l.unitCostUsd,
              nature: l.nature,
              donorAccount: l.donorAccount,
            },
          }
        }),
      }
    })
    const start = f.startDate ?? p.startDate
    const end = f.endDate ?? p.endDate
    const code = f.code ?? p.ipCode
    if (!start || !end || !code) throw unprocessable('PERIOD_OR_CODE', { ar: 'حدد رمز المشروع وتاريخ البداية والنهاية (غير موجودة في الملف)', en: 'Give the project code and start/end dates (they are not in the file)' })
    if (end < start) throw unprocessable('PERIOD', { ar: 'تاريخ النهاية قبل البداية', en: 'End date is before the start date' })
    const created = await this.budget.create(user, {
      id: f.id,
      code,
      nameAr: f.nameAr,
      nameEn: f.nameEn,
      donorAr: f.donorAr,
      donorEn: f.donorEn,
      startDate: start,
      endDate: end,
      ceilingUsd: fromCents(all),
      ipCode: p.ipCode,
      budgetRate: f.rate ?? p.rate,
      controlMode: f.controlMode,
      tolerancePct: f.tolerancePct,
      pillars,
    })
    const hash = sha256(buf)
    await storeBlob(buf, hash)
    await this.db.transaction(async (tx) => {
      const [a] = await tx
        .insert(attachments)
        .values({ ownerType: 'project', ownerId: f.id, officeId: null, fileName: cleanName(file!.originalname ?? 'donor-budget.xlsx', 'xlsx'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: buf.length, sha256: hash, note: 'Donor budget file', uploadedById: user.id })
        .returning({ id: attachments.id })
      await audit(tx, user, 'project.import', 'project', f.id, { lines: p.lines.length, total: fromCents(all), attachment: a.id })
    })
    return { id: created.id, lines: p.lines.length, totalUsd: fromCents(all), activities: pillars.length }
  }
}
