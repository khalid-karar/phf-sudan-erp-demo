import { BellRing, CheckCircle2, FileQuestion, FileX2, Link2, Sparkles, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Modal, PageHeader, Panel } from '../../components/ui'
import { findLine } from '../../lib/budget'
import { date, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { matchingGaps, usePerm, useStore, type Gap } from '../../lib/store'

const kindInfo = {
  spend_no_report: {
    icon: <FileX2 size={18} />,
    ar: 'صرف بلا تقرير فني',
    en: 'Spending with no field report',
    dAr: 'خرج المال ولم يُربط بتقرير يوضح ما تم.',
    dEn: 'Money went out but isn’t linked to a report of what was done.',
  },
  report_overdue: {
    icon: <FileQuestion size={18} />,
    ar: 'تقرير متأخر',
    en: 'Report overdue',
    dAr: 'مرّت أكثر من 5 أيام على النشاط دون تقرير.',
    dEn: 'More than 5 days since the activity, no report.',
  },
  report_no_spend: {
    icon: <Wallet size={18} />,
    ar: 'تقرير بلا صرف',
    en: 'Report with no spending',
    dAr: 'نُفّذ النشاط ورُفع تقريره، لكن لم يُربط به أي صرف.',
    dEn: 'The activity was reported, but no spending is linked to it.',
  },
}

const age = (iso: string) => Math.max(0, Math.round((Date.now() - +new Date(iso)) / 86_400_000))
const bucket = (d: number) => (d <= 7 ? 0 : d <= 14 ? 1 : d <= 30 ? 2 : 3)

export function Reconciliation() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can, scopeOffice } = usePerm()
  const [linking, setLinking] = useState<Gap | null>(null)
  const gaps = useMemo(() => matchingGaps(s).filter((g) => !scopeOffice || g.officeId === scopeOffice), [s, scopeOffice])
  const canAct = can('activities', 'edit') || can('finance', 'edit')

  // Suggested matches: an expense with no report and a reported activity with no spending, same office and line, within 14 days.
  const suggestions = useMemo(() => {
    const out: { expenseId: string; activityId: string; score: number }[] = []
    const exp = gaps.filter((g) => g.kind === 'spend_no_report') as Extract<Gap, { kind: 'spend_no_report' }>[]
    const reps = gaps.filter((g) => g.kind === 'report_no_spend') as Extract<Gap, { kind: 'report_no_spend' }>[]
    for (const e of exp)
      for (const r of reps) {
        const a = s.activities.find((x) => x.id === r.activityId)!
        if (e.officeId !== r.officeId) continue
        const days = Math.abs(+new Date(e.date) - +new Date(a.report?.doneOn ?? a.date)) / 86_400_000
        if (days > 14) continue
        const sameLine = e.lineId === a.lineId
        out.push({ expenseId: e.expenseId, activityId: a.id, score: (sameLine ? 2 : 0) + (days <= 3 ? 1 : 0) })
      }
    out.sort((x, y) => y.score - x.score)
    const usedA = new Set<string>()
    const usedE = new Set<string>()
    return out.filter((x) => !usedA.has(x.activityId) && !usedE.has(x.expenseId) && (usedA.add(x.activityId), usedE.add(x.expenseId), true))
  }, [gaps, s.activities])

  const officesWithGaps = s.offices
    .map((o) => {
      const og = gaps.filter((g) => g.officeId === o.id)
      const b = [0, 0, 0, 0]
      og.forEach((g) => b[bucket(age(g.date))]++)
      return { o, n: og.length, usd: og.filter((g) => g.kind === 'spend_no_report').reduce((t, g) => t + g.amountUSD, 0), b }
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)

  const remind = (g: Gap) => {
    const office = s.offices.find((o) => o.id === g.officeId)
    const mgr = s.users.find((u) => u.officeId === g.officeId && (u.role === 'field_officer' || u.role === 'supervisor'))
    s.toast({
      ar: `أُرسل تذكير إلى ${mgr?.name.ar ?? `مكتب ${office?.name.ar}`}`,
      en: `Reminder sent to ${mgr?.name.en ?? `${office?.name.en} office`}`,
    })
  }

  return (
    <div>
      <PageHeader
        title={ar ? 'المطابقة الفنية والمالية' : 'Technical–financial matching'}
        sub={
          ar
            ? 'بدلاً من مطابقة التقارير يدوياً في نهاية الشهر، يعرض النظام هنا فقط ما لم يلتقِ بعد، مع اقتراح المطابقة حين يجد تقريراً ومصروفاً متشابهين.'
            : 'Instead of matching reports by hand at month end, this shows only what hasn’t met yet, and suggests a match when it finds a similar report and expense.'
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {(Object.keys(kindInfo) as (keyof typeof kindInfo)[]).map((k) => {
          const g = gaps.filter((x) => x.kind === k)
          return (
            <div key={k} className="rounded-lg border border-line bg-surface p-4">
              <div className={`flex items-center gap-2 text-[13.5px] font-medium ${g.length ? (k === 'spend_no_report' ? 'text-crescent' : 'text-amber') : 'text-leaf'}`}>
                {kindInfo[k].icon} {ar ? kindInfo[k].ar : kindInfo[k].en}
              </div>
              <div className="num mt-1 font-kufi text-[26px] font-semibold">{g.length}</div>
              <div className="text-[12.5px] text-muted">{ar ? kindInfo[k].dAr : kindInfo[k].dEn}</div>
            </div>
          )
        })}
      </div>

      {suggestions.length > 0 && (
        <Panel className="mb-6 border-nile-2/40" title={<span className="inline-flex items-center gap-2"><Sparkles size={17} className="text-nile" /> {ar ? 'مطابقات مقترحة' : 'Suggested matches'}</span>}>
          <ul className="divide-y divide-line">
            {suggestions.map((sg) => {
              const e = s.expenses.find((x) => x.id === sg.expenseId)!
              const a = s.activities.find((x) => x.id === sg.activityId)!
              const fe = findLine(s.projects, e.lineId)
              return (
                <li key={sg.expenseId + sg.activityId} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
                  <div className="text-[14px]">
                    <div className="text-[12px] text-muted">{ar ? 'مصروف بلا تقرير' : 'Expense with no report'}</div>
                    <div className="num font-medium">
                      {usd(e.amountUSD)} — {fe?.line.code} {fe?.line.name[lang]}
                    </div>
                    <div className="num text-[12.5px] text-muted">{date(e.date, lang)}</div>
                  </div>
                  <Link2 className="hidden text-nile md:block" size={18} />
                  <div className="text-[14px]">
                    <div className="text-[12px] text-muted">{ar ? 'تقرير بلا صرف' : 'Report with no spending'}</div>
                    <Link to={`/activities/${a.id}`} className="font-medium hover:text-nile">
                      <span className="num">{a.code}</span> — {a.title[lang]}
                    </Link>
                    <div className="num text-[12.5px] text-muted">
                      {a.report?.no}، {date(a.report?.doneOn ?? a.date, lang)}
                    </div>
                  </div>
                  <Button className="h-9" disabled={!canAct} onClick={() => s.linkExpense(e.id, a.code)}>
                    <CheckCircle2 size={16} /> {ar ? 'تأكيد المطابقة' : 'Confirm match'}
                  </Button>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-muted">
            {ar ? 'يقترح النظام المطابقة عندما يكون المصروف والتقرير من المكتب نفسه وخلال 14 يوماً. القرار لك.' : 'Suggested when the expense and report are from the same office within 14 days. You decide.'}
          </p>
        </Panel>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title={ar ? 'ما لم يُطابق بعد' : 'Not matched yet'}>
          {gaps.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="mx-auto text-leaf" size={32} />
              <p className="mt-2 font-medium">{ar ? 'كل الصرف مطابق بتقاريره الفنية.' : 'All spending is matched to its field reports.'}</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {gaps
                .sort((a, b) => age(b.date) - age(a.date))
                .map((g) => {
                  const office = s.offices.find((o) => o.id === g.officeId)
                  const a = 'activityId' in g ? s.activities.find((x) => x.id === g.activityId) : undefined
                  const f = findLine(s.projects, g.lineId)
                  const d = age(g.date)
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-md ${g.kind === 'spend_no_report' ? 'bg-crescent-soft text-crescent' : 'bg-amber-soft text-amber'}`}>{kindInfo[g.kind].icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-muted">
                          {ar ? kindInfo[g.kind].ar : kindInfo[g.kind].en}
                          {ar ? '، ' : ', '}
                          {office?.name[lang]}
                        </div>
                        <div className="truncate text-[14px] font-medium">
                          {a ? (
                            <Link to={`/activities/${a.id}`} className="hover:text-nile">
                              <span className="num">{a.code}</span> — {a.title[lang]}
                            </Link>
                          ) : (
                            <span className="num">
                              {usd(g.amountUSD)} — {f?.line.code} {f?.line.name[lang]}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`num shrink-0 text-[13px] ${d > 14 ? 'font-medium text-crescent' : 'text-muted'}`}>{ar ? `منذ ${d} يوماً` : `${d} days`}</span>
                      <div className="flex shrink-0 gap-1.5">
                        {g.kind !== 'report_overdue' && canAct && (
                          <Button variant="quiet" className="h-8 px-2.5 text-[13px]" onClick={() => setLinking(g)}>
                            <Link2 size={14} /> {ar ? 'ربط' : 'Link'}
                          </Button>
                        )}
                        <Button variant="quiet" className="h-8 px-2.5 text-[13px]" onClick={() => remind(g)}>
                          <BellRing size={14} /> {ar ? 'تذكير' : 'Remind'}
                        </Button>
                      </div>
                    </li>
                  )
                })}
            </ul>
          )}
        </Panel>

        <Panel title={ar ? 'حسب المكتب وعمر الفجوة' : 'By office and age'}>
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                <th className="px-5 py-2 text-start font-medium">{ar ? 'المكتب' : 'Office'}</th>
                <th className="py-2 text-center font-medium">0–7</th>
                <th className="py-2 text-center font-medium">8–14</th>
                <th className="py-2 text-center font-medium">15–30</th>
                <th className="py-2 pe-5 text-center font-medium">30+</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {officesWithGaps.map(({ o, b }) => (
                <tr key={o.id}>
                  <td className="px-5 py-2">{o.name[lang]}</td>
                  {b.map((n, i) => (
                    <td key={i} className={`num py-2 text-center ${i === 3 ? 'pe-5' : ''}`}>
                      {n ? <span className={`inline-block min-w-6 rounded px-1.5 ${i >= 2 ? 'bg-crescent-soft text-crescent' : 'bg-amber-soft text-amber'}`}>{n}</span> : <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {officesWithGaps.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted">
                    {ar ? 'لا فجوات.' : 'No gaps.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-muted">{ar ? 'الأعمدة بالأيام منذ الصرف أو موعد التقرير.' : 'Columns are days since the spending or report due date.'}</p>
        </Panel>
      </div>
      {linking && <LinkModal gap={linking} onClose={() => setLinking(null)} />}
    </div>
  )
}

function LinkModal({ gap, onClose }: { gap: Gap; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const isExpense = gap.kind === 'spend_no_report'
  const candidates = isExpense
    ? s.activities.filter((a) => a.officeId === gap.officeId && a.report).map((a) => ({ id: a.code, label: `${a.code} — ${a.title[lang]}`, sub: `${a.report!.no}، ${date(a.report!.doneOn ?? a.date, lang)}` }))
    : s.expenses
        .filter((e) => e.officeId === gap.officeId && !e.hasTechReport)
        .map((e) => ({ id: e.id, label: `${usd(e.amountUSD)} — ${findLine(s.projects, e.lineId)?.line.code} ${findLine(s.projects, e.lineId)?.line.name[lang]}`, sub: date(e.date, lang) }))
  const [pick, setPick] = useState(candidates[0]?.id ?? '')
  const act = 'activityId' in gap ? s.activities.find((a) => a.id === gap.activityId) : undefined
  return (
    <Modal open onClose={onClose} title={isExpense ? (ar ? 'ربط المصروف بنشاط له تقرير' : 'Link expense to a reported activity') : ar ? 'ربط التقرير بمصروف' : 'Link report to an expense'}>
      {candidates.length === 0 ? (
        <p className="text-muted">{ar ? 'لا توجد عناصر مناسبة في المكتب نفسه.' : 'Nothing suitable in the same office.'}</p>
      ) : (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {candidates.map((c) => (
            <label key={c.id} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${pick === c.id ? 'border-nile-2 bg-nile-soft/50' : 'border-line'}`}>
              <input type="radio" name="lk" className="mt-1" checked={pick === c.id} onChange={() => setPick(c.id)} />
              <span>
                <span className="num block text-[14px]">{c.label}</span>
                <span className="num block text-[12.5px] text-muted">{c.sub}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {!isExpense && act && (
        <button
          className="mt-3 text-[13.5px] text-nile hover:underline"
          onClick={async () => {
            if ((await s.saveActivity({ ...act, inKind: true })) === null) return
            onClose()
          }}
        >
          {ar ? 'هذا النشاط نُفّذ بمواد عينية فقط — لا يحتاج صرفاً نقدياً' : 'This activity used in-kind supplies only — no cash spending needed'}
        </button>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button
          disabled={!pick}
          onClick={async () => {
            const r = isExpense ? await s.linkExpense((gap as Extract<Gap, { kind: 'spend_no_report' }>).expenseId, pick) : act ? await s.linkExpense(pick, act.code) : undefined
            if (r === false) return
            onClose()
          }}
        >
          {ar ? 'ربط' : 'Link'}
        </Button>
      </div>
    </Modal>
  )
}
