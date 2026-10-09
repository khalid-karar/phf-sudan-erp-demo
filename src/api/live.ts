// Live mode runtime: loads data into the store, refreshes it after a change, and turns failures into messages.
import { useSession } from '../lib/session'
import { useStore } from '../lib/store'
import { api, ApiError, logout as apiLogout } from './http'
import { mapInbox } from './map'
import { liveActions } from './actions'
import { loadCore, loadData } from './load'

type Patch = Record<string, unknown>
const clean = (o: Patch) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

/** After sign-in: who this is, the organisation, and all the data their role can see. */
export async function bootstrapLive() {
  // A donor representative gets the portal only: the server refuses every other route to them.
  const who = await api.get<import('./dto').MeDto>('/auth/me')
  if (who.donorId) {
    useSession.setState({ donorId: who.donorId, name: { ar: who.nameAr, en: who.nameEn } })
    return who
  }
  useSession.setState({ donorId: null, name: null })
  const { me, ...core } = await loadCore(useStore.getState().org)
  const data = await loadData(me.id, me.role.permissions)
  // The signed-in person's own role is in /auth/me even if the roles list is short.
  useStore.setState({ ...core, ...clean(data), userId: me.id } as never)
  return me
}

/** Re-reads the data after something changed (every write does this, so the screen always shows what the server holds). */
export async function refreshData() {
  const st = useStore.getState()
  const role = st.roles.find((r) => r.id === st.users.find((u) => u.id === st.userId)?.role)
  const data = await loadData(st.userId, role?.permissions ?? {})
  useStore.setState(clean(data) as never)
}

/** The bell: new alerts from the server's engine show up within a minute without reloading everything. */
export async function refreshInbox() {
  const st = useStore.getState()
  const rows = await api.get<import('./dto').InboxDto[]>('/notifications?limit=100')
  useStore.setState({ notifications: rows.map((x) => mapInbox(x, st.userId)) } as never)
}

export async function refreshCore() {
  const { me, ...core } = await loadCore(useStore.getState().org)
  useStore.setState({ ...core, userId: me.id } as never)
}

export function errorText(e: unknown) {
  if (e instanceof ApiError) return e.msg
  return { ar: 'حدث خطأ غير متوقع. حاول مجدداً.', en: 'Something unexpected went wrong. Please try again.' }
}

/**
 * Runs a change on the server. Shows the server's own message (in both languages) if it is refused, and returns false;
 * on success it reloads the data and returns true. Screens can wait on it to keep a dialog open when something is wrong.
 */
export async function act(run: () => Promise<unknown>, opts: { ok?: { ar: string; en: string }; core?: boolean } = {}): Promise<boolean> {
  const { toast } = useStore.getState()
  try {
    await run()
  } catch (e) {
    toast(errorText(e), 'bad')
    return false
  }
  try {
    await (opts.core ? refreshCore() : Promise.resolve())
    await refreshData()
  } catch (e) {
    toast(errorText(e), 'warn')
  }
  if (opts.ok) toast(opts.ok, 'ok')
  return true
}

export async function signOut() {
  await apiLogout()
  useStore.setState({ userId: '' } as never)
  window.location.hash = '#/'
  window.location.reload()
}

// Actions that stay on the screen only (or just read) and so need no server.
const LOCAL = new Set(['startTour', 'endTour', 'markVisited', 'hideChecklist', 'setLang', 'setSidebarCollapsed', 'toast', 'dismissToast', 'lowStockCount', 'qtyOf', 'unreadCount', 'gapCount'])
// Actions already connected to the server — add a name here as each one is wired.
export const WIRED = new Set<string>(Object.keys(liveActions))

/** Until a screen's action is connected, it says so instead of changing only the local copy that the next refresh would erase. */
let listening = false
export function guardUnwired() {
  if (!listening) {
    listening = true
    window.addEventListener('online', () => void useStore.getState().syncOutbox())
  }
  const st = useStore.getState() as unknown as Record<string, unknown>
  const stubs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(st)) {
    if (typeof v !== 'function' || LOCAL.has(k) || WIRED.has(k)) continue
    stubs[k] = () => {
      useStore.getState().toast({ ar: 'هذه العملية غير موصولة بالخادم بعد.', en: 'This action is not connected to the server yet.' }, 'warn')
      return false
    }
  }
  useStore.setState({ ...stubs, ...liveActions } as never)
}
