// The store's write actions in live mode: each one asks the server, and the screen then shows what the server holds.
import type { ChannelConfig, Channel, Deadline, NotifRule, Beneficiary, Service, ServiceType, Employee, LeaveRequest, Item, ShipmentLine, Vehicle, FuelLog, Account, PayMethod, SettlementItem, FieldActivity, FieldReport, ApprovalRule, ControlMode, Office, OrgSettings, Reallocation, Role, SpendRequest, User } from '../data/types'
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

Object.assign(liveActions, {
  saveItem: (i: Item) => {
    const exists = useStore.getState().items.some((x) => x.id === i.id)
    const body = { nameAr: i.name.ar, nameEn: i.name.en, unitAr: i.unit.ar, unitEn: i.unit.en, unitValue: String(i.unitValueUSD), minQty: i.min }
    return act(() => (exists ? api.patch(`/supply/items/${i.id}`, { ...body, active: i.active !== false }) : api.post('/supply/items', { ...body, code: i.code, category: i.category })), { ok: { ar: 'حُفظ الصنف', en: 'Item saved' } })
  },
  receiveSupplies: (d: { officeId: string; source: string; lines: { itemId: string; qty: number; expiry?: string }[] }) =>
    act(() => api.post('/supply/receipts', { officeId: d.officeId, source: d.source, lines: d.lines.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty, expiry: l.expiry || undefined })) }), { ok: { ar: 'سُجّل الاستلام في المخزن', en: 'Receipt recorded in stock' } }),
  issueSupplies: (d: { officeId: string; activityId?: string; lines: { itemId: string; qty: number }[] }) => {
    const a = useStore.getState().activities.find((x) => x.id === d.activityId || x.code === d.activityId)
    return act(() => api.post('/supply/issues', { officeId: d.officeId, activityId: a?.id ?? d.activityId ?? '', lines: d.lines.filter((l) => l.qty > 0) }), { ok: { ar: 'صُرفت المواد للنشاط', en: 'Stock issued to the activity' } })
  },
  createShipment: (d: { fromOfficeId: string; toOfficeId: string; vehicleId?: string; driver?: string; note?: string; lines: ShipmentLine[] }) =>
    act(() => api.post('/supply/shipments', { fromOfficeId: d.fromOfficeId, toOfficeId: d.toOfficeId, vehicleId: d.vehicleId, driver: d.driver || undefined, note: d.note, lines: d.lines.filter((l) => l.qty > 0).map((l) => ({ itemId: l.itemId, qty: l.qty })) }), { ok: { ar: 'أُنشئت الشحنة', en: 'Shipment created' } }),
  dispatchShipment: (id: string) => act(() => api.post(`/supply/shipments/${id}/dispatch`, {}), { ok: { ar: 'خرجت الشحنة', en: 'Shipment dispatched' } }),
  receiveShipment: (id: string, received: Record<string, number>) =>
    act(() => api.post(`/supply/shipments/${id}/receive`, { lines: Object.entries(received).map(([itemId, r]) => ({ itemId, received: r })) }), { ok: { ar: 'تم تأكيد استلام الشحنة', en: 'Shipment receipt confirmed' } }),
  saveVehicle: (v: Vehicle) => act(() => api.patch(`/logistics/vehicles/${v.id}`, { status: v.status, driver: v.driver.en || v.driver.ar || null, nextServiceKm: v.nextServiceKm || null }), { ok: { ar: 'حُفظت المركبة', en: 'Vehicle saved' } }),
  addFuel: (vehicleId: string, f: Omit<FuelLog, 'id'>) =>
    act(() => api.post(`/logistics/vehicles/${vehicleId}/fuel`, { liters: String(f.liters), costSdg: String(f.costSDG), odometer: f.odometer }), { ok: { ar: 'سُجّل الوقود', en: 'Fuel recorded' } }),
})

Object.assign(liveActions, {
  saveEmployee: (e: Employee) => {
    const exists = useStore.getState().employees.some((x) => x.id === e.id)
    const allocations = e.allocations.filter((a) => a.pct > 0).map((a) => ({ lineId: a.lineId, pct: Math.round(a.pct) }))
    const common = { nameAr: e.name.ar, nameEn: e.name.en, officeId: e.officeId, positionAr: e.position.ar, positionEn: e.position.en, department: e.department, contract: e.contract, salarySdg: String(e.salarySDG), phone: e.phone || undefined, leaveBalance: e.leaveBalance, allocations }
    return act(
      () => (exists ? api.patch(`/hr/employees/${e.id}`, { ...common, phone: e.phone || null, endDate: e.endDate ?? null, status: e.status === 'ended' ? 'ended' : 'active', userId: e.userId ?? null }) : api.post('/hr/employees', { ...common, startDate: e.startDate.slice(0, 10), endDate: e.endDate?.slice(0, 10), userId: e.userId })),
      { ok: { ar: 'حُفظ الموظف', en: 'Employee saved' } },
    )
  },
  requestLeave: (l: Omit<LeaveRequest, 'id' | 'status' | 'createdAt'>) =>
    act(() => api.post('/hr/leave', { employeeId: l.employeeId, type: l.type, from: l.from.slice(0, 10), to: l.to.slice(0, 10), note: l.note }), { ok: { ar: 'أُرسل طلب الإجازة', en: 'Leave request sent' } }),
  decideLeave: (id: string, approve: boolean) =>
    act(() => api.post(`/hr/leave/${id}/decision`, { decision: approve ? 'approve' : 'reject' }), { ok: approve ? { ar: 'اعتُمدت الإجازة', en: 'Leave approved' } : { ar: 'رُفضت الإجازة', en: 'Leave rejected' } }),
  postPayroll: (period: string) => act(() => api.post('/hr/payroll', { period, accountCode: BANK_SDG }), { ok: { ar: 'رُحّلت الرواتب', en: 'Payroll posted' } }),
})

