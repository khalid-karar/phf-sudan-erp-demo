import { AlertTriangle, FileText, Loader2, Mail, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Bi, ReportDelivery } from '../../data/types'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'
import { Button, Field, inputCls, Modal } from '../ui'

export const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m)

function Emails({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const parts = draft.split(/[\s,;،]+/).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
    if (parts.length) onChange([...new Set([...value, ...parts])])
    setDraft('')
  }
  return (
    <Field label={label}>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 focus-within:border-nile-2" dir="ltr">
        {value.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded bg-nile-soft px-2 py-0.5 text-[13px] text-nile">
            {e}
            <button onClick={() => onChange(value.filter((x) => x !== e))} aria-label={`remove ${e}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-40 flex-1 bg-transparent text-[14px] outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), add())}
          onBlur={add}
          placeholder="name@example.org"
        />
      </div>
    </Field>
  )
}

/** Shows the email as it will go out, built from the delivery settings, with the PDF attached. */
export function SendModal({
  title,
  defaults,
  vars,
  makePdf,
  onSent,
  onClose,
}: {
  title: Bi
  defaults: ReportDelivery
  vars: Record<string, string>
  makePdf: () => Promise<{ blob: Blob; sizeKB: number; fileName: string }>
  onSent: (r: { to: string[]; cc: string[]; subject: string; fileName: string; sizeKB: number }) => void
  onClose: () => void
}) {
  const lang = useLang()
  const ar = lang === 'ar'
  const email = useStore((s) => s.channels.email)
  const [to, setTo] = useState(defaults.to)
  const [cc, setCc] = useState(defaults.cc)
  const [subject, setSubject] = useState(fill(defaults.subject[lang], vars))
  const [body, setBody] = useState(fill(defaults.body[lang], vars))
  const [pdf, setPdf] = useState<{ sizeKB: number; fileName: string } | null>(null)
  useEffect(() => {
    let live = true
    makePdf().then((p) => live && setPdf({ sizeKB: p.sizeKB, fileName: p.fileName }))
    return () => {
      live = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = email.enabled && email.lastTest?.ok
  return (
    <Modal open onClose={onClose} title={ar ? `إرسال ${title.ar} بالبريد` : `Email ${title.en}`} wide>
      {!ready && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-amber-soft px-3 py-2 text-[13.5px] text-amber">
          <AlertTriangle size={16} />
          {email.enabled ? (ar ? 'البريد مفعّل لكنه لم يُختبر بنجاح.' : 'Email is on but hasn’t passed a test.') : ar ? 'البريد غير مفعّل، فلن تُرسل الرسالة.' : 'Email is turned off, so this won’t send.'}
          <Link to="/settings/channels" className="font-medium underline">
            {ar ? 'إعداد البريد' : 'Set up email'}
          </Link>
        </p>
      )}
      <div className="space-y-4">
        <Emails label={ar ? 'إلى' : 'To'} value={to} onChange={setTo} />
        <Emails label={ar ? 'نسخة إلى' : 'Cc'} value={cc} onChange={setCc} />
        <Field label={ar ? 'الموضوع' : 'Subject'}>
          <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label={ar ? 'نص الرسالة' : 'Message'}>
          <textarea className={`${inputCls} h-44 py-2 leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
          <FileText size={20} className="text-crescent" />
          {pdf ? (
            <span className="text-[13.5px]">
              <span className="num" dir="ltr">
                {pdf.fileName}
              </span>{' '}
              <span className="num text-muted">({pdf.sizeKB} KB)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-[13.5px] text-muted">
              <Loader2 size={15} className="animate-spin" /> {ar ? 'جارٍ تجهيز ملف PDF…' : 'Preparing the PDF…'}
            </span>
          )}
        </div>
        <p className="text-[12.5px] text-muted">
          {ar ? 'يُرسل من' : 'Sent from'}{' '}
          <span dir="ltr" className="num">
            {email.fromName} &lt;{email.fromAddress}&gt;
          </span>
          {ar ? '. يمكن تغيير المستلمين والنص الافتراضي من ' : '. Default recipients and text can be changed in '}
          <Link to="/settings/reports" className="text-nile underline">
            {ar ? 'إعدادات إرسال التقارير' : 'report delivery settings'}
          </Link>
          .
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!pdf || !to.length || !subject.trim()}
          onClick={() => {
            onSent({ to, cc, subject, fileName: pdf!.fileName, sizeKB: pdf!.sizeKB })
            onClose()
          }}
        >
          <Mail size={16} /> {ar ? 'إرسال' : 'Send'}
        </Button>
      </div>
    </Modal>
  )
}
