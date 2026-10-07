// The Excel template for offices with weak internet: the office fills it in offline, then uploads it.
// The layout matches the one the screens already use (same hidden stamp), so either can read the other's file.
import ExcelJS from 'exceljs'

export const TEMPLATE = 'PHF-FIELD-REPORTS'
export const VERSION = '1'
export const SHEET = 'التقارير'
const FIRST_ROW = 4
const LAST_TEMPLATE_ROW = 53 // 50 rows for reports
export const MAX_ROWS = 200

export interface OpenActivity {
  code: string
  titleAr: string
}

/** The office's template: locked headings, a dropdown of its activities still waiting for a report, number checks, and a hidden stamp. */
export async function buildTemplate(officeId: string, officeNameAr: string, activities: OpenActivity[], sample: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PHF ERP'
  const ws = wb.addWorksheet(SHEET, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] })
  const lists = wb.addWorksheet('قوائم', { state: 'veryHidden' })
  const meta = wb.addWorksheet('_meta', { state: 'veryHidden' })
  meta.addRows([
    ['template', TEMPLATE],
    ['version', VERSION],
    ['office', officeId],
    ['generated', new Date().toISOString()],
  ])
  lists.getCell('A1').value = 'activities'
  activities.forEach((a, i) => {
    lists.getCell(`A${i + 2}`).value = a.code
    lists.getCell(`B${i + 2}`).value = a.titleAr
  })

  ws.mergeCells('A1:H1')
  ws.getCell('A1').value = `قالب التقارير الفنية — مكتب ${officeNameAr} — لا تغيّر العناوين أو ترتيب الأعمدة`
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF12394A' } }
  ws.mergeCells('A2:H2')
  ws.getCell('A2').value = `أُنشئ ${new Date().toISOString().slice(0, 10)} — اختر رقم النشاط من القائمة، وأدخل الأرقام فقط في خانات المستفيدين والتكلفة.`
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF5D6B71' } }
  const headers = ['رقم النشاط', 'تاريخ التنفيذ', 'رجال', 'نساء', 'أطفال', 'ماذا تم', 'مشكلات أو ملاحظات', 'التكلفة الفعلية (دولار)']
  ws.getRow(3).values = headers
  ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(3).height = 22
  headers.forEach((_, i) => {
    const c = ws.getRow(3).getCell(i + 1)
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12394A' } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  ws.columns = [{ width: 18 }, { width: 15 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 46 }, { width: 32 }, { width: 18 }]
  const listRef = `قوائم!$A$2:$A$${Math.max(2, activities.length + 1)}`
  for (let r = FIRST_ROW; r <= LAST_TEMPLATE_ROW; r++) {
    const row = ws.getRow(r)
    row.getCell(1).dataValidation = { type: 'list', allowBlank: true, formulae: [listRef], showErrorMessage: true, errorTitle: 'رقم غير صحيح', error: 'اختر رقم النشاط من القائمة' }
    row.getCell(2).dataValidation = { type: 'date', operator: 'lessThanOrEqual', allowBlank: true, formulae: [new Date()], showErrorMessage: true, error: 'أدخل تاريخاً صحيحاً لا يتجاوز اليوم' }
    row.getCell(2).numFmt = 'yyyy-mm-dd'
    for (const c of [3, 4, 5]) row.getCell(c).dataValidation = { type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'أدخل رقماً صحيحاً' }
    row.getCell(8).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'أدخل مبلغاً' }
    for (let c = 1; c <= 8; c++) row.getCell(c).protection = { locked: false }
  }
  if (sample && activities.length) {
    const d = (n: number) => new Date(Date.now() - n * 86_400_000)
    const rows: (string | number | Date)[][] = [
      [activities[0].code, d(2), 34, 51, 40, 'كشف 125 مريضاً وصرف أدوية، تحويل حالتين', '', 610],
      [activities[1]?.code ?? activities[0].code, d(1), 0, 22, 60, 'فحص 60 طفلاً ومتابعة 22 أماً', 'نقص في أشرطة فحص الملاريا', ''],
      ['ACT-XXX-9999', d(1), 10, 10, 0, 'صف تجريبي برقم نشاط غير موجود', '', ''],
    ]
    rows.forEach((v, i) => (ws.getRow(FIRST_ROW + i).values = v))
  }
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/**
 * An .xlsx is a zip. Before opening one, check it is a zip and that it will not unpack into something huge
 * (a few KB can claim to hold gigabytes). Reads the zip's table of contents only.
 */
export function inspectZip(buf: Buffer): { ok: true } | { ok: false; reason: 'NOT_ZIP' | 'TOO_BIG' } {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return { ok: false, reason: 'NOT_ZIP' }
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) return { ok: false, reason: 'NOT_ZIP' }
  const entries = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  if (entries > 200) return { ok: false, reason: 'TOO_BIG' }
  let total = 0
  for (let i = 0; i < entries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return { ok: false, reason: 'NOT_ZIP' }
    total += buf.readUInt32LE(p + 24)
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return total > 50 * 1024 * 1024 ? { ok: false, reason: 'TOO_BIG' } : { ok: true }
}

type Cell = ExcelJS.CellValue

/** A cell's plain value: formula results, rich text and links become what the person sees. */
const plain = (v: Cell): string | number | boolean | Date | null => {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || v instanceof Date) return v as string | number | boolean | Date
  if ('result' in v) return plain(v.result as Cell)
  if ('richText' in v) return v.richText.map((t) => t.text).join('')
  if ('text' in v) return String(v.text)
  return null
}

