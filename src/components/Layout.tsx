import {
  Bell,
  Boxes,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FileBarChart,
  HeartPulse,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  Settings,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { Access, ModuleKey } from '../data/types'
import { useT } from '../lib/i18n'
import { Tour } from './Help'
import { helpItem, locate, modules, type NavItem, type NavModule } from '../lib/nav'
import { useStore, usePerm, useUser } from '../lib/store'
import { CommandPalette } from './CommandPalette'
import { NotificationBell } from './NotificationBell'
import { Toasts } from './ui'

const icons: Record<string, ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={19} />,
  Wallet: <Wallet size={19} />,
  ClipboardCheck: <ClipboardCheck size={19} />,
  Landmark: <Landmark size={19} />,
  Boxes: <Boxes size={19} />,
  Truck: <Truck size={19} />,
  HeartPulse: <HeartPulse size={19} />,
  Users: <Users size={19} />,
  FileBarChart: <FileBarChart size={19} />,
  Bell: <Bell size={19} />,
  Settings: <Settings size={19} />,
}

const rank: Record<Access, number> = { none: 0, view: 1, edit: 2, manage: 3 }

/** Modules and pages the current user is allowed to see. */
export function useVisibleNav() {
  const { role } = usePerm()
  return modules
    .map((m) => {
      if (!role) return null
      const level = role.permissions[m.key as ModuleKey]
      if (rank[level] < 1) return null
      const items = m.items.filter((it) => rank[level] >= rank[it.min ?? 'view'])
      return items.length ? { ...m, items } : null
    })
    .filter(Boolean) as NavModule[]
}

export function useBadges() {
  const user = useUser()
  const { scopeOffice } = usePerm()
  const s = useStore()
  const mine = (steps: { role: string; status: string }[]) => steps.some((st) => st.status === 'pending' && st.role === user.role)
  const inScope = (o: string) => !scopeOffice || o === scopeOffice
  const approvals =
    s.requests.filter((r) => r.status === 'pending' && mine(r.steps) && inScope(r.officeId)).length + s.reallocations.filter((r) => r.status === 'pending' && mine(r.steps)).length
  const x = s as unknown as Record<string, unknown>
  const counts: Record<string, number> = {
    approvals,
    awaitingPay: s.requests.filter((r) => r.status === 'approved').length,
    overdueAdv: s.advances.filter((a) => a.status === 'open' && +new Date(a.dueAt) < Date.now()).length,
    unread: typeof x.unreadCount === 'function' ? (x.unreadCount as (u: string) => number)(user.id) : 0,
    gaps: typeof x.gapCount === 'function' ? (x.gapCount as () => number)() : 0,
    lowStock: typeof x.lowStockCount === 'function' ? (x.lowStockCount as () => number)() : 0,
    offline: Array.isArray(x.outbox) ? (x.outbox as unknown[]).length : 0,
  }
  return counts
}

function Badge({ n, quiet }: { n: number; quiet?: boolean }) {
  if (!n) return null
  return <span className={`num min-w-5 rounded-full px-1.5 text-center text-[11.5px] font-semibold leading-5 ${quiet ? 'bg-white/15 text-white' : 'bg-crescent text-white'}`}>{n}</span>
}

