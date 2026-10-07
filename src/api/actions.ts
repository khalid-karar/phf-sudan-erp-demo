// The store's write actions in live mode: each one asks the server, and the screen then shows what the server holds.
import type { Account, PayMethod, SettlementItem, FieldActivity, FieldReport, ApprovalRule, ControlMode, Office, OrgSettings, Reallocation, Role, SpendRequest, User } from '../data/types'
import { useStore } from '../lib/store'
import { ApiError, api } from './http'
import { act, errorText, refreshData } from './live'
import { useSecret } from './secret'
import { BANK_PTS, BANK_SDG, BANK_USD, cashAccount } from '../data/finance'

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

  // ── Field activities and reports ──
  saveActivity: async (a: FieldActivity): Promise<FieldActivity | null> => {
    const st = useStore.getState()
    const exists = st.activities.some((x) => x.id === a.id)
    const body = { titleAr: a.title.ar, titleEn: a.title.en, type: a.type ?? 'other', plannedDate: a.date.slice(0, 10), location: a.location || undefined, plannedUsd: a.plannedUSD ? String(a.plannedUSD) : undefined, inKind: !!a.inKind }
    let made: FieldActivity | null = null
    const ok = await act(async () => {
      if (exists) await api.patch(`/activities/${a.id}`, body)
      else {
        const r = await api.post<{ id: string }>('/activities', { ...body, officeId: a.officeId, lineId: a.lineId })
        made = { ...a, id: r.id }
      }
    }, { ok: exists ? { ar: `حُفظ النشاط ${a.code}`, en: `${a.code} saved` } : { ar: 'أُنشئ النشاط', en: 'Activity created' } })
    if (!ok) return null
    const fresh = useStore.getState().activities
    return fresh.find((x) => x.id === (made?.id ?? a.id)) ?? made ?? a
  },

  submitReport: async (activityId: string, report: FieldReport): Promise<'sent' | 'queued' | null> => {
    const st = useStore.getState()
    const offline = st.offlineSim || (typeof navigator !== 'undefined' && navigator.onLine === false)
    const queue = () => {
      useStore.setState((s) => ({ outbox: [...s.outbox, { id: `ob-${Date.now()}`, activityId, report: { ...report, via: 'offline' }, savedAt: new Date().toISOString() }] }))
      useStore.getState().toast({ ar: 'لا يوجد اتصال — حُفظ التقرير على الجهاز وسيُرسل تلقائياً عند عودة الإنترنت', en: 'No connection — the report is saved on this device and will be sent automatically when you are back online' }, 'warn')
      return 'queued' as const
    }
    if (offline) return queue()
    try {
      await sendReport(activityId, report)
    } catch (e) {
      if (e instanceof ApiError) {
        useStore.getState().toast(errorText(e), 'bad')
        return null
      }
      return queue() // the network dropped: keep the work
    }
    await refreshData().catch(() => undefined)
    useStore.getState().toast({ ar: 'أُرسل التقرير الفني', en: 'Field report sent' }, 'ok')
    return 'sent'
  },

  setOfflineSim: (v: boolean) => {
    useStore.setState({ offlineSim: v })
    if (!v && useStore.getState().outbox.length) void liveActions.syncOutbox()
  },

  syncOutbox: async () => {
    const items = useStore.getState().outbox
    if (!items.length || syncing) return
    syncing = true
    let sent = 0
    const done = new Set<string>()
    try {
      for (const it of items) {
        try {
          await sendReport(it.activityId, it.report)
          sent++
          done.add(it.id)
        } catch (e) {
          if (!(e instanceof ApiError)) break // still offline: try again later
          if (e.status === 409) done.add(it.id) // already filed
          else useStore.getState().toast(errorText(e), 'bad') // stays in the list so nothing is lost silently
        }
      }
    } finally {
      syncing = false
    }
    if (done.size) useStore.setState((s) => ({ outbox: s.outbox.filter((o) => !done.has(o.id)) }))
    await refreshData().catch(() => undefined)
    if (sent) useStore.getState().toast({ ar: `عاد الاتصال — أُرسل ${sent} تقرير محفوظ`, en: `Back online — ${sent} saved report(s) sent` }, 'ok')
  },

  linkExpense: (expenseId: string, activityCode: string) => {
    const a = useStore.getState().activities.find((x) => x.code === activityCode)
    if (!a) return Promise.resolve(false)
    return act(() => api.post(`/projects/expenses/${expenseId}/link`, { activityId: a.id }), { ok: { ar: `رُبط المصروف بالنشاط ${activityCode}`, en: `Expense linked to ${activityCode}` } })
  },

  importReports: async (rows: { activityId: string; report: FieldReport }[]) => {
    let good = 0
    for (const r of rows) {
      try {
        await sendReport(r.activityId, { ...r.report, via: 'excel' })
        good++
      } catch (e) {
        useStore.getState().toast(errorText(e), 'bad')
      }
    }
    await refreshData().catch(() => undefined)
    if (good) useStore.getState().toast({ ar: `استُورد ${good} تقرير من ملف Excel`, en: `${good} report(s) imported from Excel` }, 'ok')
    return good === rows.length
  },
}

