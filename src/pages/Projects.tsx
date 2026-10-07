import { ChevronDown, FileSpreadsheet, Lock, Plus, Shuffle, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ImportBudgetModal } from '../components/ImportBudgetModal'
import { LIVE } from '../api/http'
import { NewProjectModal } from '../components/NewProjectModal'
import { ReallocationModal } from '../components/ReallocationModal'
import { Button, PageHeader, Panel, StatusBadge, UsageBar, UsageLegend } from '../components/ui'
import { lineUsage, pillarUsage, projectUsage, reallocDelta, findLine } from '../lib/budget'
import { date, usd } from '../lib/format'
import { useLang, useT } from '../lib/i18n'
import { usePerm, useStore, useUser } from '../lib/store'

export function ProjectsList() {
  const lang = useLang()
  const s = useStore()
  const ar = lang === 'ar'
  const { can } = usePerm()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  return (
    <div>
      <PageHeader
        actions={
          can('projects', 'manage') && (
            <div className="flex gap-2">
              {LIVE && (
                <Button variant="quiet" onClick={() => setImporting(true)}>
                  <FileSpreadsheet size={16} /> {ar ? 'استيراد من ملف المانح' : 'Import donor budget'}
                </Button>
              )}
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> {ar ? 'مشروع جديد' : 'New project'}
              </Button>
            </div>
          )
        }
        title={ar ? 'المشاريع والميزانيات' : 'Projects & budgets'}
        sub={ar ? 'كل مشروع مقسّم إلى محاور، وكل محور إلى بنود لها سقف صرف. لا يُصرف أي مبلغ إلا على بند محدد.' : 'Each project is split into pillars, and each pillar into lines with a spending ceiling. Nothing is spent without a line.'}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {s.projects.map((p) => {
          const u = projectUsage(p, s)
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg border border-line bg-surface p-5 hover:border-nile-2">
              <div className="flex items-center justify-between text-[12.5px] text-muted">
                <span>{p.code}</span>
                <span className="inline-flex items-center gap-1">
                  {p.controlMode === 'hard' ? <Lock size={13} /> : <SlidersHorizontal size={13} />}
                  {p.controlMode === 'hard' ? (ar ? 'منع عند تجاوز السقف' : 'Hard stop at ceiling') : ar ? `سماحية ${p.tolerancePct}% باعتماد إضافي` : `${p.tolerancePct}% tolerance with extra approval`}
                </span>
              </div>
              <h2 className="mt-1.5 text-[18px] font-semibold">{p.name[lang]}</h2>
              <div className="text-[13.5px] text-muted">
                {p.donor[lang]}{ar ? '، ' : ', '}{p.pillars.length} {ar ? 'محاور' : 'pillars'}{ar ? '، ' : ', '}{p.pillars.reduce((a, x) => a + x.lines.length, 0)} {ar ? 'بنداً' : 'lines'}
              </div>
              <div className="mt-4">
                <UsageBar u={u} height={12} />
              </div>
              <div className="num mt-2 flex justify-between text-[13.5px]">
                <span>
                  <b>{usd(u.available)}</b> <span className="text-muted">{ar ? 'متاح' : 'available'}</span>
                </span>
                <span className="text-muted">
                  {ar ? 'من' : 'of'} {usd(u.ceiling)}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
      {importing && <ImportBudgetModal onClose={() => setImporting(false)} />}
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams()
  const lang = useLang()
  const t = useT()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const nav = useNavigate()
  const project = s.projects.find((p) => p.id === id)
  const [openPillars, setOpenPillars] = useState<Record<string, boolean>>({ [`${id}-p1`]: true })
  const [realloc, setRealloc] = useState<{ to?: string } | null>(null)
  if (!project) return <p>{ar ? 'المشروع غير موجود' : 'Project not found'}</p>
  const u = projectUsage(project, s)
  const { can } = usePerm()
  void user
  const canEditControl = can('projects', 'manage')
  const reallocs = s.reallocations.filter((r) => r.projectId === project.id)

  return (
    <div>
      <div className="mb-2 text-[13px]">
        <Link to="/projects" className="text-muted hover:text-nile">
          {ar ? 'المشاريع' : 'Projects'}
        </Link>
      </div>
      <PageHeader
        title={project.name[lang]}
        sub={[project.code, project.donor[lang], `${date(project.start, lang)} – ${date(project.end, lang)}`].join(ar ? '، ' : ', ')}
        actions={
          <>
            <Button variant="quiet" onClick={() => setRealloc({})}>
              <Shuffle size={16} /> {t('requestReallocation')}
            </Button>
            <Button onClick={() => nav(`/requests/new?project=${project.id}`)}>
              <Plus size={16} /> {t('newRequest')}
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Panel className="p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {(
              [
                [t('ceiling'), u.ceiling, ''],
                [t('spent'), u.spent, 'text-nile'],
                [t('committed'), u.committed, 'text-amber'],
                [t('pending'), u.pending, 'text-amber'],
                [t('available'), u.available, 'text-ink'],
              ] as [string, number, string][]
            ).map(([k, v, c], i) => (
              <div key={k} className={i === 4 ? 'col-span-2 sm:col-span-1' : ''}>
                <div className="text-[12.5px] text-muted">{k}</div>
                <div className={`num font-kufi text-[20px] font-semibold ${c}`}>{usd(v)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <UsageBar u={u} height={14} />
          </div>
          <div className="mt-3">
            <UsageLegend />
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-[15.5px] font-semibold">{ar ? 'ضبط الصرف على السقوف' : 'Ceiling control'}</h2>
          <div className="mt-3 space-y-2">
            {(['hard', 'soft'] as const).map((m) => (
              <label key={m} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${project.controlMode === m ? 'border-nile-2 bg-nile-soft/50' : 'border-line'} ${!canEditControl ? 'cursor-not-allowed opacity-70' : ''}`}>
                <input
                  type="radio"
                  name="mode"
                  className="mt-1 accent-[var(--color-nile)]"
                  checked={project.controlMode === m}
                  disabled={!canEditControl}
                  onChange={() => s.setProjectControl(project.id, m, m === 'soft' ? project.tolerancePct || 10 : 0)}
                />
                <span>
                  <span className="block text-[14px] font-medium">{m === 'hard' ? (ar ? 'منع تام' : 'Hard stop') : ar ? 'سماحية باعتماد إضافي' : 'Tolerance with extra approval'}</span>
                  <span className="block text-[12.5px] text-muted">
                    {m === 'hard'
                      ? ar
                        ? 'لا يمكن إرسال طلب يتجاوز المتاح في البند أو المحور أو المشروع.'
                        : 'A request above what is available on the line, pillar or project cannot be sent.'
                      : ar
                        ? 'يُسمح بالتجاوز ضمن النسبة، ويُضاف المدير التنفيذي لمسار الاعتماد.'
                        : 'Overrun within the tolerance is allowed, and the Executive Director is added to the approval route.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {project.controlMode === 'soft' && (
            <label className="mt-3 flex items-center gap-3 text-[14px]">
              {ar ? 'نسبة السماحية' : 'Tolerance'}
              <input
                type="number"
                min={1}
                max={30}
                disabled={!canEditControl}
                className="num h-9 w-20 rounded-md border border-line px-2"
                value={project.tolerancePct}
                onChange={(e) => s.setProjectControl(project.id, 'soft', Math.max(0, Math.min(30, +e.target.value)))}
              />
              %
            </label>
          )}
          {!canEditControl && <p className="mt-3 text-[12.5px] text-muted">{ar ? 'يعدّلها من لديه صلاحية إدارة المشاريع.' : 'Editable with manage access to Projects.'}</p>}
        </Panel>
      </div>

      {/* Budget tree */}
      <div className="mt-6 space-y-3">
        {project.pillars.map((pl) => {
          const pu = pillarUsage(pl, s)
          const isOpen = !!openPillars[pl.id]
          return (
            <Panel key={pl.id}>
              <button
                className="grid w-full gap-3 px-5 py-4 text-start md:grid-cols-[1.3fr_1.6fr_auto] md:items-center"
                onClick={() => setOpenPillars((o) => ({ ...o, [pl.id]: !o[pl.id] }))}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-3">
                  <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${isOpen ? '' : 'ltr:-rotate-90 rtl:rotate-90'}`} />
                  <div>
                    <div className="text-[12.5px] text-muted">
                      {t('pillar')} {pl.code}
                    </div>
                    <div className="font-kufi text-[16px] font-semibold">{pl.name[lang]}</div>
                  </div>
                </div>
                <UsageBar u={pu} height={12} />
                <div className="num text-[14px] md:min-w-44 md:text-end">
                  <b>{usd(pu.available)}</b>{' '}
                  <span className="text-muted">
                    {ar ? 'متاح من' : 'available of'} {usd(pu.ceiling)}
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full min-w-[860px] text-[14px]">
                    <thead>
                      <tr className="text-[12.5px] text-muted">
                        <th className="px-5 py-2 text-start font-medium">{t('line')}</th>
                        <th className="px-3 py-2 text-end font-medium">{t('ceiling')}</th>
                        <th className="px-3 py-2 text-end font-medium">{t('spent')}</th>
                        <th className="px-3 py-2 text-end font-medium">{t('committed')}</th>
                        <th className="px-3 py-2 text-end font-medium">{t('pending')}</th>
                        <th className="px-3 py-2 text-end font-medium">{t('available')}</th>
                        <th className="w-[22%] px-3 py-2 font-medium" />
                        <th className="px-5 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pl.lines.map((l) => {
                        const lu = lineUsage(l, s)
                        const delta = reallocDelta(l.id, s)
                        const usedPct = lu.ceiling ? (lu.ceiling - lu.available) / lu.ceiling : 0
                        return (
                          <tr key={l.id} className="hover:bg-paper/70">
                            <td className="px-5 py-2.5">
                              <span className="num me-2 text-muted">{l.code}</span>
                              {l.name[lang]}
                            </td>
                            <td className="num px-3 py-2.5 text-end">
                              {usd(lu.ceiling)}
                              {delta !== 0 && (
                                <span className={`block text-[12px] ${delta > 0 ? 'text-leaf' : 'text-crescent'}`} title={ar ? 'بعد المناقلة' : 'after reallocation'}>
                                  {delta > 0 ? '+' : ''}
                                  {usd(delta)}
                                </span>
                              )}
                            </td>
                            <td className="num px-3 py-2.5 text-end">{usd(lu.spent)}</td>
                            <td className="num px-3 py-2.5 text-end">{usd(lu.committed)}</td>
                            <td className="num px-3 py-2.5 text-end">{lu.pending ? usd(lu.pending) : <span className="text-muted">—</span>}</td>
                            <td className={`num px-3 py-2.5 text-end font-semibold ${usedPct >= 0.85 ? 'text-crescent' : ''}`}>{usd(lu.available)}</td>
                            <td className="px-3 py-2.5">
                              <UsageBar u={lu} height={8} />
                            </td>
                            <td className="px-5 py-2.5 whitespace-nowrap">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => nav(`/requests/new?project=${project.id}&line=${l.id}`)}
                                  className="rounded px-2 py-1 text-[13px] text-nile hover:bg-nile-soft"
                                >
                                  {ar ? 'طلب صرف' : 'Request'}
                                </button>
                                <button onClick={() => setRealloc({ to: l.id })} className="rounded px-2 py-1 text-[13px] text-muted hover:bg-paper hover:text-ink">
                                  {t('reallocate')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      <Panel className="mt-6" title={ar ? 'سجل المناقلات' : 'Reallocation log'}>
        {reallocs.length === 0 ? (
          <p className="px-5 py-4 text-muted">{ar ? 'لا توجد مناقلات بعد.' : 'No reallocations yet.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {reallocs.map((r) => {
              const f = findLine([project], r.fromLineId)!
              const to = findLine([project], r.toLineId)!
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[14px]">
                  <span className="num text-muted">{r.code}</span>
                  <span className="num font-semibold">{usd(r.amountUSD)}</span>
                  <span>
                    {f.line.code} {f.line.name[lang]} <span className="text-muted">{ar ? 'إلى' : 'to'}</span> {to.line.code} {to.line.name[lang]}
                  </span>
                  <span className="text-muted">{r.reason[lang]}</span>
                  <span className="ms-auto">
                    <StatusBadge status={r.status} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <ReallocationModal open={!!realloc} onClose={() => setRealloc(null)} project={project} toLineId={realloc?.to} />
    </div>
  )
}
