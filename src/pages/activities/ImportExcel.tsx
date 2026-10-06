import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Button, PageHeader, Panel } from '../../components/ui'
import type { FieldActivity, FieldReport } from '../../data/types'
import { date } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

const TEMPLATE = 'PHF-FIELD-REPORTS'
const VERSION = '1'

interface Row {
  line: number
  code: string
  doneOn?: Date
  men: number
  women: number
  children: number
  summary: string
  issues: string
  actual?: number
  errors: { ar: string; en: string }[]
  activity?: FieldActivity
}

function download(buf: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Builds the office's template: locked headers, a dropdown of its open activities, number checks, and a hidden version stamp. */
async function buildTemplate(officeId: string, officeName: string, activities: FieldActivity[], sample: boolean) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PHF ERP'
  const ws = wb.addWorksheet('التقارير', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] })
  const lists = wb.addWorksheet('قوائم', { state: 'veryHidden' })
  const meta = wb.addWorksheet('_meta', { state: 'veryHidden' })
  meta.addRows([
    ['template', TEMPLATE],
    ['version', VERSION],
    ['office', officeId],
    ['generated', new Date().toISOString()],
  ])
  lists.getCell('A1').value = 'activities'
  activities.forEach((a, i) => (lists.getCell(`A${i + 2}`).value = a.code))
  activities.forEach((a, i) => (lists.getCell(`B${i + 2}`).value = a.title.ar))

  ws.mergeCells('A1:H1')
  ws.getCell('A1').value = `قالب التقارير الفنية — مكتب ${officeName} — لا تغيّر العناوين أو ترتيب الأعمدة`
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF12394A' } }
  ws.mergeCells('A2:H2')
  ws.getCell('A2').value = `أُنشئ ${new Date().toLocaleDateString('en-GB')} — اختر رقم النشاط من القائمة، وأدخل الأرقام فقط في خانات المستفيدين والتكلفة.`
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
  for (let r = 4; r <= 53; r++) {
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
    rows.forEach((v, i) => (ws.getRow(4 + i).values = v))
  }
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true })
  return wb.xlsx.writeBuffer()
}