export interface RawRow {
  line: number
  code: string
  doneOn: string | null
  men: unknown
  women: unknown
  children: unknown
  summary: string
  issues: string
  actual: unknown
}

export type ParsedFile = { ok: true; officeId: string; rows: RawRow[] } | { ok: false; code: 'NOT_TEMPLATE' | 'OLD_VERSION' | 'UNREADABLE' | 'EMPTY' | 'TOO_MANY_ROWS' }

const isoDay = (v: ReturnType<typeof plain>): string | null => {
  if (v instanceof Date) return isNaN(+v) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    const d = new Date(v.trim().slice(0, 10) + 'T00:00:00Z')
    return isNaN(+d) || d.toISOString().slice(0, 10) !== v.trim().slice(0, 10) ? null : v.trim().slice(0, 10)
  }
  return null
}

export async function readTemplate(buf: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer)
  } catch {
    return { ok: false, code: 'UNREADABLE' }
  }
  const m: Record<string, string> = {}
  wb.getWorksheet('_meta')?.eachRow((r) => (m[String(plain(r.getCell(1).value))] = String(plain(r.getCell(2).value))))
  if (m.template !== TEMPLATE) return { ok: false, code: 'NOT_TEMPLATE' }
  if (m.version !== VERSION) return { ok: false, code: 'OLD_VERSION' }
  const ws = wb.getWorksheet(SHEET)
  if (!ws) return { ok: false, code: 'NOT_TEMPLATE' }
  const rows: RawRow[] = []
  for (let r = FIRST_ROW; r <= Math.min(ws.rowCount, FIRST_ROW + 2000); r++) {
    const row = ws.getRow(r)
    const c = Array.from({ length: 8 }, (_, i) => plain(row.getCell(i + 1).value))
    if (c.every((x) => x === null || x === '')) continue
    rows.push({ line: r, code: String(c[0] ?? '').trim(), doneOn: isoDay(c[1]), men: c[2], women: c[3], children: c[4], summary: String(c[5] ?? '').trim(), issues: String(c[6] ?? '').trim(), actual: c[7] })
  }
  if (!rows.length) return { ok: false, code: 'EMPTY' }
  if (rows.length > MAX_ROWS) return { ok: false, code: 'TOO_MANY_ROWS' }
  return { ok: true, officeId: m.office, rows }
}
