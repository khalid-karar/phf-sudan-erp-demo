import { AlertTriangle, Bell, CheckCheck, CircleAlert, Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { AppNotification } from '../data/types'
import { useStore } from '../lib/store'

export function timeAgo(iso: string, ar: boolean) {
  const m = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000))
  if (m < 1) return ar ? 'الآن' : 'just now'
  if (m < 60) return ar ? `قبل ${m} دقيقة` : `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return ar ? `قبل ${h} ساعة` : `${h} h ago`
  const d = Math.round(h / 24)
  return ar ? `قبل ${d} يوم` : `${d} d ago`
}

export function SeverityIcon({ s, size = 16 }: { s: AppNotification['severity']; size?: number }) {
  return s === 'critical' ? <AlertTriangle size={size} className="text-crescent" /> : s === 'warn' ? <CircleAlert size={size} className="text-amber" /> : <Info size={size} className="text-nile" />
}

export function NotificationBell() {
  const lang = useStore((s) => s.lang)
  const ar = lang === 'ar'
  const userId = useStore((s) => s.userId)
  const all = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markRead)
  const markAllRead = useStore((s) => s.markAllRead)
  const go = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const mine = all.filter((n) => n.userIds.includes(userId))
  const unread = mine.filter((n) => !n.readBy.includes(userId))
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-md border border-line bg-surface hover:border-nile-2"
        aria-label={ar ? `التنبيهات، ${unread.length} غير مقروءة` : `Notifications, ${unread.length} unread`}
        aria-expanded={open}
      >
        <Bell size={17} />
        {unread.length > 0 && <span className="num absolute -top-1.5 -end-1.5 min-w-5 rounded-full bg-crescent px-1 text-center text-[11px] font-semibold leading-5 text-white">{unread.length}</span>}
      </button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-[380px] max-w-[calc(100vw-24px)] rounded-lg border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold">{ar ? 'التنبيهات' : 'Notifications'}</span>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="inline-flex items-center gap-1 text-[12.5px] text-nile hover:underline">
                <CheckCheck size={14} /> {ar ? 'تعليم الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {mine.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-muted">{ar ? 'لا توجد تنبيهات لك.' : 'You have no notifications.'}</li>}
            {mine.slice(0, 10).map((n) => {
              const isUnread = !n.readBy.includes(userId)
              return (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      markRead(n.id)
                      setOpen(false)
                      go(n.link)
                    }}
                    className={`flex w-full gap-3 px-4 py-3 text-start hover:bg-paper ${isUnread ? 'bg-nile-soft/40' : ''}`}
                  >
                    <span className="mt-0.5 shrink-0">
                      <SeverityIcon s={n.severity} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13.5px] ${isUnread ? 'font-semibold' : ''}`}>{n.title[lang]}</span>
                      <span className="block truncate text-[12.5px] text-muted">{n.body[lang]}</span>
                      <span className="block text-[11.5px] text-muted">{timeAgo(n.createdAt, ar)}</span>
                    </span>
                    {isUnread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-crescent" aria-label={ar ? 'غير مقروء' : 'unread'} />}
                  </button>
                </li>
              )
            })}
          </ul>
          <Link to="/alerts" onClick={() => setOpen(false)} className="block border-t border-line py-2.5 text-center text-[13.5px] text-nile hover:bg-paper">
            {ar ? 'كل التنبيهات' : 'All notifications'}
          </Link>
        </div>
      )}
    </div>
  )
}
