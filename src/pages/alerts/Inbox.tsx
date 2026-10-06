import { CheckCheck, Mail, MessageCircle, MessageSquareText, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SeverityIcon, timeAgo } from '../../components/NotificationBell'
import { Button, PageHeader, Panel } from '../../components/ui'
import type { Channel } from '../../data/types'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore } from '../../lib/store'

export const channelIcon: Record<Channel, React.ReactNode> = {
  email: <Mail size={13} />,
  whatsapp: <MessageCircle size={13} />,
  sms: <MessageSquareText size={13} />,
}
export const channelName: Record<Channel, { ar: string; en: string }> = {
  email: { ar: 'بريد', en: 'Email' },
  whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
  sms: { ar: 'رسالة نصية', en: 'SMS' },
}

export function Inbox() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const { can } = usePerm()
  const go = useNavigate()
  const [tab, setTab] = useState<'all' | 'unread' | 'critical'>('all')
  const mine = s.notifications.filter((n) => n.userIds.includes(s.userId))
  const list = mine.filter((n) => (tab === 'unread' ? !n.readBy.includes(s.userId) : tab === 'critical' ? n.severity === 'critical' : true))
  const unread = mine.filter((n) => !n.readBy.includes(s.userId)).length

  return (
    <div>
      <PageHeader
        title={ar ? 'التنبيهات' : 'Notifications'}
        sub={ar ? 'تصلك التنبيهات حسب دورك ومكتبك، وفق القواعد التي يضبطها مدير النظام.' : 'You get notifications for your role and office, under the rules the administrator sets.'}
        actions={
          <>
            {can('settings', 'edit') && (
              <Button variant="quiet" onClick={() => go('/settings/notifications')}>
                <Settings2 size={16} /> {ar ? 'قواعد التنبيهات' : 'Notification rules'}
              </Button>
            )}
            <Button variant="quiet" disabled={!unread} onClick={s.markAllRead}>
              <CheckCheck size={16} /> {ar ? 'تعليم الكل كمقروء' : 'Mark all read'}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ['all', ar ? 'الكل' : 'All', mine.length],
            ['unread', ar ? 'غير مقروءة' : 'Unread', unread],
            ['critical', ar ? 'عاجلة' : 'Urgent', mine.filter((n) => n.severity === 'critical').length],
          ] as const
        ).map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-9 rounded-md px-3 text-[13.5px] ${tab === k ? 'bg-nile text-white' : 'border border-line bg-surface text-muted hover:text-ink'}`}>
            {l} <span className="num opacity-70">{n}</span>
          </button>
        ))}
      </div>
      <Panel>
        {list.length === 0 ? (
          <p className="px-5 py-12 text-center text-muted">{ar ? 'لا توجد تنبيهات هنا.' : 'Nothing here.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((n) => {
              const isUnread = !n.readBy.includes(s.userId)
              const sent = s.deliveries.filter((d) => d.notificationId === n.id && d.status === 'sent')
              const chans = [...new Set(sent.map((d) => d.channel))]
              return (
                <li key={n.id} className={`flex gap-3 px-5 py-3.5 ${isUnread ? 'bg-nile-soft/30' : ''}`}>
                  <span className="mt-0.5">
                    <SeverityIcon s={n.severity} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={n.link} onClick={() => s.markRead(n.id)} className={`block hover:text-nile ${isUnread ? 'font-semibold' : 'font-medium'}`}>
                      {n.title[lang]}
                    </Link>
                    <div className="text-[13.5px] text-muted">{n.body[lang]}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      <span>{timeAgo(n.createdAt, ar)}</span>
                      {chans.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 rounded bg-paper px-1.5 py-0.5 ring-1 ring-line">
                          {channelIcon[c]} {ar ? `أُرسل ${channelName[c].ar}` : `Sent by ${channelName[c].en}`}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isUnread && (
                    <button onClick={() => s.markRead(n.id)} className="h-fit shrink-0 rounded px-2 py-1 text-[12.5px] text-nile hover:bg-nile-soft">
                      {ar ? 'تعليم كمقروء' : 'Mark read'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
