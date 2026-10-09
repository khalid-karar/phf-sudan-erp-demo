import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { backend, useDo, useLoad } from '../../api/programme'
import type { ReportDetail, ReportRow } from '../../api/programme'
import { Button, Field, Modal, PageHeader, Panel, inputCls } from '../../components/ui'
import { useLang } from '../../lib/i18n'
import { STATUS_LABEL, TYPE_LABEL, periodLabel } from '../../lib/programme'
import type { ReportStatus, ReportType } from '../../lib/programme'
import { usePerm, useStore } from '../../lib/store'
import { ReportBody } from './ReportBody'

export function Status({ s }: { s: ReportStatus }) {
  const ar = useLang() === 'ar'
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ${STATUS_LABEL[s].cls}`}>{STATUS_LABEL[s][ar ? 'ar' : 'en']}</span>
}

export function ProjectReports() {
  const ar = useLang() === 'ar'
  const { can } = usePerm()
  const projects = useStore((s) => s.projects)
  const [sp, setSp] = useSearchParams()
  const q = { projectId: sp.get('p') || undefined, type: (sp.get('type') || undefined) as ReportType | undefined, status: (sp.get('status') || undefined) as ReportStatus | undefined, mine: sp.get('mine') === '1', waiting: sp.get('waiting') === '1' }
  const list = useLoad(() => backend.reports(q), [sp.toString()], [] as ReportRow[])
  const setQ = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n) }
  const sel = (k: string, label: string, opts: [string, string][]) => (
    <select aria-label={label} className={inputCls + ' w-48'} value={sp.get(k) ?? ''} onChange={(e) => setQ(k, e.target.value)}>
      <option value="">{label}</option>
      {opts.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
    </select>
  )
  return (
    <div>
      <PageHeader title={ar ? 'تقارير المشاريع' : 'Project reports'} sub={ar ? 'الشهرية (إحصائي وسردي ومخصص) والربع سنوية، من الإعداد حتى اعتماد PMO والإفراج للمانح.' : 'Monthly (statistics, narrative, custom) and quarterly reports, from preparation to PMO approval and release to the donor.'} actions={can('reports', 'manage') && <Link to="/reports/templates"><Button variant="quiet">{ar ? 'نماذج التقارير المخصصة' : 'Custom templates'}</Button></Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {sel('p', ar ? 'كل المشاريع' : 'All projects', projects.map((p) => [p.id, p.code]))}
        {sel('type', ar ? 'كل الأنواع' : 'All types', (Object.keys(TYPE_LABEL) as ReportType[]).map((t) => [t, TYPE_LABEL[t][ar ? 'ar' : 'en']]))}
        {sel('status', ar ? 'كل الحالات' : 'All statuses', (Object.keys(STATUS_LABEL) as ReportStatus[]).map((t) => [t, STATUS_LABEL[t][ar ? 'ar' : 'en']]))}
        <label className="flex items-center gap-1.5 text-[14px]"><input type="checkbox" checked={q.mine} onChange={(e) => setQ('mine', e.target.checked ? '1' : '')} />{ar ? 'تقاريري' : 'Mine'}</label>
        {can('reports', 'manage') && <label className="flex items-center gap-1.5 text-[14px]"><input type="checkbox" checked={q.waiting} onChange={(e) => setQ('waiting', e.target.checked ? '1' : '')} />{ar ? 'بانتظار مراجعتي' : 'Waiting for review'}</label>}
      </div>
      <Panel>
        <table className="w-full text-[14px]">
          <thead className="text-muted"><tr className="border-b border-line"><th className="px-4 py-2.5 text-start">{ar ? 'المشروع' : 'Project'}</th><th className="text-start">{ar ? 'التقرير' : 'Report'}</th><th className="text-start">{ar ? 'الفترة' : 'Period'}</th><th className="text-start">{ar ? 'الموعد' : 'Due'}</th><th className="text-start">{ar ? 'الحالة' : 'Status'}</th></tr></thead>
          <tbody>
            {list.data.map((r) => (
              <tr key={r.id} className="border-b border-line hover:bg-paper">
                <td className="px-4 py-2.5"><Link className="font-medium text-nile hover:underline" to={`/reports/project/${r.id}`}>{r.projectCode}</Link></td>
                <td>{TYPE_LABEL[r.type][ar ? 'ar' : 'en']}</td>
                <td>{periodLabel(r.period, ar)}</td>
                <td dir="ltr" className={`text-end ${r.overdue ? 'font-semibold text-crescent' : ''}`}>{r.due}{!['submitted', 'approved', 'released'].includes(r.status) && (r.overdue ? ` (${ar ? 'متأخر' : 'late'})` : r.daysLeft <= 7 ? ` (${r.daysLeft}d)` : '')}</td>
                <td><Status s={r.status} /></td>
              </tr>
            ))}
            {!list.loading && list.data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{ar ? 'لا تقارير. فعّل جدول التقارير من خطة المشروع.' : 'No reports. Turn on the reporting calendar in the project plan.'}</td></tr>}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

export function ProjectReport() {
  const { id = '' } = useParams()
  const ar = useLang() === 'ar'
  const { can, user } = usePerm()
  const users = useStore((s) => s.users)
  const doIt = useDo()
  const rep = useLoad(() => backend.report(id), [id], null as ReportDetail | null)
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [ask, setAsk] = useState<null | 'return' | 'reopen'>(null)
  const [note, setNote] = useState('')
  const r = rep.data
  if (!r) return <p className="p-6 text-muted">{rep.loading ? '…' : ar ? 'التقرير غير موجود' : 'Report not found'}</p>
  const content = draft ?? r.content
  const editable = ['open', 'draft', 'returned'].includes(r.status)
  const mayPrepare = editable && (r.ownerIds.length ? r.ownerIds.includes(user.id) : can('reports', 'edit'))
  const mayReview = can('reports', 'manage')
  const apply = async (fn: () => Promise<ReportDetail>, ok: { ar: string; en: string }) => {
    let out: ReportDetail | null = null
    if (await doIt(async () => { out = await fn() }, ok)) { setDraft(null); await rep.reload(); void out }
  }
  const save = () => apply(() => backend.saveReport(id, content), { ar: 'حُفظت المسودة', en: 'Draft saved' })
  const submit = async () => { if (draft && !(await doIt(() => backend.saveReport(id, content)))) return; await apply(() => backend.submitReport(id), { ar: 'أُرسل إلى PMO', en: 'Sent to PMO' }) }
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.name[ar ? 'ar' : 'en'] ?? '—'
  return (
    <div>
      <PageHeader
        title={`${TYPE_LABEL[r.type][ar ? 'ar' : 'en']} — ${periodLabel(r.period, ar)}`}
        sub={<><Link to={`/programme/setup?p=${r.projectId}`} className="text-nile hover:underline">{r.projectCode} — {ar ? r.projectNameAr : r.projectNameEn}</Link> · <Status s={r.status} /> · {ar ? 'الموعد' : 'Due'} <span dir="ltr">{r.due}</span> · {ar ? 'المعدّ: ' : 'Prepared by: '}{r.ownerIds.map(name).join('، ') || (ar ? 'غير معيّن' : 'unassigned')}</>}
        actions={<>
          {mayPrepare && <Button variant="quiet" onClick={() => void save()}>{ar ? 'حفظ مسودة' : 'Save draft'}</Button>}
          {mayPrepare && <Button onClick={() => void submit()}>{ar ? 'إرسال للمراجعة' : 'Submit for review'}</Button>}
          {mayReview && r.status === 'submitted' && <Button variant="quiet" onClick={() => setAsk('return')}>{ar ? 'إعادة للتعديل' : 'Return'}</Button>}
          {mayReview && r.status === 'submitted' && <Button onClick={() => void apply(() => backend.reviewReport(id, 'approve'), { ar: 'اعتُمد التقرير', en: 'Approved' })}>{ar ? 'اعتماد' : 'Approve'}</Button>}
          {mayReview && r.status === 'approved' && <Button onClick={() => void apply(() => backend.releaseReport(id), { ar: 'أُفرج عنه للمانح', en: 'Released to the donor' })}>{ar ? 'إفراج للمانح' : 'Release to donor'}</Button>}
          {mayReview && (r.status === 'approved' || r.status === 'released') && <Button variant="quiet" onClick={() => setAsk('reopen')}>{ar ? 'إعادة فتح' : 'Reopen'}</Button>}
        </>}
      />
      {r.status === 'returned' && r.reviewNote && <p className="mb-4 rounded-md bg-crescent-soft px-4 py-2.5 text-[14px] text-crescent">{ar ? 'أعاده PMO: ' : 'Returned by PMO: '}{r.reviewNote}</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Panel className="p-5"><ReportBody r={r} content={content as Record<string, never>} setContent={(c) => setDraft(c)} readOnly={!mayPrepare} /></Panel>
        <Panel title={ar ? 'السجل' : 'History'}>
          <ul className="space-y-2 p-4 text-[13.5px]">
            {(r.events ?? []).map((e, i) => (<li key={i}><b>{e.action}</b> — {name(e.userId)} <span className="text-muted" dir="ltr">{e.at.slice(0, 16).replace('T', ' ')}</span>{e.note && <div className="text-muted">{e.note}</div>}</li>))}
            {!(r.events ?? []).length && <li className="text-muted">—</li>}
          </ul>
        </Panel>
      </div>
      <Modal open={!!ask} onClose={() => setAsk(null)} title={ask === 'return' ? (ar ? 'إعادة التقرير للتعديل' : 'Return for changes') : (ar ? 'إعادة فتح التقرير' : 'Reopen report')}>
        <Field label={ar ? 'السبب (مطلوب)' : 'Reason (required)'}><textarea rows={3} className={inputCls + ' h-auto py-2'} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="mt-4 flex justify-end"><Button disabled={!note.trim()} onClick={() => { const k = ask; setAsk(null); const n = note; setNote(''); void apply(() => (k === 'return' ? backend.reviewReport(id, 'return', n) : backend.reopenReport(id, n)), { ar: 'تم', en: 'Done' }) }}>{ar ? 'تأكيد' : 'Confirm'}</Button></div>
      </Modal>
    </div>
  )
}
