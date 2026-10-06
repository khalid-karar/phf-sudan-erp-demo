import { Check, Download, Loader2, Mail, RotateCcw, Stamp } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { FitPreview } from '../../components/report/FitPreview'
import { DocHeader, HqReportDoc } from '../../components/report/HqReportDoc'
import { SendModal } from '../../components/report/SendModal'
import { Button, Field, PageHeader, Panel } from '../../components/ui'
import type { Bi, Lang } from '../../data/types'
import { useLang } from '../../lib/i18n'
import { buildPdf } from '../../lib/pdf'
import { autoSummary, defaultChallenges, lastMonth, monthlyData, periodLabel, recentPeriods } from '../../lib/reportData'
import { usePerm, useStore } from '../../lib/store'

export function HqReport() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, user } = usePerm()
  const [period, setPeriod] = useState(lastMonth())
  const [rLang, setRLang] = useState<Lang>('ar')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const d = useMemo(() => monthlyData(s, period), [s, period])
  const draft = s.hqDrafts.find((x) => x.period === period)
  const st = s.reportSettings.hq
  const status = draft?.status ?? 'draft'
  const canApprove = user.role === st.approverRole || can('settings', 'manage')
  const canEdit = can('reports', 'edit')
  const approved = !st.requireApproval || status !== 'draft'
  const preparer = s.users.find((u) => u.role === 'finance_manager')
  const approver = s.users.find((u) => u.id === draft?.approvedBy)
  const fileName = `PHF-Sudan-monthly-report-${period}.pdf`
  const month = periodLabel(period, rLang === 'ar')

  const makePdf = async () => {
    const blocks = [...docRef.current!.querySelectorAll<HTMLElement>('[data-block]')]
    const r = await buildPdf({ blocks, header: headRef.current!, fileName, footerText: (i, n) => `PHF Sudan — ${period} — ${i} / ${n}` })
    return { ...r, fileName }
  }
  const download = async () => {
    setBusy(true)
    try {
      ;(await makePdf()).save()
    } finally {
      setBusy(false)
    }
  }
  const field = (k: 'summary' | 'challenges' | 'plan', fallback: string) => {
    const v = draft?.[k]?.[rLang]
    return v ?? fallback
  }
  const setField = (k: 'summary' | 'challenges' | 'plan', v: string) => {
    const cur: Bi = draft?.[k] ?? { ar: '', en: '' }
    s.saveHqDraft(period, { [k]: { ...cur, [rLang]: v }, status: 'draft', approvedBy: undefined })
  }
  const steps = [
    { k: 'draft', l: ar ? 'مسودة' : 'Draft' },
    ...(st.requireApproval ? [{ k: 'approved', l: ar ? 'معتمد' : 'Approved' }] : []),
    { k: 'sent', l: ar ? 'مُرسل' : 'Sent' },
  ]
  const idx = steps.findIndex((x) => x.k === status)

  return (
    <div>
      <PageHeader
        title={ar ? 'التقرير الشهري للمقر الرئيسي' : 'Monthly report to headquarters'}
        sub={
          ar
            ? `يُعدّ تلقائياً من بيانات النظام لـ «${s.org.hqName.ar}». أضف الملخص والتحديات، ثم اعتمده وأرسله بالبريد أو نزّله PDF.`
            : `Built automatically from the system’s data for “${s.org.hqName.en}”. Add the summary and challenges, then approve and email it, or download a PDF.`
        }
        actions={
          <>
            <Button variant="quiet" onClick={download} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {ar ? 'تنزيل PDF' : 'Download PDF'}
            </Button>
            {st.requireApproval && status === 'draft' && (
              <Button variant="quiet" disabled={!canApprove} title={!canApprove ? (ar ? `يعتمده ${s.roles.find((r) => r.id === st.approverRole)?.name.ar}` : 'Needs the approver role') : undefined} onClick={() => s.saveHqDraft(period, { status: 'approved', approvedBy: user.id, approvedAt: new Date().toISOString() })}>
                <Stamp size={16} /> {ar ? 'اعتماد التقرير' : 'Approve report'}
              </Button>
            )}
            <Button disabled={!approved || !canEdit} onClick={() => setSending(true)} title={!approved ? (ar ? 'يجب اعتماد التقرير قبل الإرسال' : 'Approve the report before sending') : undefined}>
              <Mail size={16} /> {ar ? 'إرسال بالبريد' : 'Send by email'}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Field label={ar ? 'الشهر' : 'Month'}>
          <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {recentPeriods().map((p) => (
              <option key={p} value={p}>
                {periodLabel(p, ar)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? 'لغة التقرير' : 'Report language'}>
          <div className="flex h-10 rounded-md border border-line bg-surface p-0.5">
            {(['ar', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setRLang(l)} className={`rounded px-3 text-[13.5px] ${rLang === l ? 'bg-nile text-white' : 'text-muted'}`}>
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </Field>
        <ol className="ms-auto flex items-center gap-2 text-[13px]" aria-label={ar ? 'حالة التقرير' : 'Report status'}>
          {steps.map((x, i) => (
            <li key={x.k} className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${i <= idx ? 'bg-leaf-soft text-leaf' : 'bg-paper text-muted ring-1 ring-line'}`}>
                {i < idx || (i === idx && x.k !== 'draft') ? <Check size={13} /> : <span className="num">{i + 1}</span>}
                {x.l}
              </span>
              {i < steps.length - 1 && <span className="h-px w-5 bg-line" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[340px_1fr]">
        <Panel className="space-y-4 p-5 xl:sticky xl:top-20">
          <div className="text-[14px] font-semibold">{ar ? 'المحتوى الذي تكتبه' : 'What you write'}</div>
          <p className="-mt-2 text-[12.5px] text-muted">{ar ? 'بقية التقرير (الأرقام والجداول) يُملأ تلقائياً.' : 'The rest of the report (figures and tables) fills itself.'}</p>
          {(
            [
              ['summary', ar ? 'الملخص التنفيذي' : 'Executive summary', autoSummary(d, rLang === 'ar')],
              ['challenges', ar ? 'التحديات والاحتياجات' : 'Challenges and needs', defaultChallenges[rLang]],
              ['plan', ar ? 'خطة الشهر القادم (اختياري)' : 'Next month’s plan (optional)', ''],
            ] as const
          ).map(([k, label, fb]) => (
            <div key={k}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[13.5px] font-medium">{label}</span>
                {draft?.[k]?.[rLang] !== undefined && (
                  <button className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-nile" onClick={() => s.saveHqDraft(period, { [k]: undefined })}>
                    <RotateCcw size={12} /> {ar ? 'النص التلقائي' : 'Auto text'}
                  </button>
                )}
              </div>
              <textarea
                dir={rLang === 'ar' ? 'rtl' : 'ltr'}
                disabled={!canEdit || status === 'sent'}
                className="h-32 w-full rounded-md border border-line p-2.5 text-[13.5px] leading-relaxed disabled:bg-paper"
                value={field(k, fb)}
                onChange={(e) => setField(k, e.target.value)}
              />
            </div>
          ))}
          {status !== 'draft' && <p className="text-[12.5px] text-muted">{ar ? 'أي تعديل يعيد التقرير إلى مسودة تحتاج اعتماداً جديداً.' : 'Any edit returns the report to a draft that needs approving again.'}</p>}
        </Panel>

        <FitPreview innerRef={docRef}>
          <HqReportDoc d={d} draft={draft} org={s.org} lang={rLang} sections={st.includeSections} preparer={preparer} approver={approver} />
        </FitPreview>
      </div>

      <div aria-hidden className="pointer-events-none fixed top-0 -left-[3000px]">
        <DocHeader ref={headRef} org={s.org} lang={rLang} title={rLang === 'ar' ? 'التقرير الشهري — مكتب السودان' : 'Monthly report — Sudan office'} sub={month} />
      </div>

      {sending && (
        <SendModal
          title={{ ar: `التقرير الشهري — ${periodLabel(period, true)}`, en: `Monthly report — ${periodLabel(period, false)}` }}
          defaults={st}
          vars={{ month: periodLabel(period, ar), hq: s.org.hqName[lang], org: s.org.name[lang], sender: user.name[lang] }}
          makePdf={makePdf}
          onClose={() => setSending(false)}
          onSent={(r) => s.recordSent({ kind: 'hq', title: { ar: `التقرير الشهري — ${periodLabel(period, true)}`, en: `Monthly report — ${periodLabel(period, false)}` }, period, ...r })}
        />
      )}
    </div>
  )
}
