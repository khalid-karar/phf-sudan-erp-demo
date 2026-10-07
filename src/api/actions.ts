// The store's write actions in live mode: each one asks the server, and the screen then shows what the server holds.
import type { ApprovalRule, ControlMode, Office, OrgSettings, Reallocation, Role, SpendRequest, User } from '../data/types'
import { useStore } from '../lib/store'
import { api } from './http'
import { act, errorText, refreshData } from './live'
import { useSecret } from './secret'

const orgBody = (o: OrgSettings, deduct?: string) => ({
  nameAr: o.name.ar, nameEn: o.name.en, shortNameAr: o.shortName.ar, shortNameEn: o.shortName.en, hqNameAr: o.hqName.ar, hqNameEn: o.hqName.en,
  logoUrl: o.logo || null, fiscalYearStartMonth: o.fiscalYearStartMonth, defaultLang: o.defaultLang,
  ...(deduct ? { payrollDeductionPct: deduct } : {}),
})

// Typing in a field changes the screen at once; the server gets the final value a moment after the person stops.
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function later(key: string, run: () => Promise<unknown>) {
  clearTimeout(timers.get(key))
  timers.set(
    key,
    setTimeout(async () => {
      timers.delete(key)
      try {
        await run()
      } catch (e) {
        useStore.getState().toast(errorText(e), 'bad')
        await refreshData().catch(() => undefined)
        return
      }
      // Another edit still waiting would be overwritten by a reload, so reload only when things are quiet.
      if (timers.size === 0) await refreshData().catch(() => undefined)
    }, 700),
  )
}
const ruleBody = (r: ApprovalRule) => ({ nameAr: r.name.ar, nameEn: r.name.en, kind: r.appliesTo, minUsd: String(r.minUSD), maxUsd: r.maxUSD === null ? null : String(r.maxUSD), officeId: r.officeId, chain: r.chain, active: r.active })

export const liveActions = {
  setOrg: (patch: Partial<OrgSettings>) => act(() => api.put('/org/settings', orgBody({ ...useStore.getState().org, ...patch })), { core: true, ok: { ar: 'حُفظت إعدادات المؤسسة', en: 'Organization settings saved' } }),

  saveOffice: (o: Office) => {
    const exists = useStore.getState().offices.some((x) => x.id === o.id)
    const body = { nameAr: o.name.ar, nameEn: o.name.en, stateAr: o.state.ar, stateEn: o.state.en, type: o.type ?? 'office', lat: o.lat || null, lon: o.lon || null, phone: o.phone ?? null, managerId: o.managerId ?? null, active: o.active !== false }
    return act(() => (exists ? api.patch(`/offices/${o.id}`, body) : api.post('/offices', { id: o.id, ...body })), { core: true, ok: { ar: `حُفظ مكتب ${o.name.ar}`, en: `${o.name.en} office saved` } })
  },

  saveUser: (u: User) => {
    const exists = useStore.getState().users.some((x) => x.id === u.id)
    const common = { nameAr: u.name.ar, nameEn: u.name.en, phone: u.phone ?? null, roleId: u.role, officeId: u.officeId }
    return act(
      async () => {
        if (exists) return api.patch(`/users/${u.id}`, { ...common, active: u.active !== false })
        const r = await api.post<{ temporaryPassword?: string | null }>('/users', { ...common, email: u.email })
        if (r.temporaryPassword) useSecret.getState().show({ who: u.name[useStore.getState().lang], email: u.email ?? '', password: r.temporaryPassword })
      },
      { core: true, ok: { ar: `حُفظ المستخدم ${u.name.ar}`, en: `${u.name.en} saved` } },
    )
  },

  saveRole: (r: Role) => {
    const exists = useStore.getState().roles.some((x) => x.id === r.id)
    const body = { nameAr: r.name.ar, nameEn: r.name.en, descAr: r.description?.ar ?? '', descEn: r.description?.en ?? '', permissions: r.permissions, scope: r.scope, canApprove: r.canApprove }
    return act(() => (exists ? api.patch(`/roles/${r.id}`, body) : api.post('/roles', { id: r.id, ...body })), { core: true })
  },

  deleteRole: (id: string) => act(() => api.del(`/roles/${id}`), { core: true, ok: { ar: 'حُذف الدور', en: 'Role deleted' } }),

  submitRequest: async (d: { officeId: string; projectId: string; lineId: string; amount: number; currency: 'SDG' | 'USD'; purpose: string; activityCode?: string }): Promise<SpendRequest | null> => {
    const st = useStore.getState()
    const activityId = d.activityCode ? st.activities.find((a) => a.code === d.activityCode)?.id ?? null : null
    let id = ''
    const ok = await act(async () => {
      const r = await api.post<{ id: string }>('/requests', { officeId: d.officeId, lineId: d.lineId, activityId, purpose: d.purpose, amount: String(d.amount), currency: d.currency })
      id = r.id
    }, { ok: { ar: 'أُرسل الطلب للاعتماد', en: 'Request sent for approval' } })
    return ok ? useStore.getState().requests.find((r) => r.id === id) ?? null : null
  },
  decideRequest: (id: string, approve: boolean, note?: string) =>
    act(() => api.post(`/requests/${id}/decision`, { decision: approve ? 'approve' : 'reject', note }), { ok: approve ? { ar: 'تم الاعتماد', en: 'Approved' } : { ar: 'تم الرفض', en: 'Rejected' } }),

  submitReallocation: async (d: { projectId: string; fromLineId: string; toLineId: string; amountUSD: number; reason: string }): Promise<Reallocation | null> => {
    let id = ''
    const ok = await act(async () => {
      const r = await api.post<{ id: string }>('/reallocations', { fromLineId: d.fromLineId, toLineId: d.toLineId, amountUsd: String(d.amountUSD), reason: d.reason })
      id = r.id
    }, { ok: { ar: 'أُرسل طلب النقل للاعتماد', en: 'Reallocation sent for approval' } })
    return ok ? useStore.getState().reallocations.find((r) => r.id === id) ?? null : null
  },
  decideReallocation: (id: string, approve: boolean, note?: string) =>
    act(() => api.post(`/reallocations/${id}/decision`, { decision: approve ? 'approve' : 'reject', note }), { ok: approve ? { ar: 'تم الاعتماد', en: 'Approved' } : { ar: 'تم الرفض', en: 'Rejected' } }),

  updateRule: (id: string, patch: Partial<ApprovalRule>) => {
    useStore.setState((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    later(`rule:${id}`, () => {
      const r = useStore.getState().rules.find((x) => x.id === id)
      return r ? api.put(`/approval-rules/${id}`, ruleBody(r)) : Promise.resolve()
    })
  },
  addRule: (kind: ApprovalRule['appliesTo']) =>
    act(() => api.post('/approval-rules', ruleBody({ id: '', name: { ar: 'قاعدة جديدة', en: 'New rule' }, minUSD: 0, maxUSD: null, appliesTo: kind, officeId: null, chain: ['supervisor'], active: false })), { ok: { ar: 'أُضيفت قاعدة — فعّلها بعد ضبطها', en: 'Rule added — switch it on once it is set' } }),
  removeRule: (id: string) => act(() => api.del(`/approval-rules/${id}`), { ok: { ar: 'حُذفت القاعدة', en: 'Rule deleted' } }),

  setProjectControl: (projectId: string, mode: ControlMode, tolerancePct: number) => {
    useStore.setState((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, controlMode: mode, tolerancePct } : p)) }))
    later(`control:${projectId}`, () => api.patch(`/projects/${projectId}/control`, { controlMode: mode, tolerancePct }))
  },
}
