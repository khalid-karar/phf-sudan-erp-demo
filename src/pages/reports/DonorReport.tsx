import { Download, Loader2, Mail } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { FitPreview } from '../../components/report/FitPreview'
import { Bar, Block, DocHeader, H, PAGE_W } from '../../components/report/HqReportDoc'
import { SendModal } from '../../components/report/SendModal'
import { Button, Field, PageHeader } from '../../components/ui'
import type { Lang } from '../../data/types'
import { findLine, lineUsage, pillarUsage, projectUsage } from '../../lib/budget'
import { useLang } from '../../lib/i18n'
import { buildPdf } from '../../lib/pdf'
import { lastMonth, periodLabel, periodRange, recentPeriods } from '../../lib/reportData'
import { usePerm, useStore } from '../../lib/store'

const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const usd = (v: number) => `⁦${v < 0 ? '−' : ''}$${n0(Math.abs(v))}⁩`

export function DonorReport() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, user } = usePerm()
  const [pid, setPid] = useState(s.projects[0].id)
  const [span, setSpan] = useState<'month' | 'quarter' | 'todate'>('quarter')
  const [period, setPeriod] = useState(lastMonth())
  const [rLang, setRLang] = useState<Lang>('ar')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const p = s.projects.find((x) => x.id === pid)!
  const t = (a: string, e: string) => (rLang === 'ar' ? a : e)
  const L = rLang

  const { start, end, label } = useMemo(() => {
    const r = periodRange(period)
    if (span === 'month') return { start: r.start, end: r.end, label: periodLabel(period, rLang === 'ar') }
    if (span === 'quarter') {
      const st = new Date(r.start.getFullYear(), r.start.getMonth() - 2, 1)
      const f = new Intl.DateTimeFormat(rLang === 'ar' ? 'ar-SD-u-nu-latn' : 'en-GB', { month: 'short', year: 'numeric' })
      return { start: st, end: r.end, label: `${f.format(st)} – ${f.format(r.end)}` }
    }
    return { start: new Date(p.start), end: new Date(), label: t('منذ بداية المشروع', 'Project to date') }
  }, [period, span, rLang, p.start]) // eslint-disable-line react-hooks/exhaustive-deps

  const inRange = (iso?: string) => !!iso && +new Date(iso) >= +start && +new Date(iso) <= +end
  const pu = projectUsage(p, s)
  const periodSpent = s.expenses.filter((e) => e.projectId === p.id && inRange(e.date)).reduce((a, e) => a + e.amountUSD, 0)
  const acts = s.activities.filter((a) => a.projectId === p.id && a.report && inRange(a.report.doneOn ?? a.date))
  const people = acts.reduce((a, x) => ({ m: a.m + (x.report?.men ?? 0), w: a.w + (x.report?.women ?? 0), c: a.c + (x.report?.children ?? 0) }), { m: 0, w: 0, c: 0 })
  const photos = acts.flatMap((a) => (a.report?.photos ?? []).map((ph) => ({ ph, a }))).slice(0, 6)
  const reallocs = s.reallocations.filter((r) => r.projectId === p.id && r.status === 'approved')
  const fileName = `PHF-Sudan-${p.code}-report-${period}.pdf`
  const settings = s.reportSettings.donor[p.id] ?? { to: [], cc: [], subject: { ar: 'تقرير المشروع {project} — {period}', en: 'Project report {project} — {period}' }, body: { ar: '', en: '' } }

  const makePdf = async () => {
    const r = await buildPdf({ blocks: [...docRef.current!.querySelectorAll<HTMLElement>('[data-block]')], header: headRef.current!, fileName, footerText: (i, n) => `PHF Sudan — ${p.code} — ${i} / ${n}` })
    return { ...r, fileName }
  }

  return (
    <div>
      <PageHeader
        title={ar ? 'تقرير المانح' : 'Donor report'}
        sub={ar ? 'تقرير لمشروع واحد: الميزانية مقابل الفعلي، والأنشطة والمستفيدون، وصور من الميدان — جاهز للإرسال للجهة المانحة.' : 'One project’s report: budget vs actual, activities and beneficiaries, and field photos — ready to send to the donor.'}
        actions={
          <>
            <Button
              variant="quiet"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  ;(await makePdf()).save()
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {ar ? 'تنزيل PDF' : 'Download PDF'}
            </Button>
            <Button disabled={!can('reports', 'edit')} onClick={() => setSending(true)}>
              <Mail size={16} /> {ar ? 'إرسال للمانح' : 'Send to donor'}
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Field label={ar ? 'المشروع' : 'Project'}>
          <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={pid} onChange={(e) => setPid(e.target.value)}>
            {s.projects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} — {x.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? 'الفترة' : 'Period'}>
          <div className="flex h-10 rounded-md border border-line bg-surface p-0.5">
            {(
              [
                ['month', ar ? 'شهر' : 'Month'],
                ['quarter', ar ? 'ربع سنة' : 'Quarter'],
                ['todate', ar ? 'منذ البداية' : 'To date'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setSpan(k)} className={`rounded px-3 text-[13.5px] ${span === k ? 'bg-nile text-white' : 'text-muted'}`}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        {span !== 'todate' && (
          <Field label={span === 'month' ? (ar ? 'الشهر' : 'Month') : ar ? 'ينتهي في' : 'Ending'}>
            <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {recentPeriods().map((x) => (
                <option key={x} value={x}>
                  {periodLabel(x, ar)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={ar ? 'اللغة' : 'Language'}>
          <div className="flex h-10 rounded-md border border-line bg-surface p-0.5">
            {(['ar', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setRLang(l)} className={`rounded px-3 text-[13.5px] ${rLang === l ? 'bg-nile text-white' : 'text-muted'}`}>
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </Field>
        <label className="min-w-64 flex-1 text-[13.5px]">
          {ar ? 'ملاحظة للمانح (اختياري)' : 'Note to the donor (optional)'}
          <input className="mt-1 h-10 w-full rounded-md border border-line px-3" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <FitPreview innerRef={docRef}>
          <div dir={L === 'ar' ? 'rtl' : 'ltr'} style={{ width: PAGE_W }} className="bg-white font-plex text-[12.5px] leading-relaxed">
            <Block className="pt-8">
              <div className="flex items-center gap-3">
                <img src={s.org.logo} alt="" className="h-14 w-auto object-contain" />
                <div className="leading-tight">
                  <div className="font-kufi text-[14px] font-bold text-nile">{s.org.name[L]}</div>
                  <div className="text-[11px] text-muted">{p.donor[L]}</div>
                </div>
              </div>
              <div className="mt-6 border-s-4 border-crescent ps-4">
                <div className="text-[12px] text-muted">{t('تقرير المشروع للجهة المانحة', 'Project report to the donor')}</div>
                <h1 className="font-kufi text-[24px] font-bold leading-tight">
                  {p.code} — {p.name[L]}
                </h1>
                <div className="mt-1 text-[13px]">
                  {t('الفترة:', 'Period:')} <b>{label}</b>
                </div>
              </div>
              {note && <p className="mt-4 rounded bg-[#f7f9f9] p-3">{note}</p>}
            </Block>
            <Block>
              <div className="grid grid-cols-4 divide-x divide-line overflow-hidden rounded-md border border-line rtl:divide-x-reverse">
                {(
                  [
                    [t('ميزانية المشروع', 'Project budget'), usd(pu.ceiling)],
                    [t('المصروف حتى الآن', 'Spent to date'), usd(pu.spent)],
                    [t('مصروف الفترة', 'Spent in period'), usd(periodSpent)],
                    [t('المستفيدون في الفترة', 'Beneficiaries in period'), n0(people.m + people.w + people.c)],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="bg-[#f7f9f9] px-3 py-3 text-center">
                    <div className="num font-kufi text-[18px] font-bold text-nile">{v}</div>
                    <div className="text-[10.5px] text-muted">{k}</div>
                  </div>
                ))}
              </div>
            </Block>
            {p.pillars.map((pl, i) => {
              const u = pillarUsage(pl, s)
              return (
                <Block key={pl.id}>
                  {i === 0 && <H n={1}>{t('الميزانية مقابل الفعلي', 'Budget vs actual')}</H>}
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="bg-nile text-white">
                        <th className="px-2 py-1.5 text-start font-medium">
                          {pl.code}. {pl.name[L]}
                        </th>
                        <th className="w-20 px-2 py-1.5 text-end font-medium">{t('الميزانية', 'Budget')}</th>
                        <th className="w-20 px-2 py-1.5 text-end font-medium">{t('الفعلي', 'Actual')}</th>
                        <th className="w-24 px-2 py-1.5 font-medium" />
                        <th className="w-12 px-2 py-1.5 text-end font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pl.lines.map((l) => {
                        const lu = lineUsage(l, s)
                        return (
                          <tr key={l.id}>
                            <td className="px-2 py-1">
                              <span className="num text-muted">{l.code}</span> {l.name[L]}
                            </td>
                            <td className="num px-2 py-1 text-end">{usd(lu.ceiling)}</td>
                            <td className="num px-2 py-1 text-end">{usd(lu.spent)}</td>
                            <td className="px-2 py-1">
                              <Bar v={lu.spent} max={lu.ceiling} />
                            </td>
                            <td className="num px-2 py-1 text-end">{lu.ceiling ? Math.round((lu.spent / lu.ceiling) * 100) : 0}%</td>
                          </tr>
                        )
                      })}
                      <tr className="bg-[#f7f9f9] font-semibold">
                        <td className="px-2 py-1">{t('إجمالي المحور', 'Pillar total')}</td>
                        <td className="num px-2 py-1 text-end">{usd(u.ceiling)}</td>
                        <td className="num px-2 py-1 text-end">{usd(u.spent)}</td>
                        <td />
                        <td className="num px-2 py-1 text-end">{u.ceiling ? Math.round((u.spent / u.ceiling) * 100) : 0}%</td>
                      </tr>
                    </tbody>
                  </table>
                </Block>
              )
            })}
            {reallocs.length > 0 && (
              <Block>
                <div className="mb-1 font-semibold">{t('المناقلات المعتمدة بين البنود', 'Approved reallocations between lines')}</div>
                <ul className="text-[11.5px]">
                  {reallocs.map((r) => (
                    <li key={r.id}>
                      • <span className="num">{usd(r.amountUSD)}</span> {t('من', 'from')} {findLine(s.projects, r.fromLineId)?.line.code} {t('إلى', 'to')} {findLine(s.projects, r.toLineId)?.line.code} — {r.reason[L]}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            <Block>
              <H n={2}>{t('الأنشطة المنفذة والمستفيدون', 'Activities and beneficiaries')}</H>
              <p className="mb-2">
                {t(
                  `نُفّذ ${acts.length} نشاطاً خلال الفترة، استفاد منها ${n0(people.m)} رجلاً و${n0(people.w)} امرأة و${n0(people.c)} طفلاً.`,
                  `${acts.length} activities were carried out in the period, reaching ${n0(people.m)} men, ${n0(people.w)} women and ${n0(people.c)} children.`,
                )}
              </p>
              <table className="w-full text-[11.5px]">
                <tbody className="divide-y divide-line">
                  {acts.map((a) => (
                    <tr key={a.id}>
                      <td className="num w-24 py-1 align-top text-muted">{a.code}</td>
                      <td className="py-1">
                        <b>{a.title[L]}</b>
                        <div className="text-muted">{a.report?.summary[L]}</div>
                      </td>
                      <td className="num w-16 py-1 text-end align-top">{n0(a.report?.beneficiaries ?? 0)}</td>
                    </tr>
                  ))}
                  {acts.length === 0 && (
                    <tr>
                      <td className="py-2 text-muted">{t('لا توجد أنشطة بتقارير في هذه الفترة.', 'No reported activities in this period.')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Block>
            {photos.length > 0 && (
              <Block>
                <div className="mb-2 font-semibold">{t('صور من الميدان', 'Photos from the field')}</div>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map(({ ph, a }, i) => (
                    <figure key={i}>
                      <img src={ph} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                      <figcaption className="mt-0.5 truncate text-[10px] text-muted">{a.title[L]}</figcaption>
                    </figure>
                  ))}
                </div>
              </Block>
            )}
            <Block className="pb-10">
              <div className="mt-4 grid grid-cols-2 gap-10 text-[12px]">
                <div>
                  <div className="text-muted">{t('أعدّه', 'Prepared by')}</div>
                  <div className="mt-6 border-t border-ink/40 pt-1.5 font-semibold">{s.users.find((u) => u.role === 'finance_manager')?.name[L]}</div>
                </div>
                <div>
                  <div className="text-muted">{t('اعتمده', 'Approved by')}</div>
                  <div className="mt-6 border-t border-ink/40 pt-1.5 font-semibold">{s.users.find((u) => u.role === 'executive_director')?.name[L]}</div>
                </div>
              </div>
            </Block>
          </div>
      </FitPreview>
      <div aria-hidden className="pointer-events-none fixed top-0 -left-[3000px]">
        <DocHeader ref={headRef} org={s.org} lang={rLang} title={`${p.code} — ${t('تقرير المانح', 'Donor report')}`} sub={label} />
      </div>
      {sending && (
        <SendModal
          title={{ ar: `تقرير ${p.code}`, en: `${p.code} report` }}
          defaults={settings}
          vars={{ project: p.code, period: label, donor: p.donor[lang], org: s.org.name[lang], sender: user.name[lang] }}
          makePdf={makePdf}
          onClose={() => setSending(false)}
          onSent={(r) => s.recordSent({ kind: 'donor', projectId: p.id, title: { ar: `تقرير المانح — ${p.code}`, en: `Donor report — ${p.code}` }, period, ...r })}
        />
      )}
    </div>
  )
}
