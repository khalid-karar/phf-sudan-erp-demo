import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, notExists } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { audit } from '../common/audit'
import { AppError, forbidden, notFound, unprocessable, type Bi } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { activities, fieldReports, offices } from '../db/schema'
import { ActivitiesService } from './activities.service'
import { buildTemplate, inspectZip, readTemplate, type RawRow } from './excel'

export type RowStatus = 'ok' | 'imported' | 'duplicate' | 'error'
export interface RowResult {
  line: number
  code: string
  status: RowStatus
  errors: Bi[]
  reportNo?: string
}

const today = () => new Date().toISOString().slice(0, 10)
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

/** A whole non-negative count from a cell; empty means zero. Returns null when it is not one. */
const count = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null
}

@Injectable()
export class ExcelService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly activitiesSvc: ActivitiesService,
  ) {}

  /** The template for one office. Office-limited users get their own office's. */
  async template(user: AuthUser, officeId: string | undefined, sample: boolean) {
    const limited = scopeOffice(user)
    const id = limited ?? officeId
    if (!id) throw unprocessable('OFFICE_REQUIRED', { ar: 'حدد المكتب', en: 'Choose an office' })
    if (limited && officeId && officeId !== limited) throw forbidden({ ar: 'يمكنك تنزيل قالب مكتبك فقط', en: 'You can download only your own office’s template' })
    const [office] = await this.db.select().from(offices).where(eq(offices.id, id))
    if (!office) throw notFound({ ar: 'المكتب', en: 'Office' })
    // Activities still waiting for a report.
    const open = await this.db
      .select({ code: activities.code, titleAr: activities.titleAr })
      .from(activities)
      .where(and(eq(activities.officeId, id), notExists(this.db.select({ x: fieldReports.id }).from(fieldReports).where(eq(fieldReports.activityId, activities.id)))))
      .orderBy(asc(activities.plannedDate), asc(activities.code))
    const buf = await buildTemplate(id, office.nameAr, open, sample)
    return { buf, fileName: `phf-field-reports-${sample ? 'sample-' : ''}${id}.xlsx`, activities: open.length }
  }

  /**
   * Checks every row of an uploaded template and, unless `dryRun`, files the good rows as field reports (via Excel).
   * Bad rows are listed with the reason and nothing else is blocked. Uploading the same file twice does not file anything twice.
   */
  async import(user: AuthUser, file: { buffer: Buffer } | undefined, dryRun: boolean) {
    if (!file?.buffer?.length) throw unprocessable('NO_FILE', { ar: 'لم يُرفق ملف', en: 'No file was attached' })
    const z = inspectZip(file.buffer)
    if (!z.ok) throw unprocessable('NOT_XLSX', { ar: 'تعذّرت قراءة الملف. تأكد أنه ملف Excel (.xlsx).', en: 'Couldn’t read the file. Make sure it’s an Excel (.xlsx) file.' })
    const parsed = await readTemplate(file.buffer)
    if (!parsed.ok) {
      const msg: Record<string, Bi> = {
        NOT_TEMPLATE: { ar: 'هذا الملف ليس قالب التقارير الفنية. نزّل القالب من النظام.', en: 'This file isn’t the field report template. Download the template from the system.' },
        OLD_VERSION: { ar: 'نسخة القالب قديمة. نزّل القالب الجديد وانقل البيانات إليه.', en: 'This template version is outdated. Download the new one and copy the data across.' },
        UNREADABLE: { ar: 'تعذّرت قراءة الملف. تأكد أنه ملف Excel (.xlsx).', en: 'Couldn’t read the file. Make sure it’s an Excel (.xlsx) file.' },
        EMPTY: { ar: 'الملف لا يحتوي على صفوف معبأة.', en: 'The file has no filled rows.' },
        TOO_MANY_ROWS: { ar: 'الملف يحتوي على صفوف أكثر من الحد (200)؛ قسّمه إلى ملفين.', en: 'The file has more rows than the limit (200); split it in two.' },
      }
      throw unprocessable(`TEMPLATE_${parsed.code}`, msg[parsed.code])
    }

    const limited = scopeOffice(user)
    if (limited && parsed.officeId !== limited) throw forbidden({ ar: 'هذا القالب يخص مكتباً آخر', en: 'This template belongs to another office' })
    const [office] = await this.db.select().from(offices).where(eq(offices.id, parsed.officeId))
    if (!office) throw unprocessable('TEMPLATE_OFFICE', { ar: 'مكتب القالب غير موجود', en: 'The template’s office does not exist' })

    const fileKey = createHash('sha256').update(file.buffer).digest('hex').slice(0, 16)
    const acts = await this.db.select().from(activities).where(inArray(activities.code, parsed.rows.map((r) => r.code).filter(Boolean)))
    const byCode = new Map(acts.map((a) => [a.code, a]))
    const reports = acts.length ? await this.db.select({ activityId: fieldReports.activityId, clientId: fieldReports.clientId, no: fieldReports.no }).from(fieldReports).where(inArray(fieldReports.activityId, acts.map((a) => a.id))) : []
    const reportOf = new Map(reports.map((r) => [r.activityId, r]))

    const seen = new Set<string>()
    const results: RowResult[] = []
    const toFile: { row: RawRow; activityId: string; counts: [number, number, number]; actual: string | undefined; clientId: string }[] = []

    for (const row of parsed.rows) {
      const errors: Bi[] = []
      const a = byCode.get(row.code)
      const clientId = `xl:${fileKey}:${row.code}`
      let duplicate = false
      if (!row.code) errors.push({ ar: 'رقم النشاط فارغ', en: 'Activity number is empty' })
      else if (!a) errors.push({ ar: 'رقم النشاط غير موجود', en: 'Unknown activity number' })
      else if (a.officeId !== parsed.officeId) errors.push({ ar: 'النشاط يتبع مكتباً آخر', en: 'Activity belongs to another office' })
      else {
        const have = reportOf.get(a.id)
        if (have && have.clientId === clientId) duplicate = true
        else if (have) errors.push({ ar: 'رُفع تقرير هذا النشاط مسبقاً', en: 'This activity already has a report' })
      }
      if (row.code && seen.has(row.code)) errors.push({ ar: 'النشاط مكرر في الملف', en: 'Activity repeated in the file' })
      seen.add(row.code)

      if (!row.doneOn) errors.push({ ar: 'تاريخ التنفيذ غير صحيح', en: 'Date is not valid' })
      else if (row.doneOn > tomorrow()) errors.push({ ar: 'التاريخ في المستقبل', en: 'Date is in the future' })
      const [men, women, children] = [count(row.men), count(row.women), count(row.children)]
      if (men === null || women === null || children === null) errors.push({ ar: 'أعداد المستفيدين يجب أن تكون أرقاماً صحيحة', en: 'Beneficiary counts must be whole numbers' })
      else if (men + women + children === 0) errors.push({ ar: 'لا يوجد مستفيدون', en: 'No beneficiaries entered' })
      if (row.summary.length < 3) errors.push({ ar: 'وصف ما تم ناقص', en: 'Description is missing' })
      if (row.summary.length > 5000 || row.issues.length > 5000) errors.push({ ar: 'النص أطول من المسموح', en: 'The text is too long' })
      let actual: string | undefined
      if (row.actual !== null && row.actual !== undefined && row.actual !== '') {
        const n = typeof row.actual === 'number' ? row.actual : Number(String(row.actual).trim())
        if (!Number.isFinite(n) || n < 0 || n > 1e11) errors.push({ ar: 'التكلفة يجب أن تكون رقماً', en: 'Cost must be a number' })
        else actual = n.toFixed(2)
      }

      if (errors.length) results.push({ line: row.line, code: row.code, status: 'error', errors })
      else if (duplicate) results.push({ line: row.line, code: row.code, status: 'duplicate', errors: [], reportNo: reportOf.get(a!.id)?.no })
      else {
        results.push({ line: row.line, code: row.code, status: 'ok', errors: [] })
        toFile.push({ row, activityId: a!.id, counts: [men!, women!, children!], actual, clientId })
      }
    }

    if (!dryRun) {
      for (const t of toFile) {
        const res = results.find((r) => r.line === t.row.line)!
        try {
          const [men, women, children] = t.counts
          const r = await this.activitiesSvc.submitReport(user, t.activityId, {
            clientId: t.clientId,
            doneOn: t.row.doneOn!,
            beneficiaries: men + women + children,
            men,
            women,
            children,
            summary: t.row.summary,
            issues: t.row.issues || undefined,
            actualUsd: t.actual,
            via: 'excel',
          })
          res.status = r.duplicate ? 'duplicate' : 'imported'
          res.reportNo = r.no
        } catch (e) {
          // One row failing (say, someone filed that activity's report a moment ago) does not stop the others.
          res.status = 'error'
          res.errors.push(e instanceof AppError ? e.msg : { ar: 'تعذّر حفظ هذا الصف', en: 'This row could not be saved' })
        }
      }
      await this.db.transaction((tx) => audit(tx, user, 'report.import_excel', 'office', parsed.officeId, { file: fileKey, imported: results.filter((r) => r.status === 'imported').length, failed: results.filter((r) => r.status === 'error').length }))
    }

    const n = (s: RowStatus) => results.filter((r) => r.status === s).length
    return { office: { id: office.id, nameAr: office.nameAr, nameEn: office.nameEn }, dryRun, today: today(), total: results.length, ready: n('ok'), imported: n('imported'), duplicates: n('duplicate'), failed: n('error'), rows: results }
  }
}
