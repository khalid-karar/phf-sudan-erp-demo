import { ImageUp } from 'lucide-react'
import { useState } from 'react'
import { Button, Field, inputCls, PageHeader, Panel } from '../../components/ui'
import type { OrgSettings } from '../../data/types'
import { useLang } from '../../lib/i18n'
import { useStore } from '../../lib/store'

const months = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

export function Organization() {
  const lang = useLang()
  const ar = lang === 'ar'
  const org = useStore((s) => s.org)
  const setOrg = useStore((s) => s.setOrg)
  const [d, setD] = useState<OrgSettings>(org)
  const dirty = JSON.stringify(d) !== JSON.stringify(org)
  const bi = (k: 'name' | 'shortName' | 'hqName', l: 'ar' | 'en', v: string) => setD({ ...d, [k]: { ...d[k], [l]: v } })

  const onLogo = (f: File | undefined) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => setD((x) => ({ ...x, logo: String(r.result) }))
    r.readAsDataURL(f)
  }

  return (
    <div>
      <PageHeader
        title={ar ? 'بيانات المؤسسة' : 'Organization'}
        sub={ar ? 'الاسم والشعار والعملات والسنة المالية. تظهر في القائمة وفي التقارير المرسلة إلى المقر.' : 'Name, logo, currencies and fiscal year. Used in the menu and in reports sent to headquarters.'}
        actions={
          <>
            <Button variant="quiet" disabled={!dirty} onClick={() => setD(org)}>
              {ar ? 'تراجع' : 'Discard'}
            </Button>
            <Button disabled={!dirty} onClick={() => setOrg(d)}>
              {ar ? 'حفظ التغييرات' : 'Save changes'}
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Panel className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={ar ? 'اسم المؤسسة بالعربية' : 'Organization name (Arabic)'}>
              <input className={inputCls} dir="rtl" value={d.name.ar} onChange={(e) => bi('name', 'ar', e.target.value)} />
            </Field>
            <Field label={ar ? 'اسم المؤسسة بالإنجليزية' : 'Organization name (English)'}>
              <input className={inputCls} dir="ltr" value={d.name.en} onChange={(e) => bi('name', 'en', e.target.value)} />
            </Field>
            <Field label={ar ? 'اسم النظام بالعربية' : 'System name (Arabic)'}>
              <input className={inputCls} dir="rtl" value={d.shortName.ar} onChange={(e) => bi('shortName', 'ar', e.target.value)} />
            </Field>
            <Field label={ar ? 'اسم النظام بالإنجليزية' : 'System name (English)'}>
              <input className={inputCls} dir="ltr" value={d.shortName.en} onChange={(e) => bi('shortName', 'en', e.target.value)} />
            </Field>
            <Field label={ar ? 'المقر الرئيسي (جهة التقرير الشهري) — عربي' : 'Headquarters (monthly report recipient) — Arabic'}>
              <input className={inputCls} dir="rtl" value={d.hqName.ar} onChange={(e) => bi('hqName', 'ar', e.target.value)} />
            </Field>
            <Field label={ar ? 'المقر الرئيسي — إنجليزي' : 'Headquarters — English'}>
              <input className={inputCls} dir="ltr" value={d.hqName.en} onChange={(e) => bi('hqName', 'en', e.target.value)} />
            </Field>
          </div>
          <hr className="border-line" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={ar ? 'عملة الدفاتر والميزانيات' : 'Books & budgets currency'}>
              <select className={inputCls} value={d.baseCurrency} onChange={(e) => setD({ ...d, baseCurrency: e.target.value })}>
                <option value="USD">USD — {ar ? 'دولار أمريكي' : 'US dollar'}</option>
                <option value="KWD">KWD — {ar ? 'دينار كويتي' : 'Kuwaiti dinar'}</option>
                <option value="EUR">EUR — {ar ? 'يورو' : 'Euro'}</option>
              </select>
            </Field>
            <Field label={ar ? 'العملة المحلية' : 'Local currency'}>
              <select className={inputCls} value={d.localCurrency} onChange={(e) => setD({ ...d, localCurrency: e.target.value })}>
                <option value="SDG">SDG — {ar ? 'جنيه سوداني' : 'Sudanese pound'}</option>
              </select>
            </Field>
            <Field label={ar ? 'بداية السنة المالية' : 'Fiscal year starts'}>
              <select className={inputCls} value={d.fiscalYearStartMonth} onChange={(e) => setD({ ...d, fiscalYearStartMonth: +e.target.value })}>
                {months[lang].map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'أول أيام الأسبوع' : 'Week starts on'}>
              <select className={inputCls} value={d.weekStartsOn} onChange={(e) => setD({ ...d, weekStartsOn: e.target.value as OrgSettings['weekStartsOn'] })}>
                <option value="sat">{ar ? 'السبت' : 'Saturday'}</option>
                <option value="sun">{ar ? 'الأحد' : 'Sunday'}</option>
                <option value="mon">{ar ? 'الاثنين' : 'Monday'}</option>
              </select>
            </Field>
          </div>
          <Field label={ar ? 'لغة النظام الافتراضية للمستخدمين الجدد' : 'Default language for new users'}>
            <div className="flex gap-2">
              {(['ar', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setD({ ...d, defaultLang: l })}
                  className={`h-10 rounded-md border px-4 text-[14px] ${d.defaultLang === l ? 'border-nile bg-nile-soft text-nile' : 'border-line'}`}
                >
                  {l === 'ar' ? 'العربية' : 'English'}
                </button>
              ))}
            </div>
          </Field>
        </Panel>
        <Panel className="h-fit p-5">
          <div className="text-[13.5px] font-medium">{ar ? 'الشعار' : 'Logo'}</div>
          <div className="mt-3 flex flex-col items-center gap-3 rounded-md bg-nile p-5">
            <img src={d.logo} alt="" className="size-20 rounded-full bg-white object-cover ring-2 ring-white/30" />
            <div className="text-center leading-tight text-white">
              <div className="font-kufi text-[14px] font-semibold">{d.shortName[lang]}</div>
              <div className="mt-1 text-[11.5px] text-white/60">{d.name[lang]}</div>
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line py-3 text-[13.5px] text-nile hover:border-nile-2">
            <ImageUp size={16} /> {ar ? 'رفع شعار جديد' : 'Upload a new logo'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          <p className="mt-2 text-[12px] text-muted">{ar ? 'يفضّل شعار مربع بخلفية بيضاء.' : 'A square logo on white works best.'}</p>
        </Panel>
      </div>
    </div>
  )
}
