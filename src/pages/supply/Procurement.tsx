import { Plus, Printer, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { errorText } from '../../api/live'
import { useProcurement, type Case, type CaseData, type CaseStatus, type PrLine } from '../../api/procurement'
import { AwardForm, GrnForm, PoForm, PrForm, RfqForm, type Org } from '../../components/forms/Forms'
import { usePrint } from '../../components/forms/print'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

const STATUS: Record<CaseStatus, { ar: string; en: string; cls: string }> = {
  draft: { ar: 'طلب شراء', en: 'Requisition', cls: 'bg-sand text-ink' },
  rfq: { ar: 'طلب عروض', en: 'Price request', cls: 'bg-amber-100 text-amber-900' },
  evaluated: { ar: 'تم التقييم', en: 'Evaluated', cls: 'bg-sky-100 text-sky-900' },
  ordered: { ar: 'أمر شراء', en: 'Ordered', cls: 'bg-indigo-100 text-indigo-900' },
  received: { ar: 'تم الاستلام', en: 'Received', cls: 'bg-leaf/15 text-leaf' },
  cancelled: { ar: 'ملغى', en: 'Cancelled', cls: 'bg-crescent-soft text-crescent' },
}
const n0 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const blankLine = (): PrLine => ({ item: '', unit: '', spec: '', qty: 1, unitCost: 0, freq: 1 })
const blank = (requestedBy: string): CaseData => ({ pr: { department: '', unit: '', reason: '', method: 'competitive', requiredDate: null, deliveryPlace: '', deliveryTerms: '', requestedBy, lines: [blankLine()] } })

export function Procurement() {
  const ar = useLang() === 'ar'
  const s = useStore()
  const { can, user, scopeOffice } = usePerm()
  const office = scopeOffice ?? user.officeId ?? s.offices[0]?.id ?? 'hq'
  const { cases, loading, save, cancel } = useProcurement(office)
  const [editing, setEditing] = useState<Case | 'new' | null>(null)
  return (
    <div>
      <PageHeader
        title={ar ? 'المشتريات' : 'Procurement'}
        sub={ar ? 'دورة الشراء كاملة في ملف واحد: طلب شراء ← طلب عروض أسعار ← مقارنة العروض والترسية ← أمر شراء ← استلام مخازن، وكل نموذج يُطبع بقالب المقر.' : 'The whole purchase cycle in one file: requisition → price request → bid comparison and award → purchase order → stores receipt. Every form prints in the head-office template.'}
        actions={
          can('supply', 'edit') && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={16} /> {ar ? 'ملف شراء جديد' : 'New purchase file'}
            </Button>
          )
        }
      />
      <Panel className="p-5">
        {loading ? (
          <p className="text-muted">…</p>
        ) : cases.length === 0 ? (
          <p className="text-muted">{ar ? 'لا توجد ملفات شراء بعد.' : 'No purchase files yet.'}</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="text-start text-[12.5px] text-muted">
              <tr>
                <th className="py-2 text-start">{ar ? 'الرقم' : 'No.'}</th>
                <th className="text-start">{ar ? 'سبب الشراء' : 'Reason'}</th>
                <th className="text-start">{ar ? 'المورد' : 'Vendor'}</th>
                <th className="text-end">{ar ? 'الإجمالي (ج.س)' : 'Total (SDG)'}</th>
                <th className="text-start ps-4">{ar ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t border-line hover:bg-sand/50" onClick={() => setEditing(c)}>
                  <td className="num py-2 font-medium">{c.no}</td>
                  <td>{c.data.pr.reason || c.data.pr.lines[0]?.item}</td>
                  <td>{c.data.po?.vendor.name ?? c.data.award?.vendor ?? '—'}</td>
                  <td className="num text-end">{n0(c.totalSdg)}</td>
                  <td className="ps-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] ${STATUS[c.status].cls}`}>{STATUS[c.status][ar ? 'ar' : 'en']}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {editing && (
        <CaseEditor
          key={editing === 'new' ? 'new' : editing.id}
          existing={editing === 'new' ? null : editing}
          readOnly={!can('supply', 'edit')}
          requestedBy={user.name[ar ? 'ar' : 'en']}
          onClose={() => setEditing(null)}
          save={save}
          cancel={cancel}
        />
      )}
    </div>
  )
}

type Tab = 'pr' | 'rfq' | 'bids' | 'po' | 'grn'

function CaseEditor({ existing, readOnly, requestedBy, onClose, save, cancel }: { existing: Case | null; readOnly: boolean; requestedBy: string; onClose: () => void; save: (id: string | null, d: CaseData, l: { projectId: string | null; lineId: string | null }) => Promise<Case>; cancel: (id: string) => Promise<void> }) {
  const ar = useLang() === 'ar'
  const s = useStore()
  const toast = s.toast
  const { print, host } = usePrint()
  const [id, setId] = useState(existing?.id ?? null)
  const [no, setNo] = useState(existing?.no ?? '')
  const [status, setStatus] = useState<CaseStatus>(existing?.status ?? 'draft')
  const [d, setD] = useState<CaseData>(existing?.data ?? blank(requestedBy))
  const [projectId, setProjectId] = useState(existing?.projectId ?? '')
  const [lineId, setLineId] = useState(existing?.lineId ?? '')
  const [tab, setTab] = useState<Tab>('pr')
  const [busy, setBusy] = useState(false)
  const locked = readOnly || status === 'received' || status === 'cancelled'
  const project = s.projects.find((p) => p.id === projectId)
  const lines = d.pr.lines
  const org: Org = { nameAr: s.org.name.ar, nameEn: s.org.name.en, hqAr: s.org.hqName.ar, logo: s.org.logo || undefined }
  const forms = existing?.forms ?? { pr: no || 'PC-…', rfq: 'RFQ-…', po: 'PO-…', grn: 'GRN-…' }
  const set = (patch: Partial<CaseData>) => setD((x) => ({ ...x, ...patch }))
  const setPr = (patch: Partial<CaseData['pr']>) => setD((x) => ({ ...x, pr: { ...x.pr, ...patch } }))
  const setLine = (i: number, patch: Partial<PrLine>) => setPr({ lines: lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const total = useMemo(() => lines.reduce((t, l) => t + l.qty * l.unitCost * l.freq, 0), [lines])
  const bids = d.bids ?? []
  const winner = bids.find((b) => b.vendor === d.award?.vendor)
  /** Lines at the awarded vendor's prices (the purchase order and receipt use what was agreed, not the estimate). */
  const poLines: PrLine[] = lines.map((l, i) => ({ ...l, unitCost: winner?.unitPrices[i] ?? l.unitCost, freq: 1 }))
  const code = project?.code ?? ''

  const commit = async () => {
    setBusy(true)
    try {
      // Keep each stage consistent with the item list before saving.
      const n = lines.length
      const fixed: CaseData = { ...d }
      if (fixed.bids) fixed.bids = fixed.bids.map((b) => ({ ...b, unitPrices: Array.from({ length: n }, (_, i) => b.unitPrices[i] ?? 0) }))
      if (fixed.receipt) fixed.receipt = { ...fixed.receipt, lines: Array.from({ length: n }, (_, i) => fixed.receipt!.lines[i] ?? { received: 0 }) }
      const r = await save(id, fixed, { projectId: projectId || null, lineId: lineId || null })
      setId(r.id)
      setNo(r.no)
      setStatus(r.status)
      setD(r.data)
      toast({ ar: `حُفظ الملف ${r.no}`, en: `File ${r.no} saved` }, 'ok')
      return true
    } catch (e) {
      toast(errorText(e), 'bad')
      return false
    } finally {
      setBusy(false)
    }
  }

  const tabs: { k: Tab; ar: string; en: string }[] = [
    { k: 'pr', ar: '١ طلب الشراء', en: '1 Requisition' },
    { k: 'rfq', ar: '٢ طلب العروض', en: '2 Price request' },
    { k: 'bids', ar: '٣ العروض والترسية', en: '3 Bids & award' },
    { k: 'po', ar: '٤ أمر الشراء', en: '4 Purchase order' },
    { k: 'grn', ar: '٥ استلام المخازن', en: '5 Receipt' },
  ]
  const vendors = d.rfq?.vendors ?? []
  const num = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <Modal open onClose={onClose} title={`${ar ? 'ملف شراء' : 'Purchase file'} ${no || (ar ? 'جديد' : 'new')}`} wide>
      {host}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5 border-b border-line pb-2">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-md px-3 py-1.5 text-[13.5px] ${tab === t.k ? 'bg-nile text-white' : 'bg-sand hover:bg-line'}`}>
              {ar ? t.ar : t.en}
            </button>
          ))}
          <span className="ms-auto self-center text-[12.5px] text-muted">{STATUS[status][ar ? 'ar' : 'en']}</span>
        </div>

        {tab === 'pr' && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={ar ? 'المشروع' : 'Project'}>
                <select className={inputCls} disabled={locked} value={projectId} onChange={(e) => (setProjectId(e.target.value), setLineId(''))}>
                  <option value="">—</option>
                  {s.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name[ar ? 'ar' : 'en']}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={ar ? 'بند الميزانية' : 'Budget line'}>
                <select className={inputCls} disabled={locked || !project} value={lineId} onChange={(e) => setLineId(e.target.value)}>
                  <option value="">—</option>
                  {project?.pillars.flatMap((p) => p.lines).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} {l.name[ar ? 'ar' : 'en']}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={ar ? 'طريقة الشراء' : 'Purchase method'}>
                <select className={inputCls} disabled={locked} value={d.pr.method} onChange={(e) => setPr({ method: e.target.value as CaseData['pr']['method'] })}>
                  <option value="competitive">{ar ? 'تنافسي' : 'Competitive'}</option>
                  <option value="single">{ar ? 'وحيد مصدر' : 'Single source'}</option>
                  <option value="ip">{ar ? 'ملكية فكرية' : 'Intellectual property'}</option>
                </select>
              </Field>
              <Field label={ar ? 'القسم / الوحدة / المشروع' : 'Department / unit / project'}>
                <input className={inputCls} disabled={locked} value={d.pr.unit} onChange={(e) => setPr({ unit: e.target.value })} />
              </Field>
              <Field label={ar ? 'الإدارة' : 'Administration'}>
                <input className={inputCls} disabled={locked} value={d.pr.department} onChange={(e) => setPr({ department: e.target.value })} />
              </Field>
              <Field label={ar ? 'مقدّم الطلب' : 'Requested by'}>
                <input className={inputCls} disabled={locked} value={d.pr.requestedBy} onChange={(e) => setPr({ requestedBy: e.target.value })} />
              </Field>
              <Field label={ar ? 'أسباب الشراء' : 'Reason for purchase'}>
                <input className={inputCls} disabled={locked} value={d.pr.reason} onChange={(e) => setPr({ reason: e.target.value })} />
              </Field>
              <Field label={ar ? 'تاريخ التسليم المطلوب' : 'Required delivery date'}>
                <input type="date" className={inputCls} disabled={locked} value={d.pr.requiredDate ?? ''} onChange={(e) => setPr({ requiredDate: e.target.value || null })} />
              </Field>
              <Field label={ar ? 'مكان التسليم' : 'Delivery place'}>
                <input className={inputCls} disabled={locked} value={d.pr.deliveryPlace} onChange={(e) => setPr({ deliveryPlace: e.target.value })} />
              </Field>
              <Field label={ar ? 'شروط التسليم' : 'Delivery terms'}>
                <input className={inputCls} disabled={locked} value={d.pr.deliveryTerms} onChange={(e) => setPr({ deliveryTerms: e.target.value })} />
              </Field>
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-[1.4fr_70px_1.4fr_70px_110px_60px_28px] gap-2 text-[12px] text-muted">
                <span>{ar ? 'الصنف' : 'Item'}</span>
                <span>{ar ? 'الوحدة' : 'Unit'}</span>
                <span>{ar ? 'الوصف' : 'Specification'}</span>
                <span>{ar ? 'الكمية' : 'Qty'}</span>
                <span>{ar ? 'تكلفة الوحدة' : 'Unit cost'}</span>
                <span>{ar ? 'مرات' : 'Freq.'}</span>
                <span />
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_70px_1.4fr_70px_110px_60px_28px] items-center gap-2">
                  <input className={inputCls} disabled={locked} value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} />
                  <input className={inputCls} disabled={locked} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                  <input className={inputCls} disabled={locked} value={l.spec} onChange={(e) => setLine(i, { spec: e.target.value })} />
                  <input type="number" min={0} className={inputCls} disabled={locked} value={l.qty} onChange={(e) => setLine(i, { qty: num(e.target.value) })} />
                  <input type="number" min={0} className={inputCls} disabled={locked} value={l.unitCost} onChange={(e) => setLine(i, { unitCost: num(e.target.value) })} />
                  <input type="number" min={1} className={inputCls} disabled={locked} value={l.freq} onChange={(e) => setLine(i, { freq: num(e.target.value) || 1 })} />
                  {!locked && lines.length > 1 && (
                    <button className="text-muted hover:text-crescent" aria-label={ar ? 'حذف' : 'Remove'} onClick={() => setPr({ lines: lines.filter((_, j) => j !== i) })}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                {!locked && (
                  <Button variant="quiet" onClick={() => setPr({ lines: [...lines, blankLine()] })}>
                    <Plus size={15} /> {ar ? 'صنف' : 'Item'}
                  </Button>
                )}
                <span className="num text-[14px]">
                  {ar ? 'الإجمالي' : 'Total'}: <b>{n0(total)}</b> SDG
                </span>
              </div>
            </div>
            <Button variant="quiet" onClick={() => print(<PrForm org={org} no={forms.pr} projectCode={code} unit={d.pr.unit} dept={d.pr.department} reason={d.pr.reason} method={d.pr.method} requiredDate={d.pr.requiredDate} deliveryPlace={d.pr.deliveryPlace} deliveryTerms={d.pr.deliveryTerms} lines={lines} />)}>
              <Printer size={15} /> {ar ? 'طباعة طلب الشراء' : 'Print requisition'}
            </Button>
          </div>
        )}

        {tab === 'rfq' && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={ar ? 'تاريخ إصدار الطلب' : 'Issue date'}>
                <input type="date" className={inputCls} disabled={locked} value={d.rfq?.issueDate ?? ''} onChange={(e) => set({ rfq: { vendors: [], ...d.rfq, issueDate: e.target.value || null } })} />
              </Field>
              <Field label={ar ? 'تاريخ إغلاق المناقصة' : 'Closing date'}>
                <input type="date" className={inputCls} disabled={locked} value={d.rfq?.closeDate ?? ''} onChange={(e) => set({ rfq: { vendors: [], ...d.rfq, closeDate: e.target.value || null } })} />
              </Field>
            </div>
            <h3 className="text-[14.5px] font-semibold">{ar ? 'الموردون المدعوون' : 'Invited vendors'}</h3>
            {vendors.map((v, i) => (
              <div key={i} className="grid grid-cols-[1.5fr_1.2fr_1fr_auto_28px] items-center gap-2">
                <input className={inputCls} disabled={locked} placeholder={ar ? 'اسم المورد' : 'Vendor name'} value={v.name} onChange={(e) => set({ rfq: { ...d.rfq!, vendors: vendors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) } })} />
                <input className={inputCls} disabled={locked} placeholder="E-mail" value={v.email} onChange={(e) => set({ rfq: { ...d.rfq!, vendors: vendors.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) } })} />
                <input className={inputCls} disabled={locked} placeholder={ar ? 'الهاتف' : 'Phone'} value={v.phone} onChange={(e) => set({ rfq: { ...d.rfq!, vendors: vendors.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)) } })} />
                <Button variant="quiet" disabled={!v.name} onClick={() => print(<RfqForm org={org} no={forms.rfq} vendor={v} issueDate={d.rfq?.issueDate} closeDate={d.rfq?.closeDate} lines={lines} />)}>
                  <Printer size={15} />
                </Button>
                {!locked && (
                  <button className="text-muted hover:text-crescent" aria-label={ar ? 'حذف' : 'Remove'} onClick={() => set({ rfq: { ...d.rfq!, vendors: vendors.filter((_, j) => j !== i) } })}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {!locked && vendors.length < 10 && (
              <Button variant="quiet" onClick={() => set({ rfq: { ...d.rfq, vendors: [...vendors, { name: '', email: '', phone: '' }] } })}>
                <Plus size={15} /> {ar ? 'مورد' : 'Vendor'}
              </Button>
            )}
          </div>
        )}

        {tab === 'bids' && (
          <div className="space-y-3">
            {bids.length === 0 && <p className="text-[13.5px] text-muted">{ar ? 'أضف العروض الواردة من الموردين.' : 'Add the quotations received from vendors.'}</p>}
            {bids.map((b, bi) => (
              <div key={bi} className="rounded-lg border border-line p-3">
                <div className="mb-2 grid gap-2 md:grid-cols-[1.5fr_120px_auto_1.5fr_28px]">
                  <input className={inputCls} disabled={locked} list="vendors" placeholder={ar ? 'المورد' : 'Vendor'} value={b.vendor} onChange={(e) => set({ bids: bids.map((x, j) => (j === bi ? { ...x, vendor: e.target.value } : x)) })} />
                  <input type="number" min={0} className={inputCls} disabled={locked} placeholder={ar ? 'أيام التسليم' : 'Delivery days'} value={b.deliveryDays ?? ''} onChange={(e) => set({ bids: bids.map((x, j) => (j === bi ? { ...x, deliveryDays: e.target.value === '' ? null : Number(e.target.value) } : x)) })} />
                  <label className="flex items-center gap-1.5 text-[13.5px]">
                    <input type="checkbox" disabled={locked} checked={b.accepted} onChange={(e) => set({ bids: bids.map((x, j) => (j === bi ? { ...x, accepted: e.target.checked } : x)) })} /> {ar ? 'مقبول تقنياً' : 'Technically OK'}
                  </label>
                  <input className={inputCls} disabled={locked} placeholder={ar ? 'ملاحظة' : 'Note'} value={b.note} onChange={(e) => set({ bids: bids.map((x, j) => (j === bi ? { ...x, note: e.target.value } : x)) })} />
                  {!locked && (
                    <button className="text-muted hover:text-crescent" aria-label={ar ? 'حذف' : 'Remove'} onClick={() => set({ bids: bids.filter((_, j) => j !== bi) })}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="grid gap-1.5 md:grid-cols-2">
                  {lines.map((l, i) => (
                    <label key={i} className="flex items-center gap-2 text-[13px]">
                      <span className="w-40 truncate text-muted">{l.item || i + 1}</span>
                      <input type="number" min={0} className={inputCls} disabled={locked} value={b.unitPrices[i] ?? ''} onChange={(e) => set({ bids: bids.map((x, j) => (j === bi ? { ...x, unitPrices: Array.from({ length: lines.length }, (_, k) => (k === i ? num(e.target.value) : x.unitPrices[k] ?? 0)) } : x)) })} />
                    </label>
                  ))}
                </div>
                <div className="num mt-1 text-[13px] text-muted">
                  {ar ? 'إجمالي العرض' : 'Bid total'}: <b className="text-ink">{n0(lines.reduce((t, l, i) => t + (b.unitPrices[i] ?? 0) * l.qty * l.freq, 0))}</b>
                </div>
              </div>
            ))}
            <datalist id="vendors">
              {vendors.map((v) => (
                <option key={v.name} value={v.name} />
              ))}
            </datalist>
            {!locked && bids.length < 10 && (
              <Button variant="quiet" onClick={() => set({ bids: [...bids, { vendor: '', unitPrices: lines.map(() => 0), deliveryDays: null, accepted: true, note: '' }] })}>
                <Plus size={15} /> {ar ? 'عرض' : 'Bid'}
              </Button>
            )}
            {bids.length > 0 && (
              <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <Field label={ar ? 'الترسية على' : 'Award to'}>
                  <select className={inputCls} disabled={locked} value={d.award?.vendor ?? ''} onChange={(e) => set({ award: e.target.value ? { reason: '', ...d.award, vendor: e.target.value } : undefined })}>
                    <option value="">—</option>
                    {bids.filter((b) => b.vendor).map((b) => (
                      <option key={b.vendor} value={b.vendor}>
                        {b.vendor}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={ar ? 'سبب الترسية' : 'Reason for award'}>
                  <input className={inputCls} disabled={locked || !d.award} value={d.award?.reason ?? ''} onChange={(e) => set({ award: { ...d.award!, reason: e.target.value } })} />
                </Field>
              </div>
            )}
            {bids.length > 0 && (
              <Button variant="quiet" onClick={() => print(<AwardForm org={org} no={forms.pr} rfqNo={forms.rfq} issueDate={d.rfq?.issueDate} closeDate={d.rfq?.closeDate} dept={d.pr.department} lines={lines} bids={bids} award={d.award} />)}>
                <Printer size={15} /> {ar ? 'طباعة ملخص التقييم والترسية' : 'Print evaluation & award summary'}
              </Button>
            )}
          </div>
        )}

        {tab === 'po' && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={ar ? 'تاريخ أمر الشراء' : 'PO date'}>
                <input type="date" className={inputCls} disabled={locked} value={d.po?.date ?? ''} onChange={(e) => set({ po: { vendor: { name: d.award?.vendor ?? '', place: '', phone: '' }, shipTo: '', ...d.po, date: e.target.value || null } })} />
              </Field>
              <Field label={ar ? 'المورد' : 'Vendor'}>
                <input className={inputCls} disabled={locked} value={d.po?.vendor.name ?? d.award?.vendor ?? ''} onChange={(e) => set({ po: { shipTo: '', ...d.po, vendor: { place: '', phone: '', ...d.po?.vendor, name: e.target.value } } })} />
              </Field>
              <Field label={ar ? 'عنوان المورد' : 'Vendor place'}>
                <input className={inputCls} disabled={locked} value={d.po?.vendor.place ?? ''} onChange={(e) => set({ po: { shipTo: '', ...d.po, vendor: { name: d.award?.vendor ?? '', phone: '', ...d.po?.vendor, place: e.target.value } } })} />
              </Field>
              <Field label={ar ? 'هاتف المورد' : 'Vendor phone'}>
                <input className={inputCls} disabled={locked} value={d.po?.vendor.phone ?? ''} onChange={(e) => set({ po: { shipTo: '', ...d.po, vendor: { name: d.award?.vendor ?? '', place: '', ...d.po?.vendor, phone: e.target.value } } })} />
              </Field>
              <Field label={ar ? 'التسليم إلى' : 'Ship to'}>
                <input className={inputCls} disabled={locked} value={d.po?.shipTo ?? ''} onChange={(e) => set({ po: { vendor: { name: d.award?.vendor ?? '', place: '', phone: '' }, ...d.po, shipTo: e.target.value } })} />
              </Field>
            </div>
            <p className="num text-[13.5px] text-muted">
              {ar ? 'إجمالي أمر الشراء بأسعار العرض الراسي' : 'PO total at the awarded prices'}: <b className="text-ink">{n0(poLines.reduce((t, l) => t + l.qty * l.unitCost, 0))}</b> SDG
            </p>
            <Button variant="quiet" disabled={!d.po} onClick={() => print(<PoForm org={org} no={forms.po} date={d.po?.date} projectCode={code} vendor={d.po!.vendor} shipTo={d.po!.shipTo} lines={poLines} />)}>
              <Printer size={15} /> {ar ? 'طباعة أمر الشراء' : 'Print purchase order'}
            </Button>
          </div>
        )}

        {tab === 'grn' && (
          <div className="space-y-3">
            {!d.po && <p className="text-[13.5px] text-muted">{ar ? 'أصدر أمر الشراء أولاً.' : 'Issue the purchase order first.'}</p>}
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={ar ? 'تاريخ الاستلام' : 'Receipt date'}>
                <input type="date" className={inputCls} disabled={locked || !d.po} value={d.receipt?.date ?? ''} onChange={(e) => set({ receipt: { store: '', notes: '', lines: lines.map(() => ({ received: 0 })), ...d.receipt, date: e.target.value || null } })} />
              </Field>
              <Field label={ar ? 'المخزن' : 'Store'}>
                <input className={inputCls} disabled={locked || !d.po} value={d.receipt?.store ?? ''} onChange={(e) => set({ receipt: { notes: '', lines: lines.map(() => ({ received: 0 })), ...d.receipt, store: e.target.value } })} />
              </Field>
              <Field label={ar ? 'ملاحظات' : 'Notes'}>
                <input className={inputCls} disabled={locked || !d.po} value={d.receipt?.notes ?? ''} onChange={(e) => set({ receipt: { store: '', lines: lines.map(() => ({ received: 0 })), ...d.receipt, notes: e.target.value } })} />
              </Field>
            </div>
            <div className="space-y-1.5">
              {poLines.map((l, i) => (
                <label key={i} className="flex items-center gap-2 text-[13.5px]">
                  <span className="w-56 truncate">{l.item}</span>
                  <span className="num w-24 text-muted">
                    {ar ? 'المطلوب' : 'Ordered'} {n0(l.qty)}
                  </span>
                  <input
                    type="number"
                    min={0}
                    className={`${inputCls} max-w-[140px]`}
                    disabled={locked || !d.po}
                    value={d.receipt?.lines[i]?.received ?? ''}
                    placeholder={ar ? 'المستلم' : 'Received'}
                    onChange={(e) => set({ receipt: { store: '', notes: '', date: null, ...d.receipt, lines: Array.from({ length: lines.length }, (_, k) => (k === i ? { received: num(e.target.value) } : d.receipt?.lines[k] ?? { received: 0 })) } })}
                  />
                </label>
              ))}
            </div>
            <Button variant="quiet" disabled={!d.receipt} onClick={() => print(<GrnForm org={org} no={forms.grn} date={d.receipt?.date} store={d.receipt?.store ?? ''} poNo={forms.po} supplier={d.po?.vendor.name ?? ''} lines={poLines} received={(d.receipt?.lines ?? []).map((x) => x.received)} notes={d.receipt?.notes} />)}>
              <Printer size={15} /> {ar ? 'طباعة إذن الاستلام' : 'Print store receipt'}
            </Button>
          </div>
        )}

        <div className="flex justify-between gap-2 border-t border-line pt-3">
          <div>
            {id && !locked && (
              <Button
                variant="danger"
                onClick={async () => {
                  await cancel(id)
                  onClose()
                }}
              >
                {ar ? 'إلغاء الملف' : 'Cancel file'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="quiet" onClick={onClose}>
              {ar ? 'إغلاق' : 'Close'}
            </Button>
            {!locked && (
              <Button disabled={busy || !lines.every((l) => l.item.trim() && l.qty > 0)} onClick={commit}>
                {busy ? '…' : ar ? 'حفظ' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
