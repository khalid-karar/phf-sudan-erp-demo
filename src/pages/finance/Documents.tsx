import { Printer } from 'lucide-react'
import { useState } from 'react'
import { CompletionCertificate, CustodyLetter, PaymentRequestForm, type Org } from '../../components/forms/Forms'
import { usePrint } from '../../components/forms/print'
import { Button, Field, inputCls, PageHeader, Panel } from '../../components/ui'
import { findLine } from '../../lib/budget'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'

type Kind = 'payment' | 'certificate' | 'letter'
const today = () => new Date().toISOString().slice(0, 10)

/** Payment documents in the head-office layout, pre-filled from an approved spend request: payment request, completion certificate, custody letter. */
export function Documents() {
  const ar = useLang() === 'ar'
  const s = useStore()
  const { print, host } = usePrint()
  const [kind, setKind] = useState<Kind>('payment')
  const [reqId, setReqId] = useState('')
  const [f, setF] = useState({ date: today(), amount: '', what: '', chargedTo: '', party: '', requester: '', department: '', to: '', subject: ar ? 'عهدة مالية' : 'Financial custody', signer: '', signerTitle: ar ? 'المدير المالي' : 'Finance Manager' })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const org: Org = { nameAr: s.org.name.ar, nameEn: s.org.name.en, hqAr: s.org.hqName.ar, logo: s.org.logo || undefined }
  const eligible = s.requests.filter((r) => r.status === 'approved' || r.status === 'paid')

  const prefill = (id: string) => {
    setReqId(id)
    const r = s.requests.find((x) => x.id === id)
    if (!r) return
    const hit = findLine(s.projects, r.lineId)
    const requester = s.users.find((u) => u.id === r.requesterId)
    const sdg = r.currency === 'SDG' ? r.amount : r.amountUSD * r.rate
    setF((x) => ({
      ...x,
      amount: String(Math.round(sdg)),
      what: r.purpose[ar ? 'ar' : 'en'],
      chargedTo: hit ? `${hit.project.name[ar ? 'ar' : 'en']} — ${hit.line.name[ar ? 'ar' : 'en']}` : '',
      requester: requester?.name[ar ? 'ar' : 'en'] ?? '',
      department: s.offices.find((o) => o.id === r.officeId)?.name[ar ? 'ar' : 'en'] ?? '',
    }))
  }
  const amount = Number(f.amount) || 0
  const office = s.offices.find((o) => o.id === s.users.find((u) => u.id === s.userId)?.officeId)?.name.ar ?? s.org.hqName.ar

  const doPrint = () => {
    if (kind === 'payment') print(<PaymentRequestForm org={org} date={f.date} amount={amount} purpose={f.what} items={[{ text: f.what, amount }]} beneficiary={f.party} requester={f.requester} projectLabel={f.chargedTo} />)
    else if (kind === 'certificate') print(<CompletionCertificate org={org} office={office} date={f.date} department={f.department} contractor={f.party} amount={amount} what={f.what} chargedTo={f.chargedTo} signer={f.signer} signerTitle={f.signerTitle} />)
    else print(<CustodyLetter org={org} office={office} date={f.date} to={f.to} subject={f.subject} amount={amount} what={f.what} chargedTo={f.chargedTo} signer={f.signer} signerTitle={f.signerTitle} />)
  }

  return (
    <div>
      {host}
      <PageHeader
        title={ar ? 'مستندات الدفع' : 'Payment documents'}
        sub={ar ? 'الطلب المالي وشهادة الإنجاز وخطاب العهدة بقالب المقر، تُملأ من طلب الصرف المعتمد ثم تُطبع (أو تُحفظ PDF).' : 'The payment request, completion certificate and custody letter in the head-office layout, filled from an approved spend request, then printed (or saved as PDF).'}
      />
      <Panel>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={ar ? 'المستند' : 'Document'}>
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="payment">{ar ? 'طلب مالي' : 'Payment request'}</option>
              <option value="certificate">{ar ? 'شهادة إنجاز' : 'Completion certificate'}</option>
              <option value="letter">{ar ? 'خطاب (عهدة / صرف)' : 'Letter (custody / payment)'}</option>
            </select>
          </Field>
          <Field label={ar ? 'تعبئة من طلب صرف' : 'Fill from a spend request'} hint={ar ? 'الطلبات المعتمدة أو المدفوعة' : 'Approved or paid requests'}>
            <select className={inputCls} value={reqId} onChange={(e) => prefill(e.target.value)}>
              <option value="">—</option>
              {eligible.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.purpose[ar ? 'ar' : 'en'].slice(0, 50)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'التاريخ' : 'Date'}>
            <input type="date" className={inputCls} value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label={ar ? 'المبلغ (جنيه سوداني)' : 'Amount (SDG)'}>
            <input type="number" min={0} className={inputCls} value={f.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <Field label={ar ? 'عبارة عن / البيان' : 'For / description'}>
            <input className={inputCls} value={f.what} onChange={(e) => set('what', e.target.value)} />
          </Field>
          <Field label={ar ? 'خصماً من (المشروع / البند)' : 'Charged to (project / line)'}>
            <input className={inputCls} value={f.chargedTo} onChange={(e) => set('chargedTo', e.target.value)} />
          </Field>
          {kind !== 'letter' && (
            <Field label={kind === 'payment' ? (ar ? 'الجهة المستفيدة' : 'Beneficiary') : ar ? 'المقاول / المورد' : 'Contractor / supplier'}>
              <input className={inputCls} value={f.party} onChange={(e) => set('party', e.target.value)} />
            </Field>
          )}
          {kind === 'payment' && (
            <Field label={ar ? 'مقدم الطلب' : 'Requested by'}>
              <input className={inputCls} value={f.requester} onChange={(e) => set('requester', e.target.value)} />
            </Field>
          )}
          {kind === 'certificate' && (
            <Field label={ar ? 'القسم' : 'Department'}>
              <input className={inputCls} value={f.department} onChange={(e) => set('department', e.target.value)} />
            </Field>
          )}
          {kind === 'letter' && (
            <>
              <Field label={ar ? 'إلى السيد' : 'To'}>
                <input className={inputCls} value={f.to} onChange={(e) => set('to', e.target.value)} />
              </Field>
              <Field label={ar ? 'الموضوع' : 'Subject'}>
                <input className={inputCls} value={f.subject} onChange={(e) => set('subject', e.target.value)} />
              </Field>
            </>
          )}
          {kind !== 'payment' && (
            <>
              <Field label={ar ? 'اسم الموقّع' : 'Signed by'}>
                <input className={inputCls} value={f.signer} onChange={(e) => set('signer', e.target.value)} />
              </Field>
              <Field label={ar ? 'صفته' : 'Title'}>
                <input className={inputCls} value={f.signerTitle} onChange={(e) => set('signerTitle', e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <div className="mt-4">
          <Button onClick={doPrint} disabled={!amount || !f.what.trim()}>
            <Printer size={16} /> {ar ? 'طباعة / حفظ PDF' : 'Print / save PDF'}
          </Button>
        </div>
      </Panel>
    </div>
  )
}