const touchPatients = () => useStore.setState((s) => ({ patientsVersion: (s.patientsVersion ?? 0) + 1 }))

Object.assign(liveActions, {
  saveBeneficiary: async (b: Beneficiary, opts?: { firstService?: ServiceType; notDuplicate?: boolean }) => {
    const isNew = !b.no
    const common = { nameAr: b.name.ar || b.name.en, gender: b.gender, birthYear: b.birthYear, locality: b.locality || undefined, displaced: b.displaced, phone: b.phone || undefined }
    const ok = await act(
      () =>
        isNew
          ? api.post('/patients', { ...common, nameEn: b.name.en || undefined, officeId: b.officeId, confirmNotDuplicate: !!opts?.notDuplicate, service: opts?.firstService ? { type: opts.firstService } : undefined })
          : api.patch(`/patients/${b.id}`, { ...common, nameEn: b.name.en || null, locality: b.locality || null, phone: b.phone || null }),
      { ok: isNew ? { ar: 'سُجّل المستفيد', en: 'Beneficiary registered' } : { ar: 'حُفظت البيانات', en: 'Saved' } },
    )
    if (ok) touchPatients()
    return ok
  },
  addService: async (id: string, sv: Omit<Service, 'id'>) => {
    const ok = await act(() => api.post(`/patients/${id}/services`, { type: sv.type, date: sv.date.slice(0, 10), activityId: sv.activityId, note: sv.note }), { ok: { ar: 'سُجّلت الخدمة', en: 'Service recorded' } })
    if (ok) touchPatients()
    return ok
  },
})

Object.assign(liveActions, {
  saveNotifRule: (r: NotifRule) => {
    const exists = useStore.getState().notifRules.some((x) => x.id === r.id)
    const body = { event: r.event, nameAr: r.name.ar, nameEn: r.name.en, threshold: r.threshold ?? null, recipients: r.recipients, channels: { inapp: r.channels.inapp, email: r.channels.email, whatsapp: r.channels.whatsapp, sms: r.channels.sms }, enabled: r.enabled }
    return act(() => (exists ? api.patch(`/notification-rules/${r.id}`, body) : api.post('/notification-rules', body)), { ok: { ar: 'حُفظت قاعدة التنبيه', en: 'Notification rule saved' } })
  },
  deleteNotifRule: (id: string) => act(() => api.del(`/notification-rules/${id}`), { ok: { ar: 'حُذفت القاعدة', en: 'Rule deleted' } }),

  markRead: (id: string) => {
    const me = useStore.getState().userId
    useStore.setState((s) => ({ notifications: s.notifications.map((n) => (n.id === id && !n.readBy.includes(me) ? { ...n, readBy: [...n.readBy, me] } : n)) }))
    void api.post(`/notifications/${id}/read`, {}).catch(() => undefined)
  },
  markAllRead: () => {
    const me = useStore.getState().userId
    useStore.setState((s) => ({ notifications: s.notifications.map((n) => (n.readBy.includes(me) ? n : { ...n, readBy: [...n.readBy, me] })) }))
    void api.post('/notifications/read-all', {}).catch(() => undefined)
  },

  saveDeadline: (d: Deadline) => {
    const exists = useStore.getState().deadlines.some((x) => x.id === d.id)
    const body = { titleAr: d.title.ar, titleEn: d.title.en, projectId: d.projectId ?? null, due: d.due.slice(0, 10), notifyDaysBefore: d.notifyDaysBefore, ownerRoleId: d.owner, recurrence: d.recurrence ?? 'none' }
    return act(
      () => (!exists ? api.post('/deadlines', body) : d.done ? api.post(`/deadlines/${d.id}/done`, {}) : api.patch(`/deadlines/${d.id}`, body)),
      { ok: exists ? { ar: 'حُفظ الموعد', en: 'Deadline saved' } : { ar: 'أُضيف الموعد وسيُنبَّه المسؤول قبله', en: 'Deadline added; its owner will be reminded before it' } },
    )
  },
  deleteDeadline: (id: string) => act(() => api.del(`/deadlines/${id}`), { ok: { ar: 'حُذف الموعد', en: 'Deadline deleted' } }),

  setChannels: (patch: Partial<ChannelConfig>) => {
    const cur = useStore.getState().channels
    return act(async () => {
      for (const ch of Object.keys(patch) as Channel[]) {
        const c = { ...(patch[ch] as unknown as Record<string, unknown>) }
        delete c.lastTest
        if (JSON.stringify(c) !== JSON.stringify({ ...(cur[ch] as unknown as Record<string, unknown>), lastTest: undefined })) await api.put(`/channels/${ch}`, c)
      }
    }, { core: false })
  },
  runChannelTest: async (ch: Channel, to: string, draft?: ChannelConfig) => {
    const cfg = { ...((draft ?? useStore.getState().channels)[ch] as unknown as Record<string, unknown>) }
    delete cfg.lastTest
    try {
      const r = await api.post<{ ok: boolean; message: { ar: string; en: string } }>(`/channels/${ch}/test`, { to, config: cfg })
      useStore.getState().toast(r.message, r.ok ? 'ok' : 'bad')
      return { at: new Date().toISOString(), ok: r.ok, message: r.message }
    } catch (e) {
      const m = errorText(e)
      useStore.getState().toast(m, 'bad')
      return { at: new Date().toISOString(), ok: false, message: m }
    }
  },
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
