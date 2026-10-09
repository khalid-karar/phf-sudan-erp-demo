import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Field, PageHeader, Panel, inputCls } from '../../components/ui'
import type { IndicatorSource } from '../../api/programme'
import { backend, useDo, useLoad } from '../../api/programme'
import type { Milestone, Objective, Plan, Sector, TeamMember } from '../../api/programme'
import { useLang } from '../../lib/i18n'
import { MILESTONE_LABEL, SOURCE_LABEL, TEAM_LABEL, TYPE_LABEL } from '../../lib/programme'
import type { TeamRole } from '../../lib/programme'
import { usePerm, useStore } from '../../lib/store'

const emptyPlan: Plan = { projectId: '', sectors: [], objectives: [], team: [], milestones: [], schedule: { projectId: '', enabled: false, monthlyDueDay: 10, quarterlyDueDay: 20, notifyDaysBefore: 5 }, scheduled: false }

export function ProgrammeSetup() {
  const ar = useLang() === 'ar'
  const { can } = usePerm()
  const canEdit = can('projects', 'edit')
  const projects = useStore((s) => s.projects)
  const [sp, setSp] = useSearchParams()
  const pid = sp.get('p') || projects[0]?.id || ''
  const doIt = useDo()
  const sectors = useLoad(() => backend.sectors(), [], [] as Sector[])
  const plan = useLoad(() => (pid ? backend.plan(pid) : Promise.resolve(emptyPlan)), [pid], emptyPlan)
  const donors = useLoad(() => backend.donors(), [], [])
  const links = useLoad(() => backend.projectDonors(), [], {} as Record<string, string | null>)
  const p = plan.data
  const L = (a: { ar: string; en: string }) => (ar ? a.ar : a.en)
  const secName = (id: string | null) => { const s = sectors.data.find((x) => x.id === id); return s ? (ar ? s.nameAr : s.nameEn) : ar ? 'عام' : 'General' }
  const act = async (fn: () => Promise<unknown>, ok?: { ar: string; en: string }) => { if (await doIt(fn, ok)) await plan.reload() }

  return (
    <div>
      <PageHeader
        title={ar ? 'خطة المشروع والتقارير' : 'Project plan & reporting'}
        sub={ar ? 'القطاعات والأهداف والمؤشرات وفريق المشروع والمراحل وجدول التقارير.' : 'Sectors, objectives, indicators, the project team, milestones and the reporting calendar.'}
        actions={
          <select className={inputCls + ' w-72'} value={pid} onChange={(e) => setSp({ p: e.target.value })}>
            {projects.map((x) => (<option key={x.id} value={x.id}>{x.code} — {L(x.name)}</option>))}
          </select>
        }
      />
      {!canEdit && <p className="mb-4 rounded-md bg-amber-soft px-4 py-2.5 text-[14px] text-amber">{ar ? 'للعرض فقط.' : 'View only.'}</p>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={ar ? 'المانح والقطاعات' : 'Donor & sectors'}>
          <div className="space-y-4 p-5">
            <Field label={ar ? 'الجهة الممولة' : 'Funding entity'}>
              <select className={inputCls} disabled={!canEdit} value={links.data[pid] ?? ''} onChange={(e) => void doIt(() => backend.linkDonor(pid, e.target.value || null), { ar: 'تم الربط', en: 'Linked' }).then(links.reload)}>
                <option value="">{ar ? '— بلا مانح —' : '— none —'}</option>
                {donors.data.map((d) => (<option key={d.id} value={d.id}>{ar ? d.nameAr : d.nameEn}</option>))}
              </select>
            </Field>
            <div>
              <span className="mb-1.5 block text-[13.5px] font-medium">{ar ? 'قطاعات المشروع' : 'Project sectors'}</span>
              <div className="flex flex-wrap gap-2">
                {sectors.data.map((s) => {
                  const on = p.sectors.includes(s.id)
                  return (
                    <button key={s.id} disabled={!canEdit} onClick={() => void act(() => backend.setSectors(pid, on ? p.sectors.filter((x) => x !== s.id) : [...p.sectors, s.id]))}
                      className={`rounded-full border px-3.5 py-1.5 text-[14px] ${on ? 'border-nile bg-nile text-white' : 'border-line bg-surface text-ink'}`}>
                      {ar ? s.nameAr : s.nameEn}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </Panel>

        <TeamPanel plan={p} canEdit={canEdit} secName={secName} onSave={(m) => act(() => backend.setTeam(pid, m), { ar: 'حُفظ الفريق', en: 'Team saved' })} />

        <Panel title={ar ? 'جدول التقارير والتنبيهات' : 'Reporting calendar & alerts'} className="xl:col-span-2">
          <SchedulePanel plan={p} canEdit={canEdit} onSave={(s) => act(() => backend.setSchedule(pid, s), { ar: 'حُفظ الجدول', en: 'Schedule saved' })} onGenerate={() => act(() => backend.generate(pid), { ar: 'أُنشئت التقارير المستحقة', en: 'Due reports created' })} />
        </Panel>

        <ObjectivesPanel pid={pid} plan={p} sectors={sectors.data} canEdit={canEdit} act={act} secName={secName} />
        <MilestonesPanel pid={pid} plan={p} canEdit={canEdit} act={act} />
      </div>
    </div>
  )
}

function TeamPanel({ plan, canEdit, secName, onSave }: { plan: Plan; canEdit: boolean; secName: (id: string | null) => string; onSave: (m: TeamMember[]) => void }) {
  const ar = useLang() === 'ar'
  const users = useStore((s) => s.users).filter((u) => u.active !== false && !u.donorId)
  const rows: { role: TeamRole; sectorId: string | null }[] = [
    { role: 'project_manager', sectorId: null },
    { role: 'project_coordinator', sectorId: null },
    ...plan.sectors.map((s) => ({ role: 'project_office' as TeamRole, sectorId: s })),
  ]
  const cur = (r: { role: TeamRole; sectorId: string | null }) => plan.team.find((t) => t.role === r.role && t.sectorId === r.sectorId)?.userId ?? ''
  const set = (r: { role: TeamRole; sectorId: string | null }, userId: string) => {
    const rest = plan.team.filter((t) => !(t.role === r.role && t.sectorId === r.sectorId))
    onSave(userId ? [...rest, { role: r.role, sectorId: r.sectorId, userId }] : rest)
  }
  return (
    <Panel title={ar ? 'فريق المشروع' : 'Project team'}>
      <div className="space-y-3 p-5">
        <p className="text-[13px] text-muted">{ar ? 'المقر الرئيسي هو مكتب إدارة المشاريع (PMO) ويراجع كل التقارير.' : 'Headquarters is the PMO and reviews every report.'}</p>
        {rows.map((r) => (
          <Field key={r.role + r.sectorId} label={TEAM_LABEL[r.role][ar ? 'ar' : 'en'] + (r.sectorId ? ` — ${secName(r.sectorId)}` : '') + ` (${TYPE_LABEL[r.role === 'project_manager' ? 'statistics' : r.role === 'project_coordinator' ? 'narrative' : 'custom'][ar ? 'ar' : 'en']})`}>
            <select className={inputCls} disabled={!canEdit} value={cur(r)} onChange={(e) => set(r, e.target.value)}>
              <option value="">{ar ? '— غير معيّن —' : '— unassigned —'}</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name[ar ? 'ar' : 'en']}</option>))}
            </select>
          </Field>
        ))}
      </div>
    </Panel>
  )
}

function SchedulePanel({ plan, canEdit, onSave, onGenerate }: { plan: Plan; canEdit: boolean; onSave: (s: Omit<Plan['schedule'], 'projectId'>) => void; onGenerate: () => unknown }) {
  const ar = useLang() === 'ar'
  const s = plan.schedule
  const num = (k: 'monthlyDueDay' | 'quarterlyDueDay' | 'notifyDaysBefore', min: number, max: number) => (
    <input type="number" className={inputCls} disabled={!canEdit} min={min} max={max} defaultValue={s[k]} key={plan.projectId + k + s[k]}
      onBlur={(e) => { const v = Math.min(max, Math.max(min, Number(e.target.value) || min)); if (v !== s[k]) onSave({ ...s, [k]: v }) }} />
  )
  return (
    <div className="grid gap-4 p-5 md:grid-cols-4">
      <label className="flex items-center gap-2 pt-7 text-[14.5px]"><input type="checkbox" disabled={!canEdit} checked={s.enabled} onChange={(e) => onSave({ ...s, enabled: e.target.checked })} />{ar ? 'تفعيل جدول التقارير' : 'Reporting calendar on'}</label>
      <Field label={ar ? 'موعد التقرير الشهري (يوم من الشهر التالي)' : 'Monthly due (day of next month)'}>{num('monthlyDueDay', 1, 28)}</Field>
      <Field label={ar ? 'موعد التقرير الربع سنوي (يوم)' : 'Quarterly due (day)'}>{num('quarterlyDueDay', 1, 28)}</Field>
      <Field label={ar ? 'التنبيه قبل الموعد (أيام)' : 'Alert days before'}>{num('notifyDaysBefore', 0, 30)}</Field>
      {canEdit && <div className="md:col-span-4"><Button variant="quiet" onClick={onGenerate}>{ar ? 'إنشاء التقارير المستحقة الآن' : 'Create due reports now'}</Button></div>}
    </div>
  )
}

function ObjectivesPanel({ pid, plan, sectors, canEdit, act, secName }: { pid: string; plan: Plan; sectors: Sector[]; canEdit: boolean; act: (f: () => Promise<unknown>, ok?: { ar: string; en: string }) => Promise<void>; secName: (id: string | null) => string }) {
  const ar = useLang() === 'ar'
  const [o, setO] = useState({ code: '', nameAr: '', nameEn: '', sectorId: '' })
  const add = async () => { if (!o.code || !o.nameAr) return; await act(() => backend.addObjective(pid, { ...o, nameEn: o.nameEn || o.nameAr, sectorId: o.sectorId || null })); setO({ code: '', nameAr: '', nameEn: '', sectorId: '' }) }
  return (
    <Panel title={ar ? 'الأهداف والمؤشرات' : 'Objectives & indicators'} className="xl:col-span-2">
      <div className="space-y-4 p-5">
        {plan.objectives.map((ob) => (<ObjectiveCard key={ob.id} ob={ob} canEdit={canEdit} act={act} secName={secName} />))}
        {plan.objectives.length === 0 && <p className="text-muted">{ar ? 'لا أهداف بعد.' : 'No objectives yet.'}</p>}
        {canEdit && (
          <div className="grid items-end gap-2 rounded-md bg-paper p-3 md:grid-cols-[90px_1fr_1fr_160px_auto]">
            <Field label={ar ? 'الرمز' : 'Code'}><input className={inputCls} value={o.code} onChange={(e) => setO({ ...o, code: e.target.value })} /></Field>
            <Field label={ar ? 'الهدف (عربي)' : 'Objective (Arabic)'}><input className={inputCls} value={o.nameAr} onChange={(e) => setO({ ...o, nameAr: e.target.value })} /></Field>
            <Field label={ar ? 'الهدف (إنجليزي)' : 'Objective (English)'}><input className={inputCls} dir="ltr" value={o.nameEn} onChange={(e) => setO({ ...o, nameEn: e.target.value })} /></Field>
            <Field label={ar ? 'القطاع' : 'Sector'}>
              <select className={inputCls} value={o.sectorId} onChange={(e) => setO({ ...o, sectorId: e.target.value })}>
                <option value="">{ar ? 'عام' : 'General'}</option>
                {sectors.filter((s) => plan.sectors.includes(s.id)).map((s) => (<option key={s.id} value={s.id}>{ar ? s.nameAr : s.nameEn}</option>))}
              </select>
            </Field>
            <Button onClick={() => void add()}><Plus size={16} />{ar ? 'إضافة' : 'Add'}</Button>
          </div>
        )}
      </div>
    </Panel>
  )
}

function ObjectiveCard({ ob, canEdit, act, secName }: { ob: Objective; canEdit: boolean; act: (f: () => Promise<unknown>, ok?: { ar: string; en: string }) => Promise<void>; secName: (id: string | null) => string }) {
  const ar = useLang() === 'ar'
  const [i, setI] = useState({ code: '', nameAr: '', unit: '', target: '', source: 'manual' as IndicatorSource })
  const add = async () => {
    if (!i.code || !i.nameAr) return
    await act(() => backend.addIndicator(ob.id, { code: i.code, nameAr: i.nameAr, nameEn: i.nameAr, unit: i.unit, target: i.target === '' ? null : Number(i.target), source: i.source }))
    setI({ code: '', nameAr: '', unit: '', target: '', source: 'manual' })
  }
  return (
    <div className="rounded-md border border-line">
      <div className="flex items-center justify-between gap-2 bg-paper px-4 py-2.5">
        <div className="font-semibold">{ob.code} — {ar ? ob.nameAr : ob.nameEn} <span className="ms-2 text-[12.5px] font-normal text-muted">{secName(ob.sectorId)}</span></div>
        {canEdit && <button aria-label="delete" className="text-muted hover:text-crescent" onClick={() => void act(() => backend.removeObjective(ob.id))}><Trash2 size={16} /></button>}
      </div>
      <table className="w-full text-[14px]">
        <tbody>
          {ob.indicators.map((x) => (
            <tr key={x.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium" dir="ltr">{x.code}</td>
              <td className="px-2 py-2">{ar ? x.nameAr : x.nameEn}</td>
              <td className="px-2 py-2 text-muted">{x.target ?? '—'} {x.unit}</td>
              <td className="px-2 py-2 text-muted">{SOURCE_LABEL[x.source][ar ? 'ar' : 'en']}</td>
              <td className="px-2 py-2 text-end">{canEdit && <button aria-label="delete" className="text-muted hover:text-crescent" onClick={() => void act(() => backend.removeIndicator(x.id))}><Trash2 size={15} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <div className="grid gap-2 border-t border-line p-3 md:grid-cols-[80px_1fr_100px_90px_220px_auto]">
          <input className={inputCls} placeholder={ar ? 'الرمز' : 'Code'} value={i.code} onChange={(e) => setI({ ...i, code: e.target.value })} />
          <input className={inputCls} placeholder={ar ? 'المؤشر' : 'Indicator'} value={i.nameAr} onChange={(e) => setI({ ...i, nameAr: e.target.value })} />
          <input className={inputCls} placeholder={ar ? 'الوحدة' : 'Unit'} value={i.unit} onChange={(e) => setI({ ...i, unit: e.target.value })} />
          <input className={inputCls} type="number" placeholder={ar ? 'الهدف' : 'Target'} value={i.target} onChange={(e) => setI({ ...i, target: e.target.value })} />
          <select className={inputCls} value={i.source} onChange={(e) => setI({ ...i, source: e.target.value as IndicatorSource })}>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (<option key={k} value={k}>{v[ar ? 'ar' : 'en']}</option>))}
          </select>
          <Button variant="quiet" onClick={() => void add()}><Plus size={16} /></Button>
        </div>
      )}
    </div>
  )
}

function MilestonesPanel({ pid, plan, canEdit, act }: { pid: string; plan: Plan; canEdit: boolean; act: (f: () => Promise<unknown>, ok?: { ar: string; en: string }) => Promise<void> }) {
  const ar = useLang() === 'ar'
  const users = useStore((s) => s.users).filter((u) => u.active !== false && !u.donorId)
  const [m, setM] = useState({ titleAr: '', due: '', ownerId: '' })
  const add = async () => {
    if (!m.titleAr || !m.due) return
    await act(() => backend.addMilestone(pid, { titleAr: m.titleAr, titleEn: m.titleAr, due: m.due, ownerId: m.ownerId || null, status: 'planned', objectiveId: null, activityId: null, notifyDaysBefore: plan.schedule.notifyDaysBefore }))
    setM({ titleAr: '', due: '', ownerId: '' })
  }
  const status = (x: Milestone, v: Milestone['status']) => act(() => backend.editMilestone(x.id, { status: v }))
  return (
    <Panel title={ar ? 'المراحل (Milestones)' : 'Milestones'} className="xl:col-span-2">
      <div className="p-5">
        <table className="w-full text-[14px]">
          <tbody>
            {plan.milestones.map((x) => (
              <tr key={x.id} className="border-b border-line">
                <td className="py-2 pe-3 font-medium">{ar ? x.titleAr : x.titleEn}</td>
                <td className="px-2" dir="ltr">{x.due}</td>
                <td className="px-2 text-muted">{users.find((u) => u.id === x.ownerId)?.name[ar ? 'ar' : 'en'] ?? '—'}</td>
                <td className="px-2">
                  <select disabled={!canEdit} className={`h-8 rounded-md px-2 text-[13px] ${MILESTONE_LABEL[x.status].cls}`} value={x.status} onChange={(e) => void status(x, e.target.value as Milestone['status'])}>
                    {(Object.keys(MILESTONE_LABEL) as Milestone['status'][]).map((k) => (<option key={k} value={k}>{MILESTONE_LABEL[k][ar ? 'ar' : 'en']}</option>))}
                  </select>
                </td>
                <td className="text-end">{canEdit && <button aria-label="delete" className="text-muted hover:text-crescent" onClick={() => void act(() => backend.removeMilestone(x.id))}><Trash2 size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="mt-4 grid items-end gap-2 md:grid-cols-[1fr_170px_200px_auto]">
            <Field label={ar ? 'المرحلة' : 'Milestone'}><input className={inputCls} value={m.titleAr} onChange={(e) => setM({ ...m, titleAr: e.target.value })} /></Field>
            <Field label={ar ? 'تاريخ الاستحقاق' : 'Due date'}><input type="date" className={inputCls} value={m.due} onChange={(e) => setM({ ...m, due: e.target.value })} /></Field>
            <Field label={ar ? 'المسؤول' : 'Owner'}>
              <select className={inputCls} value={m.ownerId} onChange={(e) => setM({ ...m, ownerId: e.target.value })}>
                <option value="">—</option>
                {users.map((u) => (<option key={u.id} value={u.id}>{u.name[ar ? 'ar' : 'en']}</option>))}
              </select>
            </Field>
            <Button onClick={() => void add()}><Plus size={16} />{ar ? 'إضافة' : 'Add'}</Button>
          </div>
        )}
      </div>
    </Panel>
  )
}
