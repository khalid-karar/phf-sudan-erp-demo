import { forwardRef, type ReactNode } from 'react'
import type { Bi, HqDraft, Lang, OrgSettings, User } from '../../data/types'
import { autoSummary, defaultChallenges, periodLabel, type MonthlyData } from '../../lib/reportData'

const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const usd = (v: number) => `⁦${v < 0 ? '−' : ''}$${n0(Math.abs(v))}⁩`
const pct = (v: number) => `${Math.round(v * 100)}%`

/** A4 width at 96 dpi; every direct child marked data-block becomes an unsplittable PDF block. */
export const PAGE_W = 794

export function Block({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div data-block className={`bg-white px-10 py-5 ${className}`}>
      {children}
    </div>
  )
}

export function H({ n, children }: { n?: number; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 border-b-2 border-nile pb-1.5 font-kufi text-[17px] font-bold text-nile">
      {n !== undefined && <span className="num grid size-6 place-items-center rounded bg-nile text-[12px] text-white">{n}</span>}
      {children}
    </h2>
  )
}

export function Bar({ v, max, tone = 'bg-nile' }: { v: number; max: number; tone?: string }) {
  return (
    <div className="h-2 w-full rounded-[2px] bg-[#eef1f2]">
      <div className={`h-full rounded-[2px] ${tone}`} style={{ width: `${max ? Math.min(100, (v / max) * 100) : 0}%` }} />
    </div>
  )
}

export const DocHeader = forwardRef<HTMLDivElement, { org: OrgSettings; title: string; sub: string; lang: Lang }>(function DocHeader({ org, title, sub, lang }, ref) {
  return (
    <div ref={ref} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ width: PAGE_W }} className="flex items-center justify-between bg-white px-10 pt-4 pb-2 font-plex">
      <div className="flex items-center gap-2.5">
        <img src={org.logo} alt="" className="h-12 w-auto object-contain" />
        <div className="leading-tight">
          <div className="text-[12px] font-semibold text-nile">{org.name[lang]}</div>
          <div className="text-[10.5px] text-muted">{org.shortName[lang]}</div>
        </div>
      </div>
      <div className="text-end leading-tight">
        <div className="text-[12px] font-semibold">{title}</div>
        <div className="text-[10.5px] text-muted">{sub}</div>
      </div>
    </div>
  )
})