const closingPeriod = () => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

Object.assign(liveActions, {
  issuePayment: (requestId: string, method: PayMethod, staffId?: string) => {
    const st = useStore.getState()
    const req = st.requests.find((r) => r.id === requestId)
    if (!req) return Promise.resolve(false)
    const accountCode =
      method === 'cash' || method === 'advance' ? cashAccount(req.officeId, st.accounts) : req.currency === 'USD' && method === 'bank' ? BANK_USD : req.officeId === 'pts' && method === 'bank' ? BANK_PTS : BANK_SDG
    const holder = method === 'advance' ? st.users.find((u) => u.id === staffId) : undefined
    return act(
      () => api.post(`/finance/requests/${requestId}/pay`, { method, accountCode, ...(holder ? { holderUserId: holder.id, party: holder.name.en } : {}) }),
      { ok: method === 'advance' ? { ar: 'صُرفت العهدة — تُسوّى بعد التقرير الفني', en: 'Advance issued — settle it after the field report' } : { ar: 'صدر سند الصرف وقُيّد في الدفتر', en: 'Payment voucher issued and posted' } },
    )
  },
  recordReceipt: (d: { projectId?: string; amountUSD: number; account: string; revenueAccount: string; party: string; memo: string }) =>
    act(() => api.post('/finance/receipts', { accountCode: d.account, revenueAccountCode: d.revenueAccount, amount: String(d.amountUSD), currency: 'USD', party: d.party, memo: d.memo, projectId: d.projectId ?? null }), { ok: { ar: 'سُجّل سند القبض', en: 'Receipt voucher recorded' } }),
  settleAdvance: (id: string, items: SettlementItem[]) =>
    act(() => api.post(`/finance/advances/${id}/settle`, { items: items.map((i) => ({ description: i.description, receiptNo: i.receiptNo || undefined, amount: String(i.amountUSD) })) }), { ok: { ar: 'تمت التسوية وترحيل القيد', en: 'Settled and posted' } }),
  addAccount: (a: Account) =>
    act(() => api.post('/finance/accounts', { code: a.code, parentCode: a.parent, nameAr: a.name.ar, nameEn: a.name.en, postable: a.postable, currency: a.currency ?? 'USD', officeId: a.officeId ?? null }), { ok: { ar: `أُضيف الحساب ${a.code}`, en: `Account ${a.code} added` } }),
  setLineAccount: (lineId: string, code: string) => {
    useStore.setState((s) => ({ lineMap: { ...s.lineMap, [lineId]: code } }))
    return act(() => api.patch(`/projects/lines/${lineId}`, { expenseAccountCode: code }))
  },
  addRate: (rate: number) => act(() => api.post('/finance/rates', { date: todayIso(), rate: String(rate), source: 'Manual' }), { ok: { ar: 'سُجّل سعر الصرف', en: 'Exchange rate recorded' } }),
  postRevaluation: () => act(() => api.post('/finance/revaluation', {}), { ok: { ar: 'رُحّل قيد فروق العملة', en: 'FX revaluation entry posted' } }),
  setCashCounted: (officeId: string, v: boolean) => {
    useStore.setState((s) => ({ closes: s.closes.map((c) => (c.officeId === officeId ? { ...c, cashCounted: v } : c)) }))
    return act(() => api.put(`/finance/close/${closingPeriod()}/${officeId}/cash-counted`, { counted: v }))
  },
  closeMonth: (officeId: string) => act(() => api.post(`/finance/close/${closingPeriod()}/${officeId}`, {}), { ok: { ar: 'أُقفل الشهر للمكتب', en: 'Month closed for the office' } }),
})

let syncing = false

/** One report to the server: the same report sent twice is filed once (the device id is the activity's), then its photos. */
async function sendReport(activityId: string, r: FieldReport) {
  const filed = await api.post<{ id: string }>(`/activities/${activityId}/report`, {
    clientId: `rpt-${activityId}`,
    doneOn: r.doneOn?.slice(0, 10),
    beneficiaries: r.beneficiaries,
    men: r.men,
    women: r.women,
    children: r.children,
    summary: r.summary.ar || r.summary.en,
    issues: r.issues || undefined,
    actualUsd: r.actualUSD === undefined ? undefined : String(r.actualUSD),
    lat: r.lat,
    lon: r.lon,
    via: r.via ?? 'online',
  })
  for (const [i, p] of (r.photos ?? []).entries()) {
    try {
      const blob = await (await fetch(p)).blob()
      const f = new FormData()
      f.append('ownerType', 'field_report')
      f.append('ownerId', filed.id)
      f.append('file', blob, `photo-${i + 1}.jpg`)
      await api.upload('/attachments', f)
    } catch {
      /* the report is filed; a photo that fails to upload can be added again later */
    }
  }
}
