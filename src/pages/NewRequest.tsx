import { AlertTriangle, CheckCircle2, CircleAlert, Shuffle, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ReallocationModal } from '../components/ReallocationModal'
import { Button, Field, inputCls, PageHeader, Panel, UsageBar } from '../components/ui'
import { roleNames } from '../data/seed'
import { checkCeiling, routeApproval, type Level } from '../lib/budget'
import { num, sdg, usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { getOffices, usePerm, useStore, useUser } from '../lib/store'

const levelName: Record<Level, { ar: string; en: string }> = {
  line: { ar: 'البند', en: 'Line' },
  pillar: { ar: 'المحور', en: 'Pillar' },
  project: { ar: 'المشروع', en: 'Project' },
}

export function NewRequest() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const SDG_RATE = s.rates[s.rates.length - 1].rate
  const perm = usePerm()

  const fromActOffice = s.activities.find((x) => x.code === params.get('activity'))?.officeId
  const [projectId, setProjectId] = useState(params.get('project') ?? s.projects[0].id)
  const project = s.projects.find((p) => p.id === projectId)!
  const lineParam = params.get('line')
  const initialPillar = lineParam ? project.pillars.find((p) => p.lines.some((l) => l.id === lineParam))?.id : undefined
  const [pillarId, setPillarId] = useState(initialPillar ?? project.pillars[0].id)
  const pillar = project.pillars.find((p) => p.id === pillarId) ?? project.pillars[0]
  const [lineId, setLineId] = useState(lineParam ?? pillar.lines[0].id)
  const line = pillar.lines.find((l) => l.id === lineId) ?? pillar.lines[0]

  const [officeId, setOfficeId] = useState(fromActOffice ?? (user.officeId === 'khr' ? 'ksl' : user.officeId))
  const fromAct = s.activities.find((x) => x.code === params.get('activity'))
  const [currency, setCurrency] = useState<'SDG' | 'USD'>(params.get('amount') ? 'USD' : 'SDG')
  const [amount, setAmount] = useState<number | ''>(params.get('amount') ? +params.get('amount')! || '' : '')
  const [purpose, setPurpose] = useState(fromAct ? fromAct.title[lang] : '')
  const [activity, setActivity] = useState(params.get('activity') ?? '')
  const [realloc, setRealloc] = useState(false)

  useEffect(() => {
    if (!project.pillars.some((p) => p.id === pillarId)) setPillarId(project.pillars[0].id)
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pillar.lines.some((l) => l.id === lineId)) setLineId(pillar.lines[0].id)
  }, [pillarId]) // eslint-disable-line react-hooks/exhaustive-deps

  const amountUSD = amount === '' ? 0 : currency === 'USD' ? amount : amount / SDG_RATE
  const check = useMemo(() => checkCeiling(project, pillar, line, amountUSD, s), [project, pillar, line, amountUSD, s])
  const { chain } = routeApproval(s.rules, 'spend', amountUSD, check.verdict === 'needs_extra_approval', officeId)
  const canSubmit = amountUSD > 0 && purpose.trim().length > 2 && check.verdict !== 'blocked'

  const fillExample = () => {
    setProjectId('pa')
    setPillarId('pa-p1')
    setLineId('pa-p1-l1')
    setOfficeId('ksl')
    setCurrency('SDG')
    setAmount(4_500_000)
    setActivity('ACT-KSL-0142')
    setPurpose(ar ? 'يوم علاجي متنقل — قرية ود شريفي، ريف كسلا (وقود، أدوية، حوافز)' : 'Mobile medical day — Wad Sharifey village, rural Kassala (fuel, medicines, incentives)')
  }

  const submit = () => {
    const r = s.submitRequest({ officeId, projectId, lineId: line.id, amount: Number(amount), currency, purpose, activityCode: activity })
    if (r) nav(`/requests/${r.id}`)
  }

  const v = check.verdict
  const banner =
    amountUSD <= 0
      ? null
      : v === 'ok'
        ? { cls: 'bg-leaf-soft text-leaf', icon: <CheckCircle2 size={20} />, title: ar ? 'ضمن السقف' : 'Within the ceiling', body: ar ? 'المبلغ متاح على البند والمحور والمشروع.' : 'The amount is available on the line, pillar and project.' }
        : v === 'needs_extra_approval'
          ? {
              cls: 'bg-amber-soft text-amber',
              icon: <CircleAlert size={20} />,
              title: ar ? 'تجاوز ضمن السماحية' : 'Over, within tolerance',
              body: ar
                ? `يتجاوز المتاح بمقدار ${usd(check.shortfall)} لكنه ضمن سماحية ${project.tolerancePct}%. سيُضاف المدير التنفيذي لمسار الاعتماد.`
                : `Exceeds what is available by ${usd(check.shortfall)} but is within the ${project.tolerancePct}% tolerance. The Executive Director is added to the route.`,
            }
          : {
              cls: 'bg-crescent-soft text-crescent',
              icon: <AlertTriangle size={20} />,
              title: ar ? 'لا يمكن إرسال الطلب — تجاوز السقف' : 'Cannot send — over the ceiling',
              body: ar
                ? `البند ${line.code} ${line.name.ar} ينقصه ${usd(check.shortfall)}. اطلب مناقلة من بند آخر، أو خفّض المبلغ.`
                : `Line ${line.code} ${line.name.en} is short by ${usd(check.shortfall)}. Request a reallocation from another line, or lower the amount.`,
            }

  return (
    <div>
      <PageHeader
        title={ar ? 'طلب صرف جديد' : 'New spend request'}
        sub={ar ? 'اختر البند الذي سيُصرف عليه. يتحقق النظام من السقف قبل الإرسال.' : 'Choose the budget line to spend from. The system checks the ceiling before you send.'}
        actions={
          <Button variant="quiet" onClick={fillExample}>
            <Wand2 size={16} /> {ar ? 'تعبئة مثال العرض' : 'Fill demo example'}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
        <Panel className="space-y-4 p-5">
          <Field label={ar ? 'المكتب' : 'Office'}>
            <select className={inputCls} value={officeId} onChange={(e) => setOfficeId(e.target.value)} disabled={!!perm.scopeOffice}>
              {getOffices().map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'المشروع' : 'Project'}>
            <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {s.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name[lang]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={ar ? 'المحور' : 'Pillar'}>
              <select className={inputCls} value={pillar.id} onChange={(e) => setPillarId(e.target.value)}>
                {project.pillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}. {p.name[lang]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={ar ? 'البند' : 'Line'}>
              <select className={inputCls} value={line.id} onChange={(e) => setLineId(e.target.value)}>
                {pillar.lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} {l.name[lang]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field
              label={ar ? 'المبلغ' : 'Amount'}
              hint={
                currency === 'SDG' && amountUSD > 0
                  ? ar
                    ? `≈ ${usd(amountUSD)} بسعر ${num(SDG_RATE)} ج.س للدولار (سعر اليوم)`
                    : `≈ ${usd(amountUSD)} at ${num(SDG_RATE)} SDG per USD (today’s rate)`
                  : currency === 'USD' && amountUSD > 0
                    ? `≈ ${sdg(amountUSD * SDG_RATE, lang)}`
                    : undefined
              }
            >
              <input
                type="number"
                min={0}
                inputMode="decimal"
                className={`${inputCls} num`}
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Math.max(0, +e.target.value))}
                placeholder="0"
              />
            </Field>
            <Field label={ar ? 'العملة' : 'Currency'}>
              <div className="flex h-10 rounded-md border border-line p-0.5">
                {(['SDG', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`rounded px-3 text-[13.5px] ${currency === c ? 'bg-nile text-white' : 'text-muted hover:text-ink'}`}
                  >
                    {c === 'SDG' ? (ar ? 'جنيه سوداني' : 'SDG') : ar ? 'دولار' : 'USD'}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label={ar ? 'الغرض من الصرف' : 'Purpose'}>
            <textarea className={`${inputCls} h-20 py-2`} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
          <Field
            label={ar ? 'رقم النشاط' : 'Activity number'}
            hint={ar ? 'يربط هذا الصرف بالتقرير الفني للنشاط نفسه — أساس المطابقة.' : 'Links this spend to the same activity’s field report — the basis of matching.'}
          >
            <input className={`${inputCls} num`} value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="ACT-KSL-0142" dir="ltr" list="acts" />
            <datalist id="acts">
              {s.activities
                .filter((x) => x.officeId === officeId)
                .map((x) => (
                  <option key={x.id} value={x.code}>
                    {x.title[lang]}
                  </option>
                ))}
            </datalist>
          </Field>
        </Panel>

        <div className="space-y-4">
          {banner ? (
            <div className={`flex gap-3 rounded-lg p-4 ${banner.cls}`} role="status">
              <span className="mt-0.5 shrink-0">{banner.icon}</span>
              <div>
                <div className="font-semibold">{banner.title}</div>
                <p className="mt-0.5 text-[14px] text-ink/80">{banner.body}</p>
                {v === 'blocked' && (
                  <Button variant="danger" className="mt-3" onClick={() => setRealloc(true)}>
                    <Shuffle size={16} /> {ar ? `طلب مناقلة ${usd(check.shortfall)} لهذا البند` : `Request a ${usd(check.shortfall)} reallocation`}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line p-4 text-[14px] text-muted">
              {ar ? 'أدخل المبلغ لرؤية أثره على السقوف الثلاثة.' : 'Enter an amount to see its effect on the three ceilings.'}
            </div>
          )}

          <Panel title={ar ? 'التحقق من السقف' : 'Ceiling check'}>
            <ul className="divide-y divide-line">
              {check.levels.map((lv) => {
                const label = lv.level === 'line' ? `${line.code} ${line.name[lang]}` : lv.level === 'pillar' ? `${pillar.code}. ${pillar.name[lang]}` : project.code
                return (
                  <li key={lv.level} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[12.5px] text-muted">{levelName[lv.level][lang]}</span>
                        <div className="truncate font-medium">{label}</div>
                      </div>
                      <div className="num shrink-0 text-end text-[13.5px]">
                        <div>
                          <span className="text-muted">{ar ? 'المتاح' : 'Available'}</span> {usd(lv.usage.available)}{' '}
                          <span className="text-muted">/ {usd(lv.usage.ceiling)}</span>
                        </div>
                        {amountUSD > 0 && (
                          <div className={lv.ok ? 'text-leaf' : lv.withinTolerance && project.controlMode === 'soft' ? 'text-amber' : 'text-crescent'}>
                            {ar ? 'بعد الطلب' : 'After request'} {usd(lv.after)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <UsageBar u={lv.usage} incoming={amountUSD} height={10} showTolerance={project.controlMode === 'soft' ? project.tolerancePct / 100 : 0} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel className="p-5">
            <div className="text-[13px] text-muted">{ar ? 'مسار الاعتماد المتوقع' : 'Approval route'}</div>
            <ol className="mt-2 flex flex-wrap items-center gap-2">
              {chain.map((r, i) => (
                <li key={r} className="flex items-center gap-2">
                  <span className="rounded-md bg-nile-soft px-2.5 py-1 text-[13.5px] text-nile">
                    <span className="num me-1.5 text-nile/60">{i + 1}</span>
                    {roleNames[r][lang]}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex justify-end">
              <Button onClick={submit} disabled={!canSubmit}>
                {ar ? 'إرسال للاعتماد' : 'Send for approval'}
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      <ReallocationModal open={realloc} onClose={() => setRealloc(false)} project={project} toLineId={line.id} suggested={check.shortfall} />
    </div>
  )
}
