// The organisation's purchase-cycle and payment forms, laid out to print on A4 like the head-office templates.
import type { CSSProperties, ReactNode } from 'react'
import { sdgInWordsAr, sdgInWordsEn } from '../../lib/words'

export interface Org {
  nameAr: string
  nameEn: string
  hqAr: string
  logo?: string
}

const n2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n0 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
const cell: CSSProperties = { border: '1px solid #444', padding: '4px 6px', verticalAlign: 'top' }
const head: CSSProperties = { ...cell, background: '#e9eef3', fontWeight: 700, textAlign: 'center' }
const sheet: CSSProperties = { width: '190mm', margin: '0 auto', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11pt', lineHeight: 1.45, color: '#000' }

/** Letterhead used by every form: country / department on one side, organisation / unit on the other, then the title and form number. */
function Sheet({ org, dept, title, titleEn, formNo, children, dir = 'rtl' }: { org: Org; dept: string; title: string; titleEn?: string; formNo?: string; children: ReactNode; dir?: 'rtl' | 'ltr' }) {
  return (
    <div className="form-sheet" dir={dir} style={sheet}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>
          جمهورية السودان
          <br />
          {dept}
        </div>
        {org.logo && <img src={org.logo} alt="" style={{ height: 52 }} />}
        <div style={{ fontWeight: 700, textAlign: 'end' }}>
          {org.nameAr}
          <br />
          إدارة الإمداد
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '8px 0', fontWeight: 700, fontSize: '14pt' }}>
        {title}
        {titleEn && <div style={{ fontSize: '11pt' }}>{titleEn}</div>}
        {formNo && <div style={{ fontSize: '10pt', fontWeight: 400, textAlign: 'end' }}>رقم النموذج : <bdi>{formNo}</bdi></div>}
      </div>
      {children}
    </div>
  )
}

const Row = ({ l, v, w = '50%' }: { l: string; v?: ReactNode; w?: string }) => (
  <div style={{ display: 'inline-block', width: w, verticalAlign: 'top', padding: '2px 0' }}>
    <b>{l} </b>
    <span style={{ borderBottom: '1px dotted #666', minWidth: 80, display: 'inline-block' }}>{v ? <bdi>{v}</bdi> : ' '}</span>
  </div>
)

const Sign = ({ labels }: { labels: string[] }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 8 }}>
    {labels.map((l) => (
      <div key={l} style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ borderTop: '1px solid #000', margin: '0 8px', paddingTop: 4 }}>{l}</div>
      </div>
    ))}
  </div>
)

export interface Line {
  item: string
  unit: string
  spec: string
  qty: number
  unitCost: number
  freq: number
}
const METHOD = { single: 'وحيد مصدر', ip: 'ملكية فكرية', competitive: 'تنافسي' } as const

