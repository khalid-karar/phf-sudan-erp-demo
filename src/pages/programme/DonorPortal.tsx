import { Download, LogOut } from 'lucide-react'
import { useState } from 'react'
import { signOut } from '../../api/live'
import { LIVE } from '../../api/http'
import { backend, useLoad } from '../../api/programme'
import type { PortalMe, PortalRow, ReportDetail } from '../../api/programme'
import { Button, Panel } from '../../components/ui'
import { useLang } from '../../lib/i18n'
import { TYPE_LABEL, periodLabel } from '../../lib/programme'
import { useSession } from '../../lib/session'
import { useStore } from '../../lib/store'
import { ReportBody } from './ReportBody'

/** What a funding entity sees: its own projects and the reports released to it, read only. */
export function DonorPortal({ name }: { name?: { ar: string; en: string } | null }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const setLang = useStore((s) => s.setLang)
  const org = useStore((s) => s.org)
  const me = useLoad(() => backend.portalMe(), [], null as PortalMe | null)
  const rows = useLoad(() => backend.portalReports(), [], [] as PortalRow[])
  const [open, setOpen] = useState<ReportDetail | null>(null)
  const [type, setType] = useState('')
  const sessionName = useSession((s) => s.name)
  const who = name ?? sessionName
  const view = async (id: string) => setOpen(await backend.portalReport(id))
  const shown = rows.data.filter((r) => !type || r.type === type)
  const out = () => (LIVE ? void signOut() : (useStore.getState().setUser('u-fo'), (window.location.hash = '#/login')))
  return (
    <div className="min-h-screen bg-paper" dir={ar ? 'rtl' : 'ltr'}>
      <header className="flex items-center justify-between gap-3 bg-nile px-6 py-3 text-white">
        <div className="flex items-center gap-3">
          <img src={org.logo.replace('phf-logo', 'phf-mark')} alt="" className="size-10 rounded-full bg-white object-contain p-0.5" />
          <div className="leading-tight"><div className="font-kufi font-semibold">{org.shortName[lang]}</div><div className="text-[12.5px] text-white/70">{me.data ? (ar ? me.data.donor.nameAr : me.data.donor.nameEn) : ''}</div></div>
        </div>
        <div className="flex items-center gap-3 text-[13.5px]">
          {who && <span className="hidden sm:inline">{who[lang]}</span>}
          <button onClick={() => setLang(ar ? 'en' : 'ar')} className="rounded-md border border-white/30 px-2.5 py-1 hover:bg-white/10">{ar ? 'English' : 'العربية'}</button>
          <button onClick={out} className="flex items-center gap-1.5 rounded-md border border-white/30 px-2.5 py-1 hover:bg-white/10"><LogOut size={15} />{ar ? 'خروج' : 'Sign out'}</button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        {open ? (
          <div>
            <button className="mb-3 text-nile hover:underline" onClick={() => setOpen(null)}>{ar ? '← رجوع للتقارير' : '← Back to reports'}</button>
            <h1 className="text-[24px] font-bold">{TYPE_LABEL[open.type][ar ? 'ar' : 'en']} — {periodLabel(open.period, ar)}</h1>
            <p className="mb-4 text-muted">{open.projectCode} — {ar ? open.projectNameAr : open.projectNameEn}</p>
            {open.type === 'quarterly' && <div className="mb-4 flex gap-2"><Button variant="quiet" onClick={() => void backend.portalExpenditure(open.id, 'USD')}><Download size={16} />{ar ? 'تقرير المصروفات (USD)' : 'Expenditure report (USD)'}</Button><Button variant="quiet" onClick={() => void backend.portalExpenditure(open.id, 'SDG')}><Download size={16} />{ar ? 'تقرير المصروفات (SDG)' : 'Expenditure report (SDG)'}</Button></div>}
            <Panel className="p-5"><ReportBody r={open} content={open.content} setContent={() => undefined} readOnly /></Panel>
          </div>
        ) : (
          <div className="space-y-6">
            <Panel title={ar ? 'مشاريعكم' : 'Your projects'}>
              {me.data?.projects.map((p) => (<div key={p.id} className="flex justify-between border-b border-line px-5 py-3"><span className="font-medium">{p.code} — {ar ? p.nameAr : p.nameEn}</span><span className="text-muted" dir="ltr">{p.startDate} → {p.endDate}</span></div>))}
            </Panel>
            <Panel title={ar ? 'التقارير المتاحة' : 'Available reports'} aside={
              <select className="h-9 rounded-md border border-line bg-surface px-2 text-[14px]" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">{ar ? 'كل الأنواع' : 'All types'}</option>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (<option key={k} value={k}>{v[ar ? 'ar' : 'en']}</option>))}
              </select>}>
              {shown.map((r) => (
                <button key={r.id} onClick={() => void view(r.id)} className="flex w-full items-center justify-between border-b border-line px-5 py-3 text-start hover:bg-paper">
                  <span><b>{TYPE_LABEL[r.type][ar ? 'ar' : 'en']}</b> — {periodLabel(r.period, ar)} <span className="text-muted">({r.projectCode})</span></span>
                  <span className="text-[13px] text-muted" dir="ltr">{r.releasedAt.slice(0, 10)}</span>
                </button>
              ))}
              {shown.length === 0 && <p className="p-5 text-muted">{ar ? 'لم يُفرج عن تقارير بعد.' : 'No reports have been released yet.'}</p>}
            </Panel>
          </div>
        )}
      </main>
    </div>
  )
}
