import { Building2, X } from 'lucide-react'
import { useLang } from '../lib/i18n'
import { usePerm, useStore } from '../lib/store'

/**
 * Top-bar office filter for people who can see every office. One choice here narrows the dashboard,
 * lists, reports and queues to that office; "All offices" shows everything again. People tied to a
 * single office never see it — their office is fixed by their role.
 */
export function OfficePicker() {
  const lang = useLang()
  const ar = lang === 'ar'
  const { scopeOffice, viewOffice } = usePerm()
  const offices = useStore((s) => s.offices)
  const setView = useStore((s) => s.setViewOffice)
  if (scopeOffice || offices.length < 2) return null
  const active = !!viewOffice
  const label = ar ? 'عرض مكتب محدد' : 'View a single office'
  return (
    <div
      data-tour="office"
      className={`flex h-9 items-center gap-1.5 rounded-md border px-2 text-[13px] ${active ? 'border-nile bg-nile-soft text-nile' : 'border-line bg-surface text-muted hover:border-nile-2'}`}
      title={active ? (ar ? 'كل الشاشات تعرض هذا المكتب فقط' : 'Every screen shows this office only') : label}
    >
      <Building2 size={16} className="shrink-0" />
      <select
        aria-label={label}
        value={viewOffice ?? ''}
        onChange={(e) => setView(e.target.value)}
        className={`max-w-[9.5rem] cursor-pointer truncate bg-transparent text-[13px] outline-none sm:max-w-[12rem] ${active ? 'font-medium text-nile' : 'text-ink'}`}
      >
        <option value="">{ar ? 'كل المكاتب' : 'All offices'}</option>
        {offices.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name[lang]}
          </option>
        ))}
      </select>
      {active && (
        <button type="button" onClick={() => setView('')} className="grid size-5 place-items-center rounded hover:bg-nile/10" aria-label={ar ? 'عرض كل المكاتب' : 'Show all offices'}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}
