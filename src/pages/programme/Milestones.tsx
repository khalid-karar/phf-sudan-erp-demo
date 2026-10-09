import { Link } from 'react-router-dom'
import { backend, useLoad } from '../../api/programme'
import type { Milestone } from '../../api/programme'
import { PageHeader, Panel } from '../../components/ui'
import { useLang } from '../../lib/i18n'
import { MILESTONE_LABEL, daysBetween, todayIso } from '../../lib/programme'
import { useStore } from '../../lib/store'

export function MilestonesPage() {
  const ar = useLang() === 'ar'
  const projects = useStore((s) => s.projects)
  const users = useStore((s) => s.users)
  const list = useLoad(() => backend.milestones(), [], [] as Milestone[])
  const rows = [...list.data].sort((a, b) => a.due.localeCompare(b.due))
  return (
    <div>
      <PageHeader title={ar ? 'مراحل المشاريع' : 'Project milestones'} sub={ar ? 'كل المراحل مرتبة بتاريخ الاستحقاق. يصل تنبيه قبل الموعد وعند التأخر.' : 'All milestones by due date. Alerts go out ahead of the date and when late.'} />
      <Panel>
        <table className="w-full text-[14px]">
          <thead className="text-muted"><tr className="border-b border-line"><th className="px-4 py-2.5 text-start">{ar ? 'المرحلة' : 'Milestone'}</th><th className="text-start">{ar ? 'المشروع' : 'Project'}</th><th className="text-start">{ar ? 'الاستحقاق' : 'Due'}</th><th className="text-start">{ar ? 'المسؤول' : 'Owner'}</th><th className="text-start">{ar ? 'الحالة' : 'Status'}</th></tr></thead>
          <tbody>
            {rows.map((m) => {
              const left = daysBetween(todayIso(), m.due)
              const late = m.status !== 'done' && left < 0
              return (
                <tr key={m.id} className="border-b border-line">
                  <td className="px-4 py-2.5 font-medium">{ar ? m.titleAr : m.titleEn}</td>
                  <td><Link className="text-nile hover:underline" to={`/programme/setup?p=${m.projectId}`}>{projects.find((p) => p.id === m.projectId)?.code ?? m.projectId}</Link></td>
                  <td dir="ltr" className={late ? 'font-semibold text-crescent' : ''}>{m.due}{m.status !== 'done' && ` (${left < 0 ? `${-left}d late` : `${left}d`})`}</td>
                  <td>{users.find((u) => u.id === m.ownerId)?.name[ar ? 'ar' : 'en'] ?? '—'}</td>
                  <td><span className={`rounded-full px-2.5 py-0.5 text-[12.5px] ${MILESTONE_LABEL[m.status].cls}`}>{MILESTONE_LABEL[m.status][ar ? 'ar' : 'en']}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
