// The store's write actions in live mode: each one asks the server, and the screen then shows what the server holds.
import type { Office, OrgSettings, Role, User } from '../data/types'
import { useStore } from '../lib/store'
import { api } from './http'
import { act } from './live'
import { useSecret } from './secret'

const orgBody = (o: OrgSettings, deduct?: string) => ({
  nameAr: o.name.ar, nameEn: o.name.en, shortNameAr: o.shortName.ar, shortNameEn: o.shortName.en, hqNameAr: o.hqName.ar, hqNameEn: o.hqName.en,
  logoUrl: o.logo || null, fiscalYearStartMonth: o.fiscalYearStartMonth, defaultLang: o.defaultLang,
  ...(deduct ? { payrollDeductionPct: deduct } : {}),
})

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
}
