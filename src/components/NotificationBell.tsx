import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useBadges } from './Layout'

/** Replaced by the full notification centre in the notifications milestone. */
export function NotificationBell() {
  const lang = useStore((s) => s.lang)
  const n = useBadges().unread
  return (
    <Link to="/alerts" className="relative grid size-9 place-items-center rounded-md border border-line bg-surface hover:border-nile-2" aria-label={lang === 'ar' ? 'التنبيهات' : 'Notifications'}>
      <Bell size={17} />
      {n > 0 && <span className="num absolute -top-1.5 -end-1.5 min-w-5 rounded-full bg-crescent px-1 text-center text-[11px] font-semibold leading-5 text-white">{n}</span>}
    </Link>
  )
}