function Sidebar({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const lang = useStore((s) => s.lang)
  const org = useStore((s) => s.org)
  const setCollapsed = useStore((s) => s.setSidebarCollapsed)
  const nav = useVisibleNav()
  const badges = useBadges()
  const loc = useLocation()
  const go = useNavigate()
  const active = locate(loc.pathname)?.module.key
  const [open, setOpen] = useState<string | undefined>(active)
  useEffect(() => setOpen(active), [active])

  const moduleBadge = (m: NavModule) => m.items.reduce((t, it) => t + (it.badge && it.badge !== 'awaitingPay' && it.badge !== 'offline' ? badges[it.badge] : 0), 0)
  const quiet = (it: NavItem) => it.badge === 'awaitingPay' || it.badge === 'offline'

  return (
    <nav className="flex h-full flex-col bg-nile text-white" aria-label={lang === 'ar' ? 'القائمة الرئيسية' : 'Main menu'}>
      <div className={`flex items-center gap-3 pt-5 pb-4 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
        <img src={org.logo} alt="" className="size-10 shrink-0 rounded-full bg-white object-cover ring-2 ring-white/20" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate font-kufi text-[14.5px] font-semibold">{org.shortName[lang]}</div>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] text-white/60">{org.name[lang]}</div>
          </div>
        )}
      </div>

      <div className={`flex-1 space-y-0.5 overflow-y-auto pb-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {nav.map((m) => {
          const isActive = active === m.key
          const isOpen = open === m.key && !collapsed
          const single = m.items.length === 1
          const b = moduleBadge(m)
          return (
            <div key={m.key}>
              <button
                onClick={() => {
                  if (collapsed || single) {
                    go(m.items[0].to)
                    onNavigate?.()
                    return
                  }
                  if (open === m.key && isActive) return setOpen(undefined)
                  setOpen(m.key)
                  if (!isActive) go(m.items[0].to)
                }}
                title={collapsed ? m.label[lang] : undefined}
                aria-expanded={single ? undefined : isOpen}
                className={`flex w-full items-center gap-3 rounded-md py-2 text-[14px] transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                  isActive ? 'bg-white/12 text-white' : 'text-white/80 hover:bg-white/6 hover:text-white'
                }`}
              >
                <span className="relative shrink-0">
                  {icons[m.icon]}
                  {collapsed && b > 0 && <span className="absolute -top-1 -end-1 size-2 rounded-full bg-crescent" />}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-start font-medium">{m.label[lang]}</span>
                    {!isOpen && <Badge n={b} />}
                    {!single && <ChevronDown size={15} className={`shrink-0 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                  </>
                )}
              </button>
              {isOpen && !single && (
                <div className="ms-[22px] mt-0.5 mb-1.5 space-y-0.5 border-s border-white/15 ps-2">
                  {m.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      end
                      onClick={onNavigate}
                      className={({ isActive: a }) =>
                        `flex items-center gap-2 rounded-md px-3 py-1.5 text-[13.5px] ${a ? 'bg-white/14 font-medium text-white' : 'text-white/70 hover:bg-white/6 hover:text-white'}`
                      }
                    >
                      <span className="flex-1 truncate">{it.label[lang]}</span>
                      {it.badge && <Badge n={badges[it.badge]} quiet={quiet(it)} />}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className={`space-y-0.5 border-t border-white/10 py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        <NavLink
          to={helpItem.to}
          onClick={onNavigate}
          title={collapsed ? helpItem.label[lang] : undefined}
          className={({ isActive }) => `flex items-center gap-3 rounded-md py-2 text-[14px] ${collapsed ? 'justify-center' : 'px-3'} ${isActive ? 'bg-white/12' : 'text-white/80 hover:bg-white/6'}`}
        >
          <HelpCircle size={19} />
          {!collapsed && helpItem.label[lang]}
        </NavLink>
        {!onNavigate && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden w-full items-center gap-3 rounded-md py-2 text-[13.5px] text-white/60 hover:bg-white/6 hover:text-white lg:flex ${collapsed ? 'justify-center' : 'px-3'}`}
            title={collapsed ? (lang === 'ar' ? 'توسيع القائمة' : 'Expand menu') : undefined}
          >
            {(lang === 'ar') !== !!collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!collapsed && (lang === 'ar' ? 'طي القائمة' : 'Collapse menu')}
          </button>
        )}
      </div>
    </nav>
  )
}

/** Sub-pages of the current module as tabs, shown when the sidebar is collapsed or on small screens. */
function ModuleTabs({ always }: { always?: boolean }) {
  const lang = useStore((s) => s.lang)
  const loc = useLocation()
  const nav = useVisibleNav()
  const badges = useBadges()
  const here = locate(loc.pathname)
  const m = nav.find((x) => x.key === here?.module.key)
  if (!m || m.items.length < 2) return null
  return (
    <div className={`-mt-2 mb-5 flex gap-1 overflow-x-auto border-b border-line print:hidden ${always ? '' : 'lg:hidden'}`}>
      {m.items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end
          className={({ isActive }) =>
            `-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] ${isActive ? 'border-nile font-medium text-nile' : 'border-transparent text-muted hover:text-ink'}`
          }
        >
          {it.label[lang]}
          {it.badge && badges[it.badge] > 0 && <span className="num rounded-full bg-crescent px-1.5 text-[11px] leading-[18px] text-white">{badges[it.badge]}</span>}
        </NavLink>
      ))}
    </div>
  )
}

function Breadcrumb() {
  const lang = useStore((s) => s.lang)
  const loc = useLocation()
  const here = locate(loc.pathname)
  if (!here) return loc.pathname === '/help' ? <span className="hidden text-[14px] font-medium md:inline">{helpItem.label[lang]}</span> : null
  const single = here.module.items.length === 1
  return (
    <nav aria-label="breadcrumb" className="hidden min-w-0 items-center gap-1.5 truncate text-[13.5px] md:flex">
      {!single && (
        <>
          <span className="text-muted">{here.module.label[lang]}</span>
          <span className="text-muted/60">/</span>
        </>
      )}
      <Link to={here.item.to} className="truncate font-medium text-ink hover:text-nile">
        {here.item.label[lang]}
      </Link>
    </nav>
  )
}

export const initialsOf = (name: string) =>
  name
    .replace(/^(د\.|م\.|Dr\.|Eng\.)\s*/, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')

function UserMenu() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const users = useStore((s) => s.users)
  const roles = useStore((s) => s.roles)
  const offices = useStore((s) => s.offices)
  const setUser = useStore((s) => s.setUser)
  const reset = useStore((s) => s.reset)
  const user = useUser()
  const go = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name[lang] ?? id
  const office = (id: string) => offices.find((o) => o.id === id)?.name[lang] ?? ''
  const sep = lang === 'ar' ? '، ' : ', '
  const list = users.filter((u) => u.active !== false && (!q || u.name.ar.includes(q) || u.name.en.toLowerCase().includes(q.toLowerCase()) || roleName(u.role).includes(q)))
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-md border border-line bg-surface py-1.5 ps-1.5 pe-2.5 hover:border-nile-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid size-8 place-items-center rounded bg-nile-soft font-kufi text-[12px] font-semibold text-nile">{initialsOf(user.name[lang])}</span>
        <span className="hidden text-start leading-tight sm:block">
          <span className="block max-w-44 truncate text-[13.5px] font-medium">{user.name[lang]}</span>
          <span className="block max-w-44 truncate text-[12px] text-muted">{roleName(user.role)}</span>
        </span>
        <ChevronDown size={16} className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-40 mt-2 w-[340px] max-w-[calc(100vw-24px)] rounded-lg border border-line bg-surface shadow-xl">
          <div className="border-b border-line p-4">
            <div className="font-medium">{user.name[lang]}</div>
            <div className="text-[13px] text-muted">
              {roleName(user.role)}
              {sep}
              {office(user.officeId)}
            </div>
            <div className="num text-[12.5px] text-muted" dir="ltr">
              {user.email}
            </div>
          </div>
          <div className="p-1.5">
            <div className="px-2.5 pt-1.5 pb-1 text-[12.5px] text-muted">{lang === 'ar' ? 'الدخول بمستخدم آخر (للعرض)' : 'Sign in as another user (demo)'}</div>
            <input
              className="mx-1 mb-1 h-8 w-[calc(100%-8px)] rounded-md border border-line px-2.5 text-[13px]"
              placeholder={lang === 'ar' ? 'ابحث بالاسم أو الدور' : 'Search by name or role'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto">
              {list.map((u) => (
                <button
                  key={u.id}
                  role="menuitem"
                  onClick={() => {
                    setUser(u.id)
                    setOpen(false)
                    go('/')
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-start hover:bg-paper ${u.id === user.id ? 'bg-nile-soft' : ''}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded bg-nile-soft font-kufi text-[11px] font-semibold text-nile">{initialsOf(u.name[lang])}</span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[13.5px] font-medium">{roleName(u.role)}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {u.name[lang]}
                      {sep}
                      {office(u.officeId)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-line p-1.5">
            <button
              onClick={() => {
                setOpen(false)
                go('/help')
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] hover:bg-paper"
            >
              <HelpCircle size={16} className="text-muted" /> {lang === 'ar' ? 'مركز المساعدة' : 'Help centre'}
            </button>
            <button
              onClick={() => {
                setOpen(false)
                reset()
                go('/')
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] hover:bg-paper"
            >
              <RotateCcw size={16} className="text-muted" /> {t('resetDemo')}
            </button>
            <button
              onClick={() => {
                setOpen(false)
                go('/login')
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] hover:bg-paper"
            >
              <LogOut size={16} className="text-muted" /> {lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
  const markVisited = useStore((s) => s.markVisited)
  const tourSeen = useStore((s) => s.tourSeen)
  const startTour = useStore((s) => s.startTour)
  useEffect(() => {
    window.scrollTo(0, 0)
    setDrawer(false)
    markVisited(loc.pathname)
  }, [loc.pathname, markVisited])
  useEffect(() => {
    if (tourSeen || navigator.webdriver) return
    const t = setTimeout(startTour, 700)
    return () => clearTimeout(t)
  }, [tourSeen, startTour])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <div className={`min-h-screen lg:grid ${collapsed ? 'lg:grid-cols-[72px_1fr]' : 'lg:grid-cols-[264px_1fr]'} print:block`}>
      <aside data-tour="sidebar" className="sticky top-0 hidden h-screen lg:block print:hidden">
        <Sidebar collapsed={collapsed} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-[284px] max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="min-w-0">
        <div className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur print:hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 lg:px-8">
            <button data-tour="sidebar" className="lg:hidden" onClick={() => setDrawer(true)} aria-label={lang === 'ar' ? 'القائمة' : 'Menu'}>
              {drawer ? <X /> : <Menu />}
            </button>
            <Breadcrumb />
            <div className="flex-1" />
            <button
              data-tour="search"
              onClick={() => setPalette(true)}
              className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-muted hover:border-nile-2 sm:w-56 lg:w-64"
              aria-label={lang === 'ar' ? 'بحث' : 'Search'}
            >
              <Search size={16} />
              <span className="hidden flex-1 text-start sm:inline">{lang === 'ar' ? 'ابحث أو انتقل إلى…' : 'Search or jump to…'}</span>
              <kbd className="hidden rounded border border-line bg-paper px-1.5 text-[11px] sm:inline" dir="ltr">
                Ctrl K
              </kbd>
            </button>
            <span className="hidden rounded border border-amber/40 bg-amber-soft px-2 py-0.5 text-[12px] text-amber 2xl:inline">{t('demo')}</span>
            <button
              data-tour="lang"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="h-9 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium hover:border-nile-2"
              title={lang === 'ar' ? 'English' : 'العربية'}
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            <span data-tour="bell" className="inline-flex">
              <NotificationBell />
            </span>
            <span data-tour="user" className="inline-flex">
              <UserMenu />
            </span>
          </div>
        </div>
        <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8 print:max-w-none print:p-0">
          <ModuleTabs always={collapsed} />
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Tour />
      <Toasts />
    </div>
  )
}
