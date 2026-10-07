// Talks to the PHF API. When VITE_API_URL is set the app runs "live" (real sign-in, data from the
// server); without it the app is the self-contained demo and nothing here is used.
import type { Bi } from '../data/types'

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '')
export const LIVE = !!base
export const API = base ? `${base}/api/v1` : ''

/** A failure the screens can show as it is: a stable code and a message in both languages. */
export class ApiError extends Error {
  status: number
  code: string
  msg: Bi
  details?: unknown
  constructor(status: number, code: string, msg: Bi, details?: unknown) {
    super(msg.en)
    this.status = status
    this.code = code
    this.msg = msg
    this.details = details
  }
}

const REFRESH_KEY = 'phf-refresh'
const store = {
  get: () => {
    try {
      return localStorage.getItem(REFRESH_KEY)
    } catch {
      return null
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(REFRESH_KEY, v)
      else localStorage.removeItem(REFRESH_KEY)
    } catch {
      /* private mode: the person signs in again next time */
    }
  },
}

let access: string | null = null
let onSignedOut: (() => void) | null = null
export const whenSignedOut = (fn: () => void) => (onSignedOut = fn)
export const hasRefreshToken = () => !!store.get()

const offline = () => new ApiError(0, 'NETWORK', { ar: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مجدداً.', en: 'Could not reach the server. Check your internet connection and try again.' })

async function raw(method: string, path: string, body?: unknown, token = access, form?: FormData): Promise<Response> {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined && !form) headers['content-type'] = 'application/json'
  try {
    return await fetch(`${API}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) })
  } catch {
    throw offline()
  }
}

async function fail(res: Response): Promise<never> {
  let j: { code?: string; message?: Bi | string; details?: unknown } = {}
  try {
    j = await res.json()
  } catch {
    /* not JSON */
  }
  const m = j.message
  const msg: Bi = typeof m === 'object' && m && 'ar' in m ? m : { ar: typeof m === 'string' ? m : 'حدث خطأ غير متوقع', en: typeof m === 'string' ? m : 'Something went wrong' }
  throw new ApiError(res.status, j.code ?? 'ERROR', msg, j.details)
}

// Only one refresh at a time: several requests failing together share it.
// "denied" means the server said the session is over; "unreachable" means we could not ask (weak connection), so the session is kept.
type Refreshed = 'ok' | 'denied' | 'unreachable'
let refreshing: Promise<Refreshed> | null = null
async function refresh(): Promise<Refreshed> {
  const rt = store.get()
  if (!rt) return 'denied'
  refreshing ??= (async (): Promise<Refreshed> => {
    try {
      const res = await raw('POST', '/auth/refresh', { refreshToken: rt }, null)
      if (!res.ok) return res.status === 401 || res.status === 403 || res.status === 400 ? 'denied' : 'unreachable'
      const j = (await res.json()) as { accessToken: string; refreshToken: string }
      access = j.accessToken
      store.set(j.refreshToken)
      return 'ok'
    } catch {
      return 'unreachable'
    } finally {
      setTimeout(() => (refreshing = null), 0)
    }
  })()
  return refreshing
}

async function send<T>(method: string, path: string, body?: unknown, form?: FormData, asBlob = false): Promise<T> {
  let res = await raw(method, path, body, access, form)
  if (res.status === 401) {
    const r = await refresh()
    if (r === 'ok') res = await raw(method, path, body, access, form)
    else if (r === 'unreachable') throw offline() // keep the session; the request can be retried when the connection is back
  }
  if (res.status === 401) {
    access = null
    store.set(null)
    onSignedOut?.()
  }
  if (!res.ok) return fail(res)
  if (res.status === 204) return undefined as T
  return (asBlob ? await res.blob() : await res.json()) as T
}

export const api = {
  get: <T = unknown>(p: string) => send<T>('GET', p),
  post: <T = unknown>(p: string, b?: unknown) => send<T>('POST', p, b ?? {}),
  put: <T = unknown>(p: string, b?: unknown) => send<T>('PUT', p, b ?? {}),
  patch: <T = unknown>(p: string, b?: unknown) => send<T>('PATCH', p, b ?? {}),
  del: <T = unknown>(p: string) => send<T>('DELETE', p),
  upload: <T = unknown>(p: string, form: FormData) => send<T>('POST', p, undefined, form),
  blob: (p: string) => send<Blob>('GET', p, undefined, undefined, true),
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
  mustChangePassword: boolean
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await raw('POST', '/auth/login', { email, password }, null)
  if (!res.ok) return fail(res)
  const j = (await res.json()) as LoginResult
  access = j.accessToken
  store.set(j.refreshToken)
  return j
}

/** Picks up a saved session (after a page reload). True when there is one that still works. */
export async function resume(): Promise<boolean> {
  if (access) return true
  return (await refresh()) === 'ok'
}

export async function logout() {
  const rt = store.get()
  access = null
  store.set(null)
  if (rt) await raw('POST', '/auth/logout', { refreshToken: rt }, null).catch(() => undefined)
}

export const changePassword = (currentPassword: string, newPassword: string) => api.post('/auth/change-password', { currentPassword, newPassword })
