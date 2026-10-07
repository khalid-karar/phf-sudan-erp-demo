// Live mode runtime: loads data into the store, refreshes it after a change, and turns failures into messages.
import { useStore } from '../lib/store'
import { ApiError, logout as apiLogout } from './http'
import { loadCore, loadData } from './load'

type Patch = Record<string, unknown>
const clean = (o: Patch) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

/** After sign-in: who this is, the organisation, and all the data their role can see. */
export async function bootstrapLive() {
  const { me, ...core } = await loadCore(useStore.getState().org)
  const data = await loadData(me.id)
  // The signed-in person's own role is in /auth/me even if the roles list is short.
  useStore.setState({ ...core, ...clean(data), userId: me.id } as never)
  return me
}

/** Re-reads the data after something changed (every write does this, so the screen always shows what the server holds). */
export async function refreshData() {
  const id = useStore.getState().userId
  const data = await loadData(id)
  useStore.setState(clean(data) as never)
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
