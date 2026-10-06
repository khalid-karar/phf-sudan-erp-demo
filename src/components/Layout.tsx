import {
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  PieChart,
  Receipt,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GitCompareArrows,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  Menu,
  RotateCcw,
  Settings2,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { offices, roleNames, users } from '../data/seed'
import { useT, type DictKey } from '../lib/i18n'
import { useStore, useUser } from '../lib/store'
import { Toasts } from './ui'

function useMyQueueCount() {
  const user = useUser()
  const requests = useStore((s) => s.requests)
  const reallocs = useStore((s) => s.reallocations)
  const mine = (steps: { role: string; status: string }[]) => steps.some((s) => s.status === 'pending' && s.role === user.role)
  return requests.filter((r) => r.status === 'pending' && mine(r.steps)).length + reallocs.filter((r) => r.status === 'pending' && mine(r.steps)).length
}

type Item = { to: string; key: DictKey; icon: ReactNode; badge?: number; badgeTone?: 'quiet'; soon?: boolean }

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT()
  const queue = useMyQueueCount()
  const ops: Item[] = [
    { to: '/', key: 'nav_dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/projects', key: 'nav_projects', icon: <Wallet size={18} /> },
    { to: '/requests', key: 'nav_requests', icon: <FileText size={18} /> },
    { to: '/approvals', key: 'nav_approvals', icon: <Inbox size={18} />, badge: queue },
  ]
  const next: Item[] = [
    { to: '/activities', key: 'nav_activities', icon: <ClipboardCheck size={18} />, soon: true },
    { to: '/reconciliation', key: 'nav_reconcile', icon: <GitCompareArrows size={18} />, soon: true },
    { to: '/supply', key: 'nav_supply', icon: <Boxes size={18} />, soon: true },
    { to: '/logistics', key: 'nav_logistics', icon: <Truck size={18} />, soon: true },
    { to: '/patients', key: 'nav_patients', icon: <HeartPulse size={18} />, soon: true },
    { to: '/hr', key: 'nav_hr', icon: <Users size={18} />, soon: true },
    { to: '/alerts', key: 'nav_alerts', icon: <Bell size={18} />, soon: true },
    { to: '/reports', key: 'nav_reports', icon: <BarChart3 size={18} />, soon: true },
  ]
  const awaitingPay = useStore((st) => st.requests.filter((r) => r.status === 'approved').length)
  const overdueAdv = useStore((st) => st.advances.filter((a) => a.status === 'open' && +new Date(a.dueAt) < Date.now()).length)
  const finance: Item[] = [
    { to: '/finance', key: 'nav_fin_overview', icon: <PieChart size={18} /> },
    { to: '/finance/accounts', key: 'nav_fin_accounts', icon: <BookOpen size={18} /> },
    { to: '/finance/vouchers', key: 'nav_fin_vouchers', icon: <Receipt size={18} />, badge: awaitingPay, badgeTone: 'quiet' },
    { to: '/finance/advances', key: 'nav_fin_advances', icon: <HandCoins size={18} />, badge: overdueAdv },
    { to: '/finance/journal', key: 'nav_fin_journal', icon: <FileSpreadsheet size={18} /> },
    { to: '/finance/rates', key: 'nav_fin_rates', icon: <ArrowLeftRight size={18} /> },
    { to: '/finance/close', key: 'nav_fin_close', icon: <CalendarCheck size={18} /> },
    { to: '/finance/reports', key: 'nav_fin_reports', icon: <Landmark size={18} /> },
  ]
  const settings: Item[] = [{ to: '/settings/approval-rules', key: 'nav_rules', icon: <Settings2 size={18} /> }]

  const link = (i: Item) => (
    <NavLink
      key={i.to}
      to={i.to}
      end={i.to === '/' || i.to === '/finance'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors ${
          isActive ? 'bg-white/12 text-white' : i.soon ? 'text-white/45 hover:text-white/75' : 'text-white/80 hover:bg-white/6 hover:text-white'
        }`
      }
    >
      <span className="shrink-0">{i.icon}</span>
      <span className="flex-1 truncate">{t(i.key)}</span>
      {!!i.badge && (
        <span className={`num rounded-full px-2 text-[12px] font-semibold leading-5 ${i.badgeTone === 'quiet' ? 'bg-white/15 text-white' : 'bg-crescent text-white'}`}>{i.badge}</span>
      )}
    </NavLink>
  )
  const group = (label: DictKey, items: Item[]) => (
    <div className="mt-5">
      <div className="mb-1.5 px-3 text-[12px] text-white/45">{t(label)}</div>
      <div className="space-y-0.5">{items.map(link)}</div>
    </div>
  )

  return (
    <nav className="flex h-full flex-col bg-nile px-3 pb-4 text-white">
      <div className="flex items-center gap-3 px-2 pt-5 pb-4">
        <img src="./phf-logo.jpg" alt="" className="size-11 shrink-0 rounded-full bg-white object-cover ring-2 ring-white/20" />
        <div className="min-w-0 leading-tight">
          <div className="font-kufi text-[14.5px] font-semibold">{t('appName')}</div>
          <div className="mt-0.5 text-[12px] text-white/60">{t('orgName')}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {group('nav_group_ops', ops)}
        {group('nav_group_finance', finance)}
        {group('nav_group_next', next)}
        {group('nav_group_settings', settings)}
      </div>
    </nav>
  )
}

function RoleSwitcher() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const setUser = useStore((s) => s.setUser)
  const user = useUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const office = (id: string) => offices.find((o) => o.id === id)!.name[lang]
  const initials = (name: string) =>
    name
      .replace('د. ', '')
      .replace('Dr. ', '')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-md border border-line bg-surface py-1.5 ps-1.5 pe-3 hover:border-nile-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid size-8 place-items-center rounded bg-nile-soft font-kufi text-[12px] font-semibold text-nile">{initials(user.name[lang])}</span>
        <span className="hidden text-start leading-tight sm:block">
          <span className="block text-[13.5px] font-medium">{user.name[lang]}</span>
          <span className="block text-[12px] text-muted">
            {roleNames[user.role][lang]}{lang === 'ar' ? '، ' : ', '}{office(user.officeId)}
          </span>
        </span>
        <ChevronDown size={16} className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-30 mt-2 w-80 rounded-lg border border-line bg-surface p-1.5 shadow-xl">
          <div className="px-3 pt-1.5 pb-2 text-[12.5px] text-muted">{t('switchRole')}</div>
          {users.map((u) => (
            <button
              key={u.id}
              role="menuitem"
              onClick={() => {
                setUser(u.id)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-paper ${u.id === user.id ? 'bg-nile-soft' : ''}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded bg-nile-soft font-kufi text-[12px] font-semibold text-nile">{initials(u.name[lang])}</span>
              <span className="leading-tight">
                <span className="block text-[14px] font-medium">{roleNames[u.role][lang]}</span>
                <span className="block text-[12.5px] text-muted">
                  {u.name[lang]}{lang === 'ar' ? '، ' : ', '}{office(u.officeId)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const reset = useStore((s) => s.reset)
  const [drawer, setDrawer] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
  useEffect(() => window.scrollTo(0, 0), [loc.pathname])

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-[270px]" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="min-w-0">
        <div className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <button className="lg:hidden" onClick={() => setDrawer(true)} aria-label="menu">
              {drawer ? <X /> : <Menu />}
            </button>
            <span className="hidden rounded border border-amber/40 bg-amber-soft px-2 py-0.5 text-[12px] text-amber md:inline">{t('demo')}</span>
            <div className="flex-1" />
            <button
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted hover:bg-surface hover:text-ink"
              title={t('resetDemo')}
            >
              <RotateCcw size={15} />
              <span className="hidden sm:inline">{t('resetDemo')}</span>
            </button>
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] font-medium hover:border-nile-2"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            <RoleSwitcher />
          </div>
        </div>
        <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
      <Toasts />
    </div>
  )
}
