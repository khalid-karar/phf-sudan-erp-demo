import { Camera, CheckCircle2, CloudOff, CloudUpload, LocateFixed, Minus, Plus, Wifi, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field, inputCls, PageHeader, Panel } from '../../components/ui'
import type { FieldReport as Report } from '../../data/types'
import { date } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

/** Shrinks a photo so a field report stays small enough for weak connections. */
async function compress(file: File, max = 900, quality = 0.62): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => {
      window.removeEventListener('online', a)
      window.removeEventListener('offline', b)
    }
  }, [])
  return on
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-md border border-line p-2.5 text-center">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button type="button" className="grid size-9 place-items-center rounded-md bg-paper hover:bg-nile-soft" onClick={() => onChange(Math.max(0, value - 1))} aria-label="-">
          <Minus size={16} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          className="num h-9 w-full min-w-0 bg-transparent text-center font-kufi text-[19px] font-semibold outline-none"
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.floor(+e.target.value || 0)))}
          aria-label={label}
        />
        <button type="button" className="grid size-9 place-items-center rounded-md bg-paper hover:bg-nile-soft" onClick={() => onChange(value + 1)} aria-label="+">
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

export function FieldReport() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { scopeOffice } = usePerm()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const realOnline = useOnline()
  const online = realOnline && !s.offlineSim

  const open = s.activities.filter((a) => !a.report && (!scopeOffice || a.officeId === scopeOffice) && !s.outbox.some((o) => o.activityId === a.id))
  const [actId, setActId] = useState(params.get('activity') ?? open.find((a) => +new Date(a.date) <= Date.now())?.id ?? open[0]?.id ?? '')
  const act = s.activities.find((a) => a.id === actId)
  const [doneOn, setDoneOn] = useState(new Date().toISOString().slice(0, 10))
  const [men, setMen] = useState(0)
  const [women, setWomen] = useState(0)
  const [children, setChildren] = useState(0)
  const [summary, setSummary] = useState('')
  const [issues, setIssues] = useState('')
  const [actual, setActual] = useState<number | ''>('')
  const [photos, setPhotos] = useState<string[]>([])
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(null)
  const [locMsg, setLocMsg] = useState('')
  const [done, setDone] = useState<null | 'sent' | 'queued'>(null)

  useEffect(() => {
    if (!realOnline) return
    if (!s.offlineSim && s.outbox.length) s.syncOutbox()
  }, [realOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = men + women + children
  const valid = !!act && total > 0 && summary.trim().length > 3

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    const room = 4 - photos.length
    const out = await Promise.all([...files].slice(0, room).map((f) => compress(f)))
    setPhotos((p) => [...p, ...out])
  }
  const locate = () => {
    if (!('geolocation' in navigator)) return setLocMsg(ar ? 'الجهاز لا يدعم تحديد الموقع.' : 'This device can’t share location.')
    setLocMsg(ar ? 'جارٍ تحديد الموقع…' : 'Locating…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lon: p.coords.longitude })
        setLocMsg('')
      },
      () => setLocMsg(ar ? 'تعذّر تحديد الموقع — يمكنك المتابعة بدونه.' : 'Couldn’t get location — you can continue without it.'),
      { timeout: 8000 },
    )
  }
  const submit = async () => {
    if (!act) return
    const report: Report = {
      no: `TR-${act.code.slice(4)}`,
      submittedAt: new Date().toISOString(),
      doneOn: new Date(doneOn).toISOString(),
      men,
      women,
      children,
      beneficiaries: total,
      summary: { ar: summary, en: summary },
      issues: issues || undefined,
      actualUSD: actual === '' ? undefined : actual,
      photos,
      lat: loc?.lat,
      lon: loc?.lon,
      submittedBy: s.userId,
      via: online ? 'online' : 'offline',
    }
    setDone(await s.submitReport(act.id, report))
  }
  const reset = () => {
    setDone(null)
    setMen(0)
    setWomen(0)
    setChildren(0)
    setSummary('')
    setIssues('')
    setActual('')
    setPhotos([])
    setLoc(null)
    setActId(open.find((a) => a.id !== actId)?.id ?? '')
  }

  const banner = (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 ${online ? 'bg-leaf-soft' : 'bg-amber-soft'}`}>
      {online ? <Wifi size={18} className="text-leaf" /> : <WifiOff size={18} className="text-amber" />}
      <div className="min-w-0 flex-1 text-[13.5px]">
        <b>{online ? (ar ? 'متصل' : 'Online') : ar ? 'غير متصل' : 'Offline'}</b>
        {' — '}
        {online
          ? ar
            ? 'يُرسل التقرير فوراً.'
            : 'Reports send straight away.'
          : ar
            ? 'يُحفظ التقرير على الجهاز ويُرسل تلقائياً عند عودة الإنترنت.'
            : 'Reports are saved on this device and send automatically when back online.'}
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-muted">
        <input type="checkbox" checked={s.offlineSim} onChange={(e) => s.setOfflineSim(e.target.checked)} className="size-4" />
        {ar ? 'محاكاة انقطاع الإنترنت (للعرض)' : 'Simulate no internet (demo)'}
      </label>
    </div>
  )

  const outbox = s.outbox.length > 0 && (
    <Panel className="mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[14px] font-medium">
          <CloudOff size={17} className="text-amber" />
          {ar ? `${s.outbox.length} تقرير محفوظ على الجهاز بانتظار الإرسال` : `${s.outbox.length} report(s) saved on this device, waiting to send`}
        </div>
        <Button
          variant="quiet"
          className="h-9"
          disabled={!online}
          onClick={() => {
            useStore.setState((st) => ({ outbox: st.outbox.map(({ error: _e, ...o }) => o) })) // try the refused ones again too
            s.syncOutbox()
          }}
        >
          <CloudUpload size={16} /> {ar ? 'إرسال الآن' : 'Send now'}
        </Button>
      </div>
      <ul className="mt-2 space-y-1 text-[13px] text-muted">
        {s.outbox.map((o) => {
          const a = s.activities.find((x) => x.id === o.activityId)
          return (
            <li key={o.id} className="num">
              {a?.code} — {a?.title[lang]} ({date(o.savedAt, lang)})
              {o.error && <span className="ms-2 text-crescent">{o.error}</span>}
            </li>
          )
        })}
      </ul>
    </Panel>
  )

  if (done)
    return (
      <div className="mx-auto max-w-xl">
        {banner}
        {outbox}
        <Panel className="p-8 text-center">
          {done === 'sent' ? <CheckCircle2 size={40} className="mx-auto text-leaf" /> : <CloudOff size={40} className="mx-auto text-amber" />}
          <h1 className="mt-3 text-[20px] font-bold">{done === 'sent' ? (ar ? 'أُرسل التقرير' : 'Report sent') : ar ? 'حُفظ التقرير على الجهاز' : 'Report saved on this device'}</h1>
          <p className="mt-1 text-muted">
            {done === 'sent'
              ? ar
                ? 'ارتبط التقرير بالنشاط، وأصبحت عهدته جاهزة للتسوية في المالية.'
                : 'The report is linked to the activity, and its advance is now ready to settle in Finance.'
              : ar
                ? 'لا تقلق بشأن الاتصال. سيُرسل تلقائياً عندما يعود الإنترنت.'
                : 'Don’t worry about the connection. It sends automatically when the internet is back.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="quiet" onClick={reset}>
              {ar ? 'تقرير آخر' : 'Another report'}
            </Button>
            {done === 'sent' && <Button onClick={() => nav(`/activities/${actId}`)}>{ar ? 'فتح النشاط' : 'Open the activity'}</Button>}
          </div>
        </Panel>
      </div>
    )

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={ar ? 'رفع تقرير فني' : 'Submit a field report'} sub={ar ? 'صُمّم للجوال ويعمل دون إنترنت.' : 'Built for phones and works without internet.'} />
      {banner}
      {outbox}
      {open.length === 0 ? (
        <Panel className="p-8 text-center">
          <p className="font-medium">{ar ? 'لا توجد أنشطة بانتظار تقرير.' : 'No activities are waiting for a report.'}</p>
          <Link to="/activities?new=1" className="mt-2 inline-block text-nile hover:underline">
            {ar ? 'إنشاء نشاط جديد' : 'Create a new activity'}
          </Link>
        </Panel>
      ) : (
        <Panel className="space-y-5 p-5">
          <Field label={ar ? 'النشاط' : 'Activity'}>
            <select className={inputCls} value={actId} onChange={(e) => setActId(e.target.value)}>
              {open.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.title[lang]}
                </option>
              ))}
            </select>
          </Field>
          {act && (
            <p className="-mt-3 text-[12.5px] text-muted">
              {ar ? 'المخطط:' : 'Planned:'} <span className="num">{date(act.date, lang)}</span> — {act.location}
            </p>
          )}
          <Field label={ar ? 'تاريخ التنفيذ' : 'Date carried out'}>
            <input type="date" className={`${inputCls} num`} value={doneOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDoneOn(e.target.value)} />
          </Field>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[13.5px]">
              <span className="font-medium">{ar ? 'عدد المستفيدين' : 'Beneficiaries'}</span>
              <span className="num text-muted">
                {ar ? 'المجموع' : 'Total'} <b className="text-ink">{total}</b>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Counter label={ar ? 'رجال' : 'Men'} value={men} onChange={setMen} />
              <Counter label={ar ? 'نساء' : 'Women'} value={women} onChange={setWomen} />
              <Counter label={ar ? 'أطفال' : 'Children'} value={children} onChange={setChildren} />
            </div>
          </div>
          <Field label={ar ? 'ماذا تم؟' : 'What was done?'}>
            <textarea
              className={`${inputCls} h-24 py-2`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={ar ? 'مثال: كشف 120 مريضاً، صرف أدوية، تحويل 4 حالات للمستشفى' : 'e.g. 120 patients examined, medicines dispensed, 4 referrals'}
            />
          </Field>
          <Field label={ar ? 'مشكلات أو ملاحظات (اختياري)' : 'Problems or notes (optional)'}>
            <textarea className={`${inputCls} h-16 py-2`} value={issues} onChange={(e) => setIssues(e.target.value)} />
          </Field>
          <Field label={ar ? 'التكلفة الفعلية بالدولار (اختياري)' : 'Actual cost in USD (optional)'} hint={ar ? 'الإيصالات تُرفق عند تسوية العهدة.' : 'Receipts are attached when settling the advance.'}>
            <input type="number" min={0} inputMode="decimal" className={`${inputCls} num`} value={actual} onChange={(e) => setActual(e.target.value === '' ? '' : Math.max(0, +e.target.value))} />
          </Field>
          <div>
            <div className="mb-1.5 text-[13.5px] font-medium">{ar ? 'صور من الميدان (حتى 4)' : 'Photos from the field (up to 4)'}</div>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-md ring-1 ring-line">
                  <img src={p} alt="" className="size-full object-cover" />
                  <button className="absolute top-1 end-1 grid size-6 place-items-center rounded-full bg-ink/70 text-white" onClick={() => setPhotos((x) => x.filter((_, k) => k !== i))} aria-label={ar ? 'حذف' : 'Remove'}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <label className="grid aspect-square cursor-pointer place-items-center rounded-md border border-dashed border-line text-muted hover:border-nile-2 hover:text-nile">
                  <span className="text-center text-[12px]">
                    <Camera size={20} className="mx-auto" />
                    {ar ? 'إضافة' : 'Add'}
                  </span>
                  <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
                </label>
              )}
            </div>
            <p className="mt-1 text-[12px] text-muted">{ar ? 'تُصغّر الصور تلقائياً لتناسب الاتصال الضعيف.' : 'Photos are shrunk automatically for weak connections.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="quiet" type="button" onClick={locate}>
              <LocateFixed size={16} /> {loc ? (ar ? 'تم تحديد الموقع' : 'Location added') : ar ? 'إضافة موقعي' : 'Add my location'}
            </Button>
            {loc && (
              <span className="num text-[12.5px] text-muted">
                {loc.lat.toFixed(4)}, {loc.lon.toFixed(4)}
              </span>
            )}
            {locMsg && <span className="text-[12.5px] text-muted">{locMsg}</span>}
          </div>
          <Button className="h-12 w-full text-[15px]" disabled={!valid} onClick={submit}>
            {online ? (ar ? 'إرسال التقرير' : 'Send report') : ar ? 'حفظ على الجهاز' : 'Save on this device'}
          </Button>
          {!valid && <p className="-mt-3 text-center text-[12.5px] text-muted">{ar ? 'أدخل عدد المستفيدين ووصفاً لما تم.' : 'Enter the number of beneficiaries and what was done.'}</p>}
        </Panel>
      )}
    </div>
  )
}