/** نموذج طلب شراء — Purchase Requisition (PF-01-24) */
export function PrForm({ org, no, projectCode, unit, dept, reason, method, requiredDate, deliveryPlace, deliveryTerms, lines }: { org: Org; no: string; projectCode: string; unit: string; dept: string; reason: string; method: keyof typeof METHOD; requiredDate?: string | null; deliveryPlace: string; deliveryTerms: string; lines: Line[] }) {
  const total = lines.reduce((t, l) => t + l.qty * l.unitCost * l.freq, 0)
  return (
    <Sheet org={org} dept="قسم الشراء" title="نموذج طلب شراء" titleEn="Purchase Requisition Form (PR)" formNo="PF-01-24">
      <Row l="رمز المشروع:" v={projectCode} />
      <Row l="طلب شراء رقم:" v={no} />
      <Row l="اسم القسم / وحدة / مشروع:" v={unit} />
      <Row l="تاريخ التسليم المطلوب:" v={requiredDate} />
      <Row l="الإدارة:" v={dept} />
      <Row l="مكان التسليم المطلوب:" v={deliveryPlace} />
      <Row l="أسباب الشراء:" v={reason} />
      <Row l="شروط التسليم:" v={deliveryTerms} />
      <div style={{ margin: '8px 0' }}>
        <b>طريقة الشراء: </b>
        {(Object.keys(METHOD) as (keyof typeof METHOD)[]).map((m) => (
          <span key={m} style={{ marginInlineEnd: 18 }}>
            {method === m ? '☑' : '☐'} {METHOD[m]}
          </span>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['الرقم NO', 'الصنف Item', 'الوحدة Unit', 'الوصف Specification', 'الكمية Qty', 'تكلفة الوحدة Unit cost', 'عدد المرات Freq.', 'الإجمالي Total'].map((h) => (
              <th key={h} style={head}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{l.item}</td>
              <td style={cell}>{l.unit}</td>
              <td style={cell}>{l.spec}</td>
              <td style={cell}>{n0(l.qty)}</td>
              <td style={cell}>{n2(l.unitCost)}</td>
              <td style={cell}>{n0(l.freq)}</td>
              <td style={cell}>{n2(l.qty * l.unitCost * l.freq)}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 8 - lines.length) }).map((_, i) => (
            <tr key={`e${i}`}>
              {Array.from({ length: 8 }).map((__, j) => (
                <td key={j} style={{ ...cell, height: 22 }} />
              ))}
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={7}>
              الإجمالي الكلي Grand total
            </td>
            <td style={{ ...cell, fontWeight: 700 }}>{n2(total)}</td>
          </tr>
        </tbody>
      </table>
      <Sign labels={['مقدّم الطلب', 'مدير الإدارة الطالبة', 'مسؤول المشتريات', 'المدير المالي', 'المدير التنفيذي']} />
    </Sheet>
  )
}

/** نموذج طلب عرض أسعار — Price Requisition (PF-02-24), one per invited vendor. */
export function RfqForm({ org, no, vendor, email, issueDate, closeDate, lines }: { org: Org; no: string; vendor: { name: string; email?: string }; email?: string; issueDate?: string | null; closeDate?: string | null; lines: Line[] }) {
  return (
    <Sheet org={org} dept="قسم الشراء" title="نموذج طلب عرض أسعار" titleEn="Price Requisition" formNo="PF-02-24">
      <Row l="رقم الطلب RFQ No:" v={no} />
      <Row l="التاريخ:" v={issueDate} />
      <Row l="To / السادة:" v={vendor.name} />
      <Row l="E-mail:" v={vendor.email || email} />
      <p style={{ margin: '10px 0' }}>
        Dear Sir, you are kindly requested to send your price quotation for the following items{closeDate ? ` before ${closeDate}` : ''}.
        <br />
        السادة المحترمون، نرجو التكرم بتقديم عرض أسعاركم للأصناف التالية{closeDate ? ` قبل تاريخ ${closeDate}` : ''}.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Item No', 'DESCRIPTION', 'Unit', 'QTY', 'Unit price', 'Total', 'Remarks'].map((h) => (
              <th key={h} style={head}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>
                {l.item}
                {l.spec ? ` — ${l.spec}` : ''}
              </td>
              <td style={cell}>{l.unit}</td>
              <td style={cell}>{n0(l.qty)}</td>
              <td style={cell} />
              <td style={cell} />
              <td style={cell} />
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 16 }}>
        <Row l="Name:" w="100%" />
        <Row l="Tel No.:" w="100%" />
        <Row l="Sign / Stamp:" w="100%" />
      </div>
    </Sheet>
  )
}

/** نموذج أمر شراء — Purchase Order (PF-03-24) */
export function PoForm({ org, no, date, projectCode, vendor, shipTo, lines }: { org: Org; no: string; date?: string | null; projectCode: string; vendor: { name: string; place: string; phone: string }; shipTo: string; lines: Line[] }) {
  const total = lines.reduce((t, l) => t + l.qty * l.unitCost * l.freq, 0)
  return (
    <Sheet org={org} dept="قسم الشراء" title="نموذج أمر شراء" titleEn="Purchase Order Form (PO)" formNo="PF-03-24" dir="ltr">
      <div style={{ fontWeight: 700, fontSize: '14pt', textAlign: 'center' }}>PURCHASE ORDER — {org.nameEn}</div>
      <div style={{ display: 'flex', gap: 12, margin: '8px 0' }}>
        <div style={{ flex: 1, border: '1px solid #444', padding: 8 }}>
          <b>SHIP TO</b>
          <br />
          {org.nameEn}
          <br />
          {shipTo}
        </div>
        <div style={{ flex: 1, border: '1px solid #444', padding: 8 }}>
          <b>VENDOR</b>
          <br />
          NAME: {vendor.name}
          <br />
          Place: {vendor.place}
          <br />
          Phone: {vendor.phone}
        </div>
        <div style={{ flex: 1, border: '1px solid #444', padding: 8 }}>
          <b>PO No.</b> {no}
          <br />
          <b>Date:</b> {date}
          <br />
          <b>Project Code:</b> {projectCode}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['ITEM NO.', 'DESCRIPTION', 'Unit', 'QTY', 'UNIT PRICE', 'TOTAL'].map((h) => (
              <th key={h} style={head}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{l.item}</td>
              <td style={cell}>{l.unit}</td>
              <td style={cell}>{n0(l.qty)}</td>
              <td style={cell}>{n2(l.unitCost)}</td>
              <td style={cell}>{n2(l.qty * l.unitCost)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={5}>
              TOTAL (SDG) — {sdgInWordsEn(total)}
            </td>
            <td style={{ ...cell, fontWeight: 700 }}>{n2(total)}</td>
          </tr>
        </tbody>
      </table>
      <Sign labels={['Prepared by', 'Procurement', 'Finance Manager', 'Authorized signature']} />
    </Sheet>
  )
}

/** نموذج ملخص التقييم والتصديق على توصية الترسية (PF-06-24) */
export function AwardForm({ org, no, rfqNo, closeDate, issueDate, dept, lines, bids, award }: { org: Org; no: string; rfqNo: string; closeDate?: string | null; issueDate?: string | null; dept: string; lines: Line[]; bids: { vendor: string; unitPrices: number[]; deliveryDays?: number | null; accepted: boolean; note: string }[]; award?: { vendor: string; reason: string } }) {
  return (
    <Sheet org={org} dept="قسم الشراء" title="نموذج ملخص التقييم والتصديق على توصية الترسية" formNo="PF-06-24">
      <Row l="طلب عرض أسعار رقم:" v={rfqNo} />
      <Row l="طلب شراء رقم:" v={no} />
      <Row l="تاريخ إصدار الطلب:" v={issueDate} />
      <Row l="الجهة الطالبة:" v={dept} />
      <Row l="تاريخ إغلاق المناقصة:" v={closeDate} />
      <Row l="عدد المستجيبين:" v={String(bids.length)} />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead>
          <tr>
            <th style={head} rowSpan={2}>
              الرقم
            </th>
            <th style={head} rowSpan={2}>
              الوصف
            </th>
            <th style={head} rowSpan={2}>
              الكمية
            </th>
            {bids.map((b) => (
              <th key={b.vendor} style={head} colSpan={2}>
                {b.vendor}
              </th>
            ))}
          </tr>
          <tr>
            {bids.flatMap((b) => [
              <th key={b.vendor + 'u'} style={head}>
                سعر الوحدة
              </th>,
              <th key={b.vendor + 't'} style={head}>
                الجملة
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{l.item}</td>
              <td style={cell}>{n0(l.qty)}</td>
              {bids.flatMap((b) => [
                <td key={b.vendor + 'u'} style={cell}>
                  {n2(b.unitPrices[i] ?? 0)}
                </td>,
                <td key={b.vendor + 't'} style={cell}>
                  {n2((b.unitPrices[i] ?? 0) * l.qty * l.freq)}
                </td>,
              ])}
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={3}>
              الإجمالي
            </td>
            {bids.map((b) => (
              <td key={b.vendor} style={{ ...cell, fontWeight: 700 }} colSpan={2}>
                {n2(lines.reduce((t, l, i) => t + (b.unitPrices[i] ?? 0) * l.qty * l.freq, 0))}
              </td>
            ))}
          </tr>
          <tr>
            <td style={cell} colSpan={3}>
              التقييم الفني / مدة التسليم
            </td>
            {bids.map((b) => (
              <td key={b.vendor} style={cell} colSpan={2}>
                {b.accepted ? 'مقبول تقنياً' : 'غير مقبول'}
                {b.deliveryDays != null ? ` — ${b.deliveryDays} يوم` : ''}
                {b.note ? ` — ${b.note}` : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <b>توصية الترسية: </b>
        {award ? `${award.vendor} — ${award.reason}` : '………………………'}
      </div>
      <Sign labels={['لجنة المشتريات', 'مدير الإمداد', 'المدير المالي', 'المدير التنفيذي']} />
    </Sheet>
  )
}

/** نموذج استلام مخازن — Store Receipt (WP-01-22) */
export function GrnForm({ org, no, date, store, poNo, supplier, lines, received, notes }: { org: Org; no: string; date?: string | null; store: string; poNo: string; supplier: string; lines: Line[]; received: number[]; notes?: string }) {
  const total = lines.reduce((t, l, i) => t + (received[i] ?? 0) * l.unitCost, 0)
  return (
    <Sheet org={org} dept="قسم الشراء" title="نموذج استلام مخازن" titleEn="STORE RECEIPT" formNo="WP-01-22">
      <Row l="التاريخ:" v={date} />
      <Row l="رقم إذن الاستلام:" v={no} />
      <Row l="المخزن:" v={store} />
      <Row l="أمر الشراء رقم:" v={poNo} />
      <Row l="اسم المورد:" v={supplier} w="100%" />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead>
          <tr>
            {['الرقم', 'الصنف', 'الوحدة', 'الكمية المطلوبة', 'الكمية المستلمة', 'السعر', 'الإجمالي', 'الملاحظات'].map((h) => (
              <th key={h} style={head}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{l.item}</td>
              <td style={cell}>{l.unit}</td>
              <td style={cell}>{n0(l.qty)}</td>
              <td style={cell}>{n0(received[i] ?? 0)}</td>
              <td style={cell}>{n2(l.unitCost)}</td>
              <td style={cell}>{n2((received[i] ?? 0) * l.unitCost)}</td>
              <td style={cell}>{(received[i] ?? 0) < l.qty ? 'نقص' : ''}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={6}>
              الإجمالي
            </td>
            <td style={{ ...cell, fontWeight: 700 }}>{n2(total)}</td>
            <td style={cell} />
          </tr>
        </tbody>
      </table>
      {notes && <p>ملاحظات: {notes}</p>}
      <Sign labels={['أمين المخزن', 'مسؤول المشتريات', 'توقيع / ختم المورد']} />
    </Sheet>
  )
}

/** طلب مالي — payment request (PMT) */
export function PaymentRequestForm({ org, date, amount, purpose, items, beneficiary, requester, projectLabel }: { org: Org; date: string; amount: number; purpose: string; items: { text: string; amount: number }[]; beneficiary: string; requester: string; projectLabel?: string }) {
  return (
    <Sheet org={org} dept={org.hqAr} title="طلب مالي" dir="rtl">
      <p>السلام عليكم ورحمة الله وبركاته ،،،</p>
      <Row l="الرجاء التصديق بمبلغ:" v={n2(amount)} />
      <Row l="التاريخ:" v={date} />
      <Row l="لعمل البيان التالي:" v={purpose} w="100%" />
      {projectLabel && <Row l="البند / المشروع:" v={projectLabel} w="100%" />}
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0' }}>
        <thead>
          <tr>
            <th style={head}>م</th>
            <th style={head}>البيان</th>
            <th style={head}>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((x, i) => (
            <tr key={i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{x.text}</td>
              <td style={cell}>{n2(x.amount)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>
              TOTAL: {sdgInWordsEn(amount)}
            </td>
            <td style={{ ...cell, fontWeight: 700 }}>{n2(amount)}</td>
          </tr>
        </tbody>
      </table>
      <Row l="اسم الجهة المستفيدة:" v={beneficiary} w="100%" />
      <Row l="مقدم الطلب:" v={requester} />
      <Row l="التوقيع:" v="" />
      <Sign labels={['تصديق المدير المالي', 'تصديق المدير التنفيذي']} />
    </Sheet>
  )
}

/** شهادة إنجاز — Certificate of Completion */
export function CompletionCertificate({ org, office, date, department, contractor, amount, what, chargedTo, signer, signerTitle }: { org: Org; office: string; date: string; department: string; contractor: string; amount: number; what: string; chargedTo: string; signer: string; signerTitle: string }) {
  return (
    <Sheet org={org} dept={office} title="شهادة إنجاز" titleEn="Certificate of Completion">
      <Row l="التاريخ:" v={date} w="100%" />
      <p>
        بهذا يشهد قسم: <b>{department}</b> بمنظمة <b>{org.nameAr}</b>
      </p>
      <p>
        بأن السيد/السادة: <b>{contractor}</b> قد أكمل العمل المتعاقد عليه بمبلغ وقدره <b>{n2(amount)}</b>
      </p>
      <p>{sdgInWordsAr(amount)}</p>
      <p>
        عبارة عن: <b>{what}</b>
      </p>
      <p>
        خصماً من: <b>{chargedTo}</b>
      </p>
      <p style={{ marginTop: 24 }}>وهذا منا للإفادة.</p>
      <div style={{ marginTop: 40, textAlign: 'end' }}>
        <b>{signer}</b>
        <br />
        {signerTitle}
        <br />
        …………………………………
      </div>
    </Sheet>
  )
}

/** خطاب — letter requesting approval of a financial custody (عهدة) or payment */
export function CustodyLetter({ org, office, date, to, subject, amount, what, chargedTo, signer, signerTitle }: { org: Org; office: string; date: string; to: string; subject: string; amount: number; what: string; chargedTo: string; signer: string; signerTitle: string }) {
  return (
    <Sheet org={org} dept={office} title="بسم الله الرحمن الرحيم">
      <Row l="التاريخ:" v={date} w="100%" />
      <p>
        إلى السيد / <b>{to}</b> &nbsp;&nbsp; المحترم
      </p>
      <p>السلام عليكم ورحمة الله وبركاته</p>
      <p>
        <b>الموضوع: - {subject}</b>
      </p>
      <p>
        بالإشارة للموضوع أعلاه نرجو من سيادتكم تصديق مبلغ <b>{n2(amount)}</b> جنيه سوداني.
      </p>
      <p>الجملة كتابة: {sdgInWordsAr(amount)}</p>
      <p>
        وهي عبارة عن: <b>{what}</b>
      </p>
      <p>
        خصماً من: <b>{chargedTo}</b>
      </p>
      <p>وشكراً</p>
      <div style={{ marginTop: 40, textAlign: 'end' }}>
        <b>{signer}</b>
        <br />
        {signerTitle}
        <br />
        …………………………………
      </div>
    </Sheet>
  )
}