export function ImportExcel() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { scopeOffice, user } = usePerm()
  const [officeId, setOfficeId] = useState(scopeOffice ?? (user.officeId === 'khr' ? 'ksl' : user.officeId))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fileErr, setFileErr] = useState<{ ar: string; en: string } | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const office = s.offices.find((o) => o.id === officeId)!
  const open = s.activities.filter((a) => a.officeId === officeId && !a.report)

  const get = async (sample: boolean) => {
    setBusy(true)
    try {
      const buf = await buildTemplate(officeId, office.name.ar, open, sample)
      download(buf as ArrayBuffer, `phf-field-reports-${sample ? 'sample-' : ''}${office.name.en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`)
    } finally {
      setBusy(false)
    }
  }

  const read = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setRows(null)
    setFileErr(null)
    setBusy(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const meta = wb.getWorksheet('_meta')
      const m: Record<string, string> = {}
      meta?.eachRow((r) => (m[String(r.getCell(1).value)] = String(r.getCell(2).value)))
      if (m.template !== TEMPLATE) return setFileErr({ ar: 'هذا الملف ليس قالب التقارير الفنية. نزّل القالب من هذه الصفحة.', en: 'This file isn’t the field report template. Download the template from this page.' })
      if (m.version !== VERSION) return setFileErr({ ar: 'نسخة القالب قديمة. نزّل القالب الجديد وانقل البيانات إليه.', en: 'This template version is outdated. Download the new one and copy the data across.' })
      if (m.office !== officeId)
        return setFileErr({
          ar: `هذا القالب يخص مكتب ${s.offices.find((o) => o.id === m.office)?.name.ar ?? m.office}، وليس ${office.name.ar}.`,
          en: `This template belongs to ${s.offices.find((o) => o.id === m.office)?.name.en ?? m.office}, not ${office.name.en}.`,
        })
      const ws = wb.getWorksheet('التقارير')!
      const out: Row[] = []
      const seen = new Set<string>()
      const val = (v: unknown) => (v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v)
      for (let r = 4; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const cells = Array.from({ length: 8 }, (_, i) => val(row.getCell(i + 1).value))
        if (cells.every((c) => c === null || c === undefined || c === '')) continue
        const code = String(cells[0] ?? '').trim()
        const errors: Row['errors'] = []
        const act = s.activities.find((a) => a.code === code)
        if (!code) errors.push({ ar: 'رقم النشاط فارغ', en: 'Activity number is empty' })
        else if (!act) errors.push({ ar: 'رقم النشاط غير موجود', en: 'Unknown activity number' })
        else if (act.officeId !== officeId) errors.push({ ar: 'النشاط يتبع مكتباً آخر', en: 'Activity belongs to another office' })
        else if (act.report) errors.push({ ar: 'رُفع تقرير هذا النشاط مسبقاً', en: 'This activity already has a report' })
        if (code && seen.has(code)) errors.push({ ar: 'النشاط مكرر في الملف', en: 'Activity repeated in the file' })
        seen.add(code)
        const d = cells[1] instanceof Date ? cells[1] : cells[1] ? new Date(String(cells[1])) : undefined
        if (!d || isNaN(+d)) errors.push({ ar: 'تاريخ التنفيذ غير صحيح', en: 'Date is not valid' })
        else if (+d > Date.now() + 86_400_000) errors.push({ ar: 'التاريخ في المستقبل', en: 'Date is in the future' })
        const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v))
        const men = n(cells[2])
        const women = n(cells[3])
        const children = n(cells[4])
        if ([men, women, children].some((x) => isNaN(x) || x < 0)) errors.push({ ar: 'أعداد المستفيدين يجب أن تكون أرقاماً', en: 'Beneficiary counts must be numbers' })
        else if (men + women + children === 0) errors.push({ ar: 'لا يوجد مستفيدون', en: 'No beneficiaries entered' })
        const summary = String(cells[5] ?? '').trim()
        if (summary.length < 4) errors.push({ ar: 'وصف ما تم ناقص', en: 'Description is missing' })
        const actual = cells[7] === null || cells[7] === undefined || cells[7] === '' ? undefined : Number(cells[7])
        if (actual !== undefined && (isNaN(actual) || actual < 0)) errors.push({ ar: 'التكلفة يجب أن تكون رقماً', en: 'Cost must be a number' })
        out.push({ line: r, code, doneOn: d, men, women, children, summary, issues: String(cells[6] ?? ''), actual, errors, activity: act })
      }
      if (!out.length) return setFileErr({ ar: 'الملف لا يحتوي على صفوف معبأة.', en: 'The file has no filled rows.' })
      setRows(out)
    } catch {
      setFileErr({ ar: 'تعذّرت قراءة الملف. تأكد أنه ملف Excel (.xlsx).', en: 'Couldn’t read the file. Make sure it’s an Excel (.xlsx) file.' })
    } finally {
      setBusy(false)
    }
  }

  const good = rows?.filter((r) => !r.errors.length) ?? []
  const importNow = () => {
    s.importReports(
      good.map((r) => ({
        activityId: r.activity!.id,
        report: {
          no: `TR-${r.code.slice(4)}`,
          submittedAt: new Date().toISOString(),
          doneOn: r.doneOn!.toISOString(),
          men: r.men,
          women: r.women,
          children: r.children,
          beneficiaries: r.men + r.women + r.children,
          summary: { ar: r.summary, en: r.summary },
          issues: r.issues || undefined,
          actualUSD: r.actual,
          submittedBy: s.userId,
        } satisfies FieldReport,
      })),
    )
    setRows(rows!.filter((r) => r.errors.length))
  }

  return (
    <div>
      <PageHeader
        title={ar ? 'الاستيراد من Excel' : 'Import from Excel'}
        sub={
          ar
            ? 'للمكاتب ذات الاتصال الضعيف: نزّل قالب المكتب، اعمل عليه دون إنترنت، ثم ارفعه عند توفر الاتصال. يفحص النظام كل صف قبل إدخاله.'
            : 'For offices with weak internet: download the office template, fill it offline, and upload when you have a connection. Every row is checked before it goes in.'
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-center gap-2 font-semibold">
            <span className="num grid size-7 place-items-center rounded-full bg-nile text-[13px] text-white">1</span>
            {ar ? 'تنزيل القالب' : 'Download the template'}
          </div>
          <label className="mt-4 block text-[13.5px]">
            {ar ? 'المكتب' : 'Office'}
            <select className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-2" value={officeId} disabled={!!scopeOffice} onChange={(e) => setOfficeId(e.target.value)}>
              {s.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name[lang]}
                </option>
              ))}
            </select>
          </label>
          <ul className="mt-3 space-y-1 text-[13px] text-muted">
            <li>• {ar ? `قائمة منسدلة بأنشطة المكتب المفتوحة (${open.length})` : `Dropdown of the office’s open activities (${open.length})`}</li>
            <li>• {ar ? 'العناوين مقفلة، والأعمدة تقبل الأرقام والتواريخ فقط' : 'Headers locked; columns accept only numbers and dates'}</li>
            <li>• {ar ? 'يحمل رقم نسخة ورمز المكتب، فلا يُقبل قالب قديم أو لمكتب آخر' : 'Carries a version and office stamp, so old or other-office files are refused'}</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => get(false)} disabled={busy || !open.length}>
              <Download size={16} /> {ar ? 'تنزيل القالب' : 'Download template'}
            </Button>
            <Button variant="quiet" onClick={() => get(true)} disabled={busy || !open.length}>
              <FileSpreadsheet size={16} /> {ar ? 'نموذج معبأ للتجربة' : 'Filled sample to try'}
            </Button>
          </div>
          {!open.length && <p className="mt-2 text-[13px] text-amber">{ar ? 'لا توجد أنشطة مفتوحة لهذا المكتب.' : 'This office has no open activities.'}</p>}
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2 font-semibold">
            <span className="num grid size-7 place-items-center rounded-full bg-nile text-[13px] text-white">2</span>
            {ar ? 'رفع الملف بعد تعبئته' : 'Upload the filled file'}
          </div>
          <label
            className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-line py-8 text-center hover:border-nile-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              read(e.dataTransfer.files[0])
            }}
          >
            <Upload size={24} className="text-nile" />
            <span className="text-[14px] font-medium">{ar ? 'اسحب الملف هنا أو اضغط للاختيار' : 'Drop the file here or click to choose'}</span>
            <span className="text-[12.5px] text-muted">{fileName || '.xlsx'}</span>
            <input type="file" accept=".xlsx" className="sr-only" data-testid="xlsx-input" onChange={(e) => read(e.target.files?.[0])} />
          </label>
          {busy && <p className="mt-2 text-[13px] text-muted">{ar ? 'جارٍ القراءة…' : 'Reading…'}</p>}
          {fileErr && (
            <p className="mt-3 flex gap-2 rounded-md bg-crescent-soft px-3 py-2 text-[13.5px] text-crescent">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {fileErr[lang]}
            </p>
          )}
        </Panel>
      </div>

      {rows && (
        <Panel
          className="mt-6"
          title={
            <span className="flex items-center gap-2">
              <span className="num grid size-7 place-items-center rounded-full bg-nile text-[13px] text-white">3</span>
              {ar ? 'المعاينة قبل الإدخال' : 'Preview before importing'}
            </span>
          }
          aside={
            <Button className="h-9" disabled={!good.length} onClick={importNow}>
              {ar ? `إدخال الصفوف السليمة (${good.length})` : `Import valid rows (${good.length})`}
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12.5px] text-muted">
                  <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الصف' : 'Row'}</th>
                  <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'النشاط' : 'Activity'}</th>
                  <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'التاريخ' : 'Date'}</th>
                  <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'المستفيدون' : 'Beneficiaries'}</th>
                  <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'ماذا تم' : 'What was done'}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{ar ? 'النتيجة' : 'Result'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? 'bg-crescent-soft/40' : ''}>
                    <td className="num px-5 py-2.5 text-muted">{r.line}</td>
                    <td className="num py-2.5 pe-3">{r.code || '—'}</td>
                    <td className="num py-2.5 pe-3">{r.doneOn && !isNaN(+r.doneOn) ? date(r.doneOn.toISOString(), lang) : '—'}</td>
                    <td className="num py-2.5 pe-3 text-end">{r.men + r.women + r.children}</td>
                    <td className="max-w-[280px] truncate py-2.5 pe-3">{r.summary}</td>
                    <td className="px-5 py-2.5">
                      {r.errors.length ? (
                        <span className="flex items-start gap-1.5 text-[13px] text-crescent">
                          <XCircle size={15} className="mt-0.5 shrink-0" /> {r.errors.map((e) => e[lang]).join(ar ? '، ' : ', ')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-leaf">
                          <CheckCircle2 size={15} /> {ar ? 'جاهز للإدخال' : 'Ready'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-muted">
            {ar ? 'الصفوف التي بها أخطاء لا تُدخل. صحّحها في الملف وارفعه مرة أخرى؛ لن تتكرر الصفوف التي أُدخلت.' : 'Rows with errors are not imported. Fix them in the file and upload again; imported rows won’t be duplicated.'}
          </p>
        </Panel>
      )}
    </div>
  )
}