export function HqReportDoc({
  d,
  draft,
  org,
  lang,
  sections,
  preparer,
  approver,
}: {
  d: MonthlyData
  draft?: HqDraft
  org: OrgSettings
  lang: Lang
  sections: Record<string, boolean>
  preparer?: User
  approver?: User
}) {
  const ar = lang === 'ar'
  const t = (a: string, e: string) => (ar ? a : e)
  const month = periodLabel(d.period, ar)
  const text = (b: Bi | undefined, fallback: string) => (b?.[lang]?.trim() ? b[lang] : fallback)
  const maxBen = Math.max(1, ...d.byOffice.map((o) => o.beneficiaries))
  const maxSpend = Math.max(1, ...d.byOffice.map((o) => o.spent))
  let n = 0
  const sec = (k: string) => sections[k] !== false

  return (
    <div dir={ar ? 'rtl' : 'ltr'} style={{ width: PAGE_W }} className="bg-white font-plex text-[12.5px] leading-relaxed text-ink">
      <Block className="pt-8">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={org.logo} alt="" className="h-24 w-auto object-contain" />
            <div className="leading-tight">
              <div className="font-kufi text-[15px] font-bold text-nile">{org.name[lang]}</div>
              <div className="text-[11.5px] text-muted">{org.shortName[lang]}</div>
            </div>
          </div>
          <div className="rounded border border-line px-3 py-1.5 text-[11px] leading-snug text-muted">
            <div>
              {t('رقم التقرير', 'Report no.')}: <span className="num text-ink">HQ-SD-{d.period}</span>
            </div>
            <div>
              {t('تاريخ الإصدار', 'Issued')}: <span className="num text-ink">{new Date().toLocaleDateString(ar ? 'ar-SD-u-nu-latn' : 'en-GB')}</span>
            </div>
          </div>
        </div>
        <div className="mt-7 border-s-4 border-crescent ps-4">
          <div className="text-[12px] text-muted">{t('التقرير الشهري', 'Monthly report')}</div>
          <h1 className="font-kufi text-[28px] font-bold leading-tight">{t(`تقرير مكتب السودان — ${month}`, `Sudan Office Report — ${month}`)}</h1>
          <div className="mt-1 text-[13px]">
            {t('مقدّم إلى:', 'Submitted to:')} <b>{org.hqName[lang]}</b>
          </div>
        </div>
      </Block>

      <Block>
        <div className="grid grid-cols-5 divide-x divide-line overflow-hidden rounded-md border border-line rtl:divide-x-reverse">
          {(
            [
              [t('أنشطة منفذة', 'Activities done'), n0(d.doneCount)],
              [t('المستفيدون', 'Beneficiaries'), n0(d.beneficiaries)],
              [t('الصرف خلال الشهر', 'Spent in month'), usd(d.spent)],
              [t('المنح الواردة', 'Grants received'), usd(d.received)],
              [t('مطابقة التقارير', 'Reports matched'), pct(d.compliance)],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="bg-[#f7f9f9] px-3 py-3 text-center">
              <div className="num font-kufi text-[19px] font-bold text-nile">{v}</div>
              <div className="text-[10.5px] text-muted">{k}</div>
            </div>
          ))}
        </div>
      </Block>

      <Block>
        <H n={++n}>{t('الملخص التنفيذي', 'Executive summary')}</H>
        <p className="whitespace-pre-line">{text(draft?.summary, autoSummary(d, ar))}</p>
      </Block>

      {sec('finance') && (
        <Block>
          <H n={++n}>{t('الموقف المالي', 'Financial position')}</H>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-nile text-white">
                <th className="px-2 py-1.5 text-start font-medium">{t('البند', 'Item')}</th>
                <th className="px-2 py-1.5 text-end font-medium">{t('خلال الشهر', 'This month')}</th>
                <th className="px-2 py-1.5 text-end font-medium">{t('منذ بداية المنح', 'To date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-2 py-1.5">{t('الدعم النقدي الوارد', 'Cash support received')}</td>
                <td className="num px-2 py-1.5 text-end">{usd(d.received)}</td>
                <td className="num px-2 py-1.5 text-end">{usd(d.cashFund.received)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5">{t('المصروف', 'Spent')}</td>
                <td className="num px-2 py-1.5 text-end">{usd(d.spent)}</td>
                <td className="num px-2 py-1.5 text-end">{usd(d.cashFund.spent)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5">{t('فروق العملة (ربح / خسارة)', 'FX difference (gain / loss)')}</td>
                <td className="num px-2 py-1.5 text-end">{usd(d.fx)}</td>
                <td className="px-2 py-1.5 text-end text-muted">—</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5">{t('عهد مفتوحة لدى الموظفين', 'Open staff advances')}</td>
                <td className="px-2 py-1.5 text-end text-muted">—</td>
                <td className="num px-2 py-1.5 text-end">{usd(d.openAdvTotal)}</td>
              </tr>
              {d.inKind && sec('supply') && (
                <tr>
                  <td className="px-2 py-1.5">{t('التغذية العينية الواردة / المصروفة', 'In-kind received / issued')}</td>
                  <td className="num px-2 py-1.5 text-end">
                    {usd(d.inKind.received)} / {usd(d.inKind.issued)}
                  </td>
                  <td className="px-2 py-1.5 text-end text-muted">—</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">{t(`المبالغ بالدولار؛ سعر الصرف في نهاية الشهر ${n0(d.rate)} جنيه للدولار.`, `Amounts in USD; month-end rate ${n0(d.rate)} SDG per USD.`)}</p>
        </Block>
      )}

      {sec('finance') && (
        <Block>
          <div className="mb-2 font-semibold">{t('الصرف حسب المكتب', 'Spending by office')}</div>
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-line">
              {d.byOffice
                .filter((o) => o.spent > 0)
                .sort((a, b) => b.spent - a.spent)
                .map((o) => (
                  <tr key={o.office.id}>
                    <td className="w-32 py-1.5 pe-2">{o.office.name[lang]}</td>
                    <td className="py-1.5 pe-3">
                      <Bar v={o.spent} max={maxSpend} />
                    </td>
                    <td className="num w-24 py-1.5 text-end">{usd(o.spent)}</td>
                    <td className="num w-28 py-1.5 text-end text-muted">{t(`${o.matched}/${o.expenses} مطابق`, `${o.matched}/${o.expenses} matched`)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Block>
      )}

      {sec('projects') && (
        <Block>
          <H n={++n}>{t('تقدم المشاريع', 'Project progress')}</H>
          {d.projects.map(({ project: p, usage: u, elapsed, burn, monthSpent, pillars }) => (
            <div key={p.id} className="mb-4 last:mb-0">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-semibold">
                  {p.code} — {p.name[lang]}
                </div>
                <div className="text-[11px] text-muted">{p.donor[lang]}</div>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-2 text-[11.5px]">
                <div>
                  {t('الميزانية', 'Budget')} <b className="num">{usd(u.ceiling)}</b>
                </div>
                <div>
                  {t('المصروف', 'Spent')} <b className="num">{usd(u.spent)}</b> ({pct(burn)})
                </div>
                <div>
                  {t('هذا الشهر', 'This month')} <b className="num">{usd(monthSpent)}</b>
                </div>
                <div>
                  {t('الوقت المنقضي', 'Time elapsed')} <b className="num">{pct(elapsed)}</b>
                </div>
              </div>
              <table className="mt-2 w-full text-[11.5px]">
                <tbody className="divide-y divide-line">
                  {pillars.map(({ pillar, usage }) => (
                    <tr key={pillar.id}>
                      <td className="py-1 pe-2">
                        {pillar.code}. {pillar.name[lang]}
                      </td>
                      <td className="w-40 py-1 pe-2">
                        <Bar v={usage.spent} max={usage.ceiling} tone={usage.spent / usage.ceiling > 0.85 ? 'bg-crescent' : 'bg-nile'} />
                      </td>
                      <td className="num w-36 py-1 text-end">
                        {usd(usage.spent)} / {usd(usage.ceiling)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {Math.abs(burn - elapsed) > 0.15 && (
                <p className="mt-1 text-[11px] text-amber">
                  {burn < elapsed
                    ? t('الصرف أبطأ من الجدول الزمني للمشروع.', 'Spending is behind the project timeline.')
                    : t('الصرف أسرع من الجدول الزمني للمشروع.', 'Spending is ahead of the project timeline.')}
                </p>
              )}
            </div>
          ))}
        </Block>
      )}

      {sec('activities') && (
        <Block>
          <H n={++n}>{t('الأنشطة الميدانية والمستفيدون', 'Field activities and beneficiaries')}</H>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {(
              [
                [t('رجال', 'Men'), d.people.men],
                [t('نساء', 'Women'), d.people.women],
                [t('أطفال', 'Children'), d.people.children],
              ] as [string, number][]
            ).map(([k, v]) => (
              <div key={k} className="rounded bg-[#f7f9f9] py-2">
                <div className="num font-kufi text-[16px] font-bold">{n0(v)}</div>
                <div className="text-[10.5px] text-muted">{k}</div>
              </div>
            ))}
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-muted">
                <th className="py-1 text-start font-medium">{t('المكتب', 'Office')}</th>
                <th className="py-1 text-center font-medium">{t('الأنشطة', 'Activities')}</th>
                <th className="py-1 font-medium" />
                <th className="py-1 text-end font-medium">{t('المستفيدون', 'Beneficiaries')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.byOffice
                .filter((o) => o.activities > 0)
                .map((o) => (
                  <tr key={o.office.id}>
                    <td className="w-32 py-1.5">{o.office.name[lang]}</td>
                    <td className="num w-20 py-1.5 text-center">{o.activities}</td>
                    <td className="py-1.5 pe-3">
                      <Bar v={o.beneficiaries} max={maxBen} tone="bg-leaf" />
                    </td>
                    <td className="num w-20 py-1.5 text-end">{n0(o.beneficiaries)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {d.highlights.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11.5px] font-semibold">{t('أبرز الأنشطة', 'Highlights')}</div>
              <ul className="space-y-0.5 text-[11.5px]">
                {d.highlights.map((a) => (
                  <li key={a.id}>
                    • <b>{a.title[lang]}</b> — {a.summary[lang]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Block>
      )}

      {sec('compliance') && (
        <Block>
          <H n={++n}>{t('الرقابة والالتزام', 'Control and compliance')}</H>
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-line">
              {(
                [
                  [t('المصروفات المطابقة بتقارير فنية', 'Expenses matched to field reports'), pct(d.compliance)],
                  [t('فجوات مطابقة قائمة', 'Open matching gaps'), n0(d.gapCount)],
                  [t('عهد متأخرة عن التسوية', 'Advances past settlement date'), `${d.overdueAdvCount} (${usd(d.overdueAdvTotal)})`],
                  [t('طلبات صرف جديدة / بُتّ فيها', 'Spend requests new / decided'), `${d.reqCount} / ${d.decidedCount}`],
                  [t('متوسط زمن الاعتماد', 'Average approval time'), d.avgApprovalHours === null ? '—' : t(`${Math.round(d.avgApprovalHours)} ساعة`, `${Math.round(d.avgApprovalHours)} hours`)],
                  [t('مكاتب أقفلت الشهر', 'Offices that closed the month'), `${d.byOffice.filter((o) => o.closed).length} / ${d.byOffice.length}`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5">{k}</td>
                  <td className="num py-1.5 text-end font-semibold">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}

      {d.staff && sec('hr') && (
        <Block>
          <H n={++n}>{t('الموارد البشرية', 'Human resources')}</H>
          <p>{t(`عدد الموظفين العاملين ${d.staff.total} موظفاً موزعين على ${d.staff.offices} مكاتب.`, `${d.staff.total} active staff across ${d.staff.offices} offices.`)}</p>
        </Block>
      )}

      {sec('challenges') && (
        <Block>
          <H n={++n}>{t('التحديات والاحتياجات', 'Challenges and needs')}</H>
          <p className="whitespace-pre-line">{text(draft?.challenges, defaultChallenges[lang])}</p>
        </Block>
      )}

      {sec('plan') && (
        <Block>
          <H n={++n}>{t('خطة الشهر القادم', 'Plan for next month')}</H>
          {draft?.plan?.[lang]?.trim() && <p className="mb-2 whitespace-pre-line">{draft.plan[lang]}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 text-[11.5px] font-semibold">{t('أنشطة مخططة', 'Planned activities')}</div>
              <ul className="space-y-0.5 text-[11.5px]">
                {d.plannedNext.map((a) => (
                  <li key={a.id}>
                    • <span className="num">{new Date(a.date).toLocaleDateString(ar ? 'ar-SD-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' })}</span> — {a.title[lang]}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-[11.5px] font-semibold">{t('مواعيد قادمة', 'Upcoming deadlines')}</div>
              <ul className="space-y-0.5 text-[11.5px]">
                {d.upcoming.map((x) => (
                  <li key={x.id}>
                    • <span className="num">{new Date(x.due).toLocaleDateString(ar ? 'ar-SD-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' })}</span> — {x.title[lang]}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Block>
      )}

      <Block className="pb-10">
        <div className="mt-4 grid grid-cols-2 gap-10 text-[12px]">
          {(
            [
              [t('أعدّه', 'Prepared by'), preparer],
              [t('اعتمده', 'Approved by'), approver],
            ] as [string, User | undefined][]
          ).map(([k, u]) => (
            <div key={k}>
              <div className="text-muted">{k}</div>
              <div className="mt-6 border-t border-ink/40 pt-1.5 font-semibold">{u?.name[lang] ?? '—'}</div>
            </div>
          ))}
        </div>
      </Block>
    </div>
  )
}
