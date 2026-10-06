import { X } from 'lucide-react'
import { useState } from 'react'
import { Button, Field, inputCls, PageHeader, Panel } from '../../components/ui'
import type { ReportDelivery, ReportSettings as RS } from '../../data/types'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'

function EmailList({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const parts = draft.split(/[\s,;،]+/).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
    if (parts.length) onChange([...new Set([...value, ...parts])])
    setDraft('')
  }
  return (
    <Field label={label}>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5" dir="ltr">
        {value.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded bg-nile-soft px-2 py-0.5 text-[13px] text-nile">
            {e}
            <button onClick={() => onChange(value.filter((x) => x !== e))} aria-label={`remove ${e}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input className="min-w-40 flex-1 bg-transparent text-[14px] outline-none" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), add())} onBlur={add} placeholder="name@example.org" />
      </div>
    </Field>
  )
}

function Template({ d, onChange, vars }: { d: ReportDelivery; onChange: (d: ReportDelivery) => void; vars: [string, string][] }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const [focus, setFocus] = useState<'subject' | 'body'>('body')
  const insert = (v: string) => onChange({ ...d, [focus]: { ...d[focus], [lang]: d[focus][lang] + `{${v}}` } })
  return (
    <>
      <EmailList label={ar ? 'إلى' : 'To'} value={d.to} onChange={(to) => onChange({ ...d, to })} />
      <EmailList label={ar ? 'نسخة إلى' : 'Cc'} value={d.cc} onChange={(cc) => onChange({ ...d, cc })} />
      <Field label={ar ? 'الموضوع' : 'Subject'}>
        <input className={inputCls} value={d.subject[lang]} onFocus={() => setFocus('subject')} onChange={(e) => onChange({ ...d, subject: { ...d.subject, [lang]: e.target.value } })} />
      </Field>
      <Field label={ar ? 'نص الرسالة' : 'Message'}>
        <textarea className={`${inputCls} h-40 py-2 leading-relaxed`} value={d.body[lang]} onFocus={() => setFocus('body')} onChange={(e) => onChange({ ...d, body: { ...d.body, [lang]: e.target.value } })} />
      </Field>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="text-muted">{ar ? 'إدراج حقل يُملأ تلقائياً:' : 'Insert an auto-filled field:'}</span>
        {vars.map(([k, l]) => (
          <button key={k} onClick={() => insert(k)} className="rounded border border-line bg-surface px-2 py-0.5 hover:border-nile-2">
            {l}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted">{ar ? 'تعدّل النص باللغة الحالية للواجهة؛ بدّل اللغة لتعديل النسخة الأخرى.' : 'You’re editing the text in the current interface language; switch language to edit the other version.'}</p>
    </>
  )
}

export function ReportSettings() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [d, setD] = useState<RS>(structuredClone(s.reportSettings))
  const dirty = JSON.stringify(d) !== JSON.stringify(s.reportSettings)
  const sections: [string, string][] = [
    ['finance', ar ? 'الموقف المالي' : 'Financial position'],
    ['projects', ar ? 'تقدم المشاريع' : 'Project progress'],
    ['activities', ar ? 'الأنشطة والمستفيدون' : 'Activities and beneficiaries'],
    ['compliance', ar ? 'الرقابة والالتزام' : 'Control and compliance'],
    ['supply', ar ? 'التغذية العينية' : 'In-kind supplies'],
    ['hr', ar ? 'الموارد البشرية' : 'Human resources'],
    ['challenges', ar ? 'التحديات والاحتياجات' : 'Challenges and needs'],
    ['plan', ar ? 'خطة الشهر القادم' : 'Next month’s plan'],
  ]
  const hqVars: [string, string][] = [
    ['month', ar ? 'الشهر' : 'Month'],
    ['hq', ar ? 'اسم المقر' : 'HQ name'],
    ['org', ar ? 'اسم المؤسسة' : 'Organization'],
    ['sender', ar ? 'اسم المرسل' : 'Sender'],
  ]
  const donorVars: [string, string][] = [
    ['project', ar ? 'المشروع' : 'Project'],
    ['period', ar ? 'الفترة' : 'Period'],
    ['donor', ar ? 'المانح' : 'Donor'],
    ['org', ar ? 'اسم المؤسسة' : 'Organization'],
    ['sender', ar ? 'اسم المرسل' : 'Sender'],
  ]
  return (
    <div className="pb-20">
      <PageHeader
        title={ar ? 'إعدادات إرسال التقارير' : 'Report delivery settings'}
        sub={ar ? 'لمن يُرسل كل تقرير، وبأي موضوع ونص. يظهر هذا مسبقاً عند الضغط على «إرسال بالبريد»، ويمكن تعديله قبل الإرسال.' : 'Who each report goes to, with which subject and text. This is pre-filled when you press “Send by email”, and can still be edited before sending.'}
      />
      <div className="space-y-6">
        <Panel title={ar ? 'التقرير الشهري للمقر الرئيسي' : 'Monthly report to headquarters'}>
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <Template d={d.hq} onChange={(x) => setD({ ...d, hq: { ...d.hq, ...x } })} vars={hqVars} />
            </div>
            <div className="space-y-4">
              <label className="flex items-start gap-2 rounded-md border border-line p-3 text-[14px]">
                <input type="checkbox" className="mt-1 size-4" checked={d.hq.requireApproval} onChange={(e) => setD({ ...d, hq: { ...d.hq, requireApproval: e.target.checked } })} />
                <span>
                  {ar ? 'يجب اعتماد التقرير قبل إرساله' : 'The report must be approved before sending'}
                  {d.hq.requireApproval && (
                    <select className="mt-2 h-9 w-full rounded-md border border-line bg-surface px-2 text-[13.5px]" value={d.hq.approverRole} onChange={(e) => setD({ ...d, hq: { ...d.hq, approverRole: e.target.value } })}>
                      {s.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name[lang]}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-line p-3 text-[14px]">
                <input type="checkbox" className="mt-1 size-4" checked={d.hq.autoSendDay !== null} onChange={(e) => setD({ ...d, hq: { ...d.hq, autoSendDay: e.target.checked ? 10 : null } })} />
                <span>
                  {ar ? 'إرسال تلقائي بعد الاعتماد' : 'Send automatically once approved'}
                  {d.hq.autoSendDay !== null && (
                    <span className="mt-2 flex items-center gap-2 text-[13px]">
                      {ar ? 'في اليوم' : 'on day'}
                      <input type="number" min={1} max={28} className="num h-9 w-16 rounded-md border border-line px-2" value={d.hq.autoSendDay} onChange={(e) => setD({ ...d, hq: { ...d.hq, autoSendDay: Math.max(1, Math.min(28, +e.target.value)) } })} />
                      {ar ? 'من كل شهر' : 'of each month'}
                    </span>
                  )}
                </span>
              </label>
              <div className="rounded-md border border-line p-3">
                <div className="mb-2 text-[13.5px] font-medium">{ar ? 'أقسام التقرير' : 'Report sections'}</div>
                {sections.map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 py-0.5 text-[13.5px]">
                    <input type="checkbox" className="size-4" checked={d.hq.includeSections[k] !== false} onChange={(e) => setD({ ...d, hq: { ...d.hq, includeSections: { ...d.hq.includeSections, [k]: e.target.checked } } })} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Panel>
        {s.projects.map((p) => {
          const cur = d.donor[p.id] ?? { to: [], cc: [], subject: { ar: 'تقرير المشروع {project} — {period}', en: 'Project report {project} — {period}' }, body: { ar: '', en: '' } }
          return (
            <Panel key={p.id} title={`${ar ? 'تقرير المانح' : 'Donor report'} — ${p.code} (${p.donor[lang]})`}>
              <div className="max-w-3xl space-y-4 p-5">
                <Template d={cur} onChange={(x) => setD({ ...d, donor: { ...d.donor, [p.id]: x } })} vars={donorVars} />
              </div>
            </Panel>
          )
        })}
      </div>
      <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur transition-transform lg:start-[264px] ${dirty ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <span className="text-[13.5px] text-muted">{ar ? 'لديك تغييرات غير محفوظة' : 'You have unsaved changes'}</span>
          <Button variant="quiet" onClick={() => setD(structuredClone(s.reportSettings))}>
            {ar ? 'تراجع' : 'Discard'}
          </Button>
          <Button onClick={() => s.setReportSettings(d)}>{ar ? 'حفظ الإعدادات' : 'Save settings'}</Button>
        </div>
      </div>
    </div>
  )
}
