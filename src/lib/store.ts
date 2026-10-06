import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { buildSeed, daysFromNow, offices as seedOffices, orgDefaults, projects as seedProjects, roles as seedRoles, users as seedUsers } from '../data/seed'
import {
  accounts as seedAccounts,
  ADVANCES,
  BANK_PTS,
  BANK_SDG,
  BANK_USD,
  buildFinance,
  cashAccount,
  defaultLineMap,
  FX_GAIN,
  FX_LOSS,
  rates as seedRates,
  staff,
} from '../data/finance'
import type {
  Access,
  ModuleKey,
  Office,
  OrgSettings,
  Role,
  User,
  Account,
  Advance,
  ApprovalRule,
  ApprovalStep,
  Bi,
  ControlMode,
  Expense,
  JournalEntry,
  JournalLine,
  Lang,
  MonthClose,
  PayMethod,
  Project,
  RateEntry,
  Reallocation,
  SettlementItem,
  SpendRequest,
  Voucher,
} from '../data/types'
import { checkCeiling, findLine, routeApproval } from './budget'
import { revaluation } from './ledger'

export interface Toast {
  id: number
  text: Bi
  tone: 'ok' | 'warn' | 'bad'
}

interface State {
  lang: Lang
  userId: string
  org: OrgSettings
  offices: Office[]
  users: User[]
  roles: Role[]
  sidebarCollapsed: boolean

  setOrg: (patch: Partial<OrgSettings>) => void
  saveOffice: (o: Office) => void
  saveUser: (u: User) => void
  saveRole: (r: Role) => void
  deleteRole: (id: string) => void
  setSidebarCollapsed: (v: boolean) => void
  projects: Project[]
  expenses: Expense[]
  requests: SpendRequest[]
  reallocations: Reallocation[]
  rules: ApprovalRule[]
  deadlines: ReturnType<typeof buildSeed>['deadlines']
  toasts: Toast[]
  seq: number

  // finance
  accounts: Account[]
  lineMap: Record<string, string>
  journal: JournalEntry[]
  vouchers: Voucher[]
  advances: Advance[]
  rates: RateEntry[]
  closes: MonthClose[]
  fseq: { je: number; pv: number; rv: number; adv: number }

  issuePayment: (requestId: string, method: PayMethod, staffId?: string) => void
  recordReceipt: (d: { projectId?: string; amountUSD: number; account: string; revenueAccount: string; party: string; memo: string }) => void
  settleAdvance: (id: string, items: SettlementItem[], reportNo: string) => void
  addAccount: (a: Account) => void
  setLineAccount: (lineId: string, code: string) => void
  addRate: (rate: number) => void
  postRevaluation: () => void
  setCashCounted: (officeId: string, v: boolean) => void
  closeMonth: (officeId: string) => void

  setLang: (l: Lang) => void
  setUser: (id: string) => void
  reset: () => void
  toast: (text: Bi, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void

  submitRequest: (draft: {
    officeId: string
    projectId: string
    lineId: string
    amount: number
    currency: 'SDG' | 'USD'
    purpose: string
    activityCode?: string
  }) => SpendRequest | null
  decideRequest: (id: string, approve: boolean, note?: string) => void

  submitReallocation: (draft: { projectId: string; fromLineId: string; toLineId: string; amountUSD: number; reason: string }) => Reallocation
  decideReallocation: (id: string, approve: boolean, note?: string) => void

  updateRule: (id: string, patch: Partial<ApprovalRule>) => void
  addRule: (kind: ApprovalRule['appliesTo']) => void
  removeRule: (id: string) => void
  setProjectControl: (projectId: string, mode: ControlMode, tolerancePct: number) => void
}

const fresh = () => {
  const s = buildSeed()
  const lineMap = defaultLineMap()
  const f = buildFinance(s.expenses, lineMap)
  return {
    org: structuredClone(orgDefaults),
    offices: structuredClone(seedOffices),
    users: structuredClone(seedUsers),
    roles: structuredClone(seedRoles),
    accounts: structuredClone(seedAccounts),
    lineMap,
    journal: f.journal,
    vouchers: f.vouchers,
    advances: f.advances,
    rates: structuredClone(seedRates),
    closes: f.closes,
    fseq: { je: f.journal.length + 1, pv: f.nextPv, rv: f.nextRv, adv: 22 },
    projects: structuredClone(seedProjects),
    expenses: [...f.extraExpenses, ...s.expenses],
    requests: s.requests,
    reallocations: s.reallocations,
    rules: s.rules,
    deadlines: s.deadlines,
    seq: 143,
  }
}

// localStorage can throw (private mode, blocked storage); fall back to memory.
const mem = new Map<string, string>()
const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return mem.get(k) ?? null
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      mem.set(k, v)
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k)
    } catch {
      mem.delete(k)
    }
  },
}

const initialLang = (): Lang => {
  try {
    return (localStorage.getItem('phf-lang') as Lang) || 'ar'
  } catch {
    return 'ar'
  }
}

const decide = (steps: ApprovalStep[], userId: string, approve: boolean, note?: string) => {
  const next = steps.map((s) => ({ ...s }))
  const i = next.findIndex((s) => s.status === 'pending')
  if (i < 0) return { steps: next, done: true, approved: false }
  next[i] = { ...next[i], status: approve ? 'approved' : 'rejected', by: userId, at: new Date().toISOString(), note }
  if (!approve) return { steps: next, done: true, approved: false }
  if (i + 1 < next.length) {
    next[i + 1] = { ...next[i + 1], status: 'pending' }
    return { steps: next, done: false, approved: false }
  }
  return { steps: next, done: true, approved: true }
}

export const useStore = create<State>()(
  persist(
  (set, get) => ({
  lang: initialLang(),
  userId: 'u-fo',
  toasts: [],
  sidebarCollapsed: false,
  ...fresh(),

  setOrg: (patch) => {
    set((s) => ({ org: { ...s.org, ...patch } }))
    get().toast({ ar: 'حُفظت إعدادات المؤسسة', en: 'Organization settings saved' })
  },
  saveOffice: (o) => {
    const s = get()
    const exists = s.offices.some((x) => x.id === o.id)
    if (exists) {
      set({ offices: s.offices.map((x) => (x.id === o.id ? o : x)) })
      get().toast({ ar: `حُفظ مكتب ${o.name.ar}`, en: `${o.name.en} office saved` })
      return
    }
    // A new office gets its own cash box account and a month-close row.
    const boxes = s.accounts.filter((a) => a.parent === '1101')
    const code = `1101-${String(boxes.length + 1).padStart(2, '0')}`
    const acc: Account = { code, parent: '1101', name: { ar: `صندوق مكتب ${o.name.ar}`, en: `${o.name.en} cash box` }, type: 'asset', postable: true, currency: 'SDG', officeId: o.id }
    set({ offices: [...s.offices, o], accounts: [...s.accounts, acc], closes: [...s.closes, { officeId: o.id, cashCounted: false }] })
    get().toast({ ar: `أُضيف مكتب ${o.name.ar} وأُنشئ له حساب صندوق ${code}`, en: `${o.name.en} office added with cash box account ${code}` })
  },
  saveUser: (u) => {
    const s = get()
    const exists = s.users.some((x) => x.id === u.id)
    set({ users: exists ? s.users.map((x) => (x.id === u.id ? u : x)) : [...s.users, u] })
    get().toast(
      exists
        ? { ar: `حُفظ المستخدم ${u.name.ar}`, en: `${u.name.en} saved` }
        : { ar: `أُضيف ${u.name.ar} وأُرسلت دعوة الدخول إلى ${u.email ?? ''}`, en: `${u.name.en} added; sign-in invitation sent to ${u.email ?? ''}` },
    )
  },
  saveRole: (r) => {
    const s = get()
    const exists = s.roles.some((x) => x.id === r.id)
    set({ roles: exists ? s.roles.map((x) => (x.id === r.id ? r : x)) : [...s.roles, r] })
  },
  deleteRole: (id) => {
    set((s) => ({ roles: s.roles.filter((r) => r.id !== id) }))
    get().toast({ ar: 'حُذف الدور', en: 'Role deleted' }, 'warn')
  },
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  setLang: (lang) => {
    try {
      localStorage.setItem('phf-lang', lang)
    } catch {
      /* storage unavailable */
    }
    set({ lang })
  },
  setUser: (userId) => set({ userId }),
  reset: () => {
    set({ ...fresh(), userId: 'u-fo' })
    get().toast({ ar: 'أُعيدت بيانات العرض إلى وضعها الأصلي', en: 'Demo data restored to its starting point' })
  },
  toast: (text, tone = 'ok') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  submitRequest: (draft) => {
    const s = get()
    const found = findLine(s.projects, draft.lineId)
    if (!found) return null
    const rate = s.rates[s.rates.length - 1].rate
    const amountUSD = draft.currency === 'USD' ? draft.amount : draft.amount / rate
    const check = checkCeiling(found.project, found.pillar, found.line, amountUSD, s)
    if (check.verdict === 'blocked') return null
    const over = check.verdict === 'needs_extra_approval'
    const { rule, chain } = routeApproval(s.rules, 'spend', amountUSD, over, draft.officeId)
    const n = s.seq
    const req: SpendRequest = {
      id: `sr-${n}`,
      code: `SR-${String(n).padStart(4, '0')}`,
      officeId: draft.officeId,
      projectId: draft.projectId,
      lineId: draft.lineId,
      activityCode: draft.activityCode || undefined,
      purpose: { ar: draft.purpose, en: draft.purpose },
      amount: draft.amount,
      currency: draft.currency,
      rate,
      amountUSD: Math.round(amountUSD * 100) / 100,
      requesterId: s.userId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      overCeiling: over,
      ruleId: rule?.id,
      steps: chain.map((role, i) => ({ role, status: i === 0 ? 'pending' : 'waiting' })),
    }
    set({ requests: [req, ...s.requests], seq: n + 1 })
    get().toast({ ar: `أُرسل الطلب ${req.code} للاعتماد`, en: `${req.code} sent for approval` })
    return req
  },

  decideRequest: (id, approve, note) => {
    const s = get()
    const req = s.requests.find((r) => r.id === id)
    if (!req) return
    const r = decide(req.steps, s.userId, approve, note)
    const status = !approve ? 'rejected' : r.approved ? 'approved' : 'pending'
    set({ requests: s.requests.map((x) => (x.id === id ? { ...x, steps: r.steps, status } : x)) })
    get().toast(
      approve
        ? status === 'approved'
          ? { ar: `اكتمل اعتماد ${req.code} وحُجز المبلغ على البند`, en: `${req.code} fully approved; amount committed to the line` }
          : { ar: `اعتُمد ${req.code} وانتقل للمعتمد التالي`, en: `${req.code} approved and passed to the next approver` }
        : { ar: `رُفض ${req.code} وأُعيد المبلغ إلى رصيد البند`, en: `${req.code} rejected; amount released back to the line` },
      approve ? 'ok' : 'warn',
    )
  },

  submitReallocation: (draft) => {
    const s = get()
    const { chain } = routeApproval(s.rules, 'reallocation', draft.amountUSD)
    const n = s.seq
    const ra: Reallocation = {
      id: `ra-${n}`,
      code: `RA-${String(n).padStart(4, '0')}`,
      projectId: draft.projectId,
      fromLineId: draft.fromLineId,
      toLineId: draft.toLineId,
      amountUSD: draft.amountUSD,
      reason: { ar: draft.reason, en: draft.reason },
      requesterId: s.userId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      steps: chain.map((role, i) => ({ role, status: i === 0 ? 'pending' : 'waiting' })),
    }
    set({ reallocations: [ra, ...s.reallocations], seq: n + 1 })
    get().toast({ ar: `أُرسل طلب المناقلة ${ra.code} للاعتماد`, en: `Reallocation ${ra.code} sent for approval` })
    return ra
  },

  decideReallocation: (id, approve, note) => {
    const s = get()
    const ra = s.reallocations.find((r) => r.id === id)
    if (!ra) return
    const r = decide(ra.steps, s.userId, approve, note)
    const status = !approve ? 'rejected' : r.approved ? 'approved' : 'pending'
    set({ reallocations: s.reallocations.map((x) => (x.id === id ? { ...x, steps: r.steps, status } : x)) })
    get().toast(
      status === 'approved'
        ? { ar: `نُفّذت المناقلة ${ra.code} وتحدّثت سقوف البنود`, en: `${ra.code} applied; line ceilings updated` }
        : approve
          ? { ar: `اعتُمدت ${ra.code} وانتقلت للمعتمد التالي`, en: `${ra.code} approved and passed on` }
          : { ar: `رُفضت المناقلة ${ra.code}`, en: `${ra.code} rejected` },
      approve ? 'ok' : 'warn',
    )
  },


  // ---- finance ------------------------------------------------------------
  issuePayment: (requestId, method, staffId) => {
    const s = get()
    const req = s.requests.find((r) => r.id === requestId)
    if (!req || req.status !== 'approved') return
    const now = new Date().toISOString()
    const rate = s.rates[s.rates.length - 1].rate
    const dims = { officeId: req.officeId, projectId: req.projectId, lineId: req.lineId }
    const account =
      method === 'cash' || method === 'advance'
        ? cashAccount(req.officeId, s.accounts)
        : req.currency === 'USD' && method === 'bank'
          ? BANK_USD
          : req.officeId === 'pts' && method === 'bank'
            ? BANK_PTS
            : BANK_SDG
    const sdgAcc = s.accounts.find((a) => a.code === account)?.currency === 'SDG'
    const credit: JournalLine = { account, debit: 0, credit: req.amountUSD, sdg: sdgAcc ? -Math.round(req.amountUSD * rate) : undefined, officeId: req.officeId }
    const pvNo = `PV-${String(s.fseq.pv).padStart(4, '0')}`
    const jeNo = `JE-${String(s.fseq.je).padStart(4, '0')}`
    const line = findLine(s.projects, req.lineId)!.line
    let advance: Advance | undefined
    let expense: Expense | undefined
    let debit: JournalLine
    let memo: Bi
    if (method === 'advance') {
      const st = staffId ?? staff.find((x) => x.officeId === req.officeId)?.id ?? 's-ksl'
      const no = `ADV-${String(s.fseq.adv).padStart(4, '0')}`
      advance = {
        id: no.toLowerCase(),
        no,
        staffId: st,
        officeId: req.officeId,
        projectId: req.projectId,
        lineId: req.lineId,
        activityCode: req.activityCode ?? `ACT-${req.officeId.toUpperCase()}-${s.fseq.adv}`,
        requestId: req.id,
        amountUSD: req.amountUSD,
        issuedAt: now,
        dueAt: daysFromNow(14),
        status: 'open',
      }
      debit = { account: ADVANCES, debit: req.amountUSD, credit: 0, ...dims }
      memo = { ar: `صرف عهدة ${no} — ${req.code}`, en: `Advance ${no} — ${req.code}` }
    } else {
      expense = { id: `ex-${req.id}`, requestId: req.id, amountUSD: req.amountUSD, date: now, hasTechReport: false, ...dims }
      debit = { account: s.lineMap[req.lineId], debit: req.amountUSD, credit: 0, ...dims }
      memo = { ar: `${req.code} — ${line.code} ${line.name.ar}`, en: `${req.code} — ${line.code} ${line.name.en}` }
    }
    const je: JournalEntry = { id: `je-n${s.fseq.je}`, no: jeNo, date: now, memo, source: method === 'advance' ? 'advance' : 'payment', ref: advance?.no ?? pvNo, lines: [debit, credit] }
    const v: Voucher = {
      id: `pv-n${s.fseq.pv}`,
      no: pvNo,
      kind: 'payment',
      date: now,
      method,
      account,
      amountUSD: req.amountUSD,
      currency: req.currency,
      amount: req.amount,
      rate,
      party: advance ? staff.find((x) => x.id === advance!.staffId)!.name : { ar: 'المورد', en: 'Supplier' },
      memo: req.purpose,
      requestId: req.id,
      journalId: je.id,
      ...dims,
    }
    set({
      requests: s.requests.map((x) => (x.id === requestId ? { ...x, status: 'paid' } : x)),
      expenses: expense ? [expense, ...s.expenses] : s.expenses,
      advances: advance ? [advance, ...s.advances] : s.advances,
      journal: [...s.journal, je],
      vouchers: [v, ...s.vouchers],
      fseq: { ...s.fseq, je: s.fseq.je + 1, pv: s.fseq.pv + 1, adv: s.fseq.adv + (advance ? 1 : 0) },
    })
    get().toast(
      advance
        ? { ar: `صُرفت العهدة ${advance.no} — تُسوّى بعد التقرير الفني`, en: `Advance ${advance.no} issued — settle it after the field report` }
        : { ar: `صدر سند الصرف ${pvNo} والقيد ${jeNo}`, en: `Payment voucher ${pvNo} and entry ${jeNo} posted` },
    )
  },

  recordReceipt: (d) => {
    const s = get()
    const now = new Date().toISOString()
    const rate = s.rates[s.rates.length - 1].rate
    const rvNo = `RV-${String(s.fseq.rv).padStart(4, '0')}`
    const sdgAcc = s.accounts.find((a) => a.code === d.account)?.currency === 'SDG'
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: now,
      memo: { ar: d.memo, en: d.memo },
      source: 'receipt',
      ref: rvNo,
      lines: [
        { account: d.account, debit: d.amountUSD, credit: 0, sdg: sdgAcc ? Math.round(d.amountUSD * rate) : undefined, projectId: d.projectId, officeId: 'khr' },
        { account: d.revenueAccount, debit: 0, credit: d.amountUSD, projectId: d.projectId },
      ],
    }
    const v: Voucher = {
      id: `rv-n${s.fseq.rv}`,
      no: rvNo,
      kind: 'receipt',
      date: now,
      method: 'transfer',
      account: d.account,
      amountUSD: d.amountUSD,
      currency: sdgAcc ? 'SDG' : 'USD',
      amount: sdgAcc ? Math.round(d.amountUSD * rate) : d.amountUSD,
      rate,
      party: { ar: d.party, en: d.party },
      memo: { ar: d.memo, en: d.memo },
      officeId: 'khr',
      projectId: d.projectId,
      journalId: je.id,
    }
    set({ journal: [...s.journal, je], vouchers: [v, ...s.vouchers], fseq: { ...s.fseq, je: s.fseq.je + 1, rv: s.fseq.rv + 1 } })
    get().toast({ ar: `سُجّل سند القبض ${rvNo}`, en: `Receipt voucher ${rvNo} recorded` })
  },

  settleAdvance: (id, items, reportNo) => {
    const s = get()
    const a = s.advances.find((x) => x.id === id)
    if (!a || a.status !== 'open') return
    const now = new Date().toISOString()
    const rate = s.rates[s.rates.length - 1].rate
    const spent = Math.round(items.reduce((t, i) => t + i.amountUSD, 0) * 100) / 100
    const returned = Math.max(0, Math.round((a.amountUSD - spent) * 100) / 100)
    const reimbursed = Math.max(0, Math.round((spent - a.amountUSD) * 100) / 100)
    const dims = { officeId: a.officeId, projectId: a.projectId, lineId: a.lineId }
    const cash = cashAccount(a.officeId, s.accounts)
    const lines: JournalLine[] = [{ account: s.lineMap[a.lineId], debit: spent, credit: 0, ...dims }]
    if (returned > 0) lines.push({ account: cash, debit: returned, credit: 0, sdg: Math.round(returned * rate), officeId: a.officeId })
    lines.push({ account: ADVANCES, debit: 0, credit: a.amountUSD, ...dims })
    if (reimbursed > 0) lines.push({ account: cash, debit: 0, credit: reimbursed, sdg: -Math.round(reimbursed * rate), officeId: a.officeId })
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: now,
      memo: { ar: `تسوية عهدة ${a.no} — ${a.activityCode}`, en: `Settlement of advance ${a.no} — ${a.activityCode}` },
      source: 'settlement',
      ref: a.no,
      lines,
    }
    const expense: Expense = { id: `ex-${a.id}`, amountUSD: spent, date: now, hasTechReport: true, ...dims }
    set({
      advances: s.advances.map((x) => (x.id === id ? { ...x, status: 'settled', settlement: { at: now, items, returnedUSD: returned, reimbursedUSD: reimbursed, reportNo } } : x)),
      journal: [...s.journal, je],
      expenses: [expense, ...s.expenses],
      fseq: { ...s.fseq, je: s.fseq.je + 1 },
    })
    get().toast({ ar: `سُوّيت العهدة ${a.no} وطوبقت مع التقرير ${reportNo}`, en: `${a.no} settled and matched to report ${reportNo}` })
  },

  addAccount: (a) => {
    set((s) => ({ accounts: [...s.accounts, a] }))
    get().toast({ ar: `أُضيف الحساب ${a.code}`, en: `Account ${a.code} added` })
  },
  setLineAccount: (lineId, code) => set((s) => ({ lineMap: { ...s.lineMap, [lineId]: code } })),

  addRate: (rate) => {
    const s = get()
    const today = new Date().toDateString()
    const kept = s.rates.filter((r) => new Date(r.date).toDateString() !== today)
    set({ rates: [...kept, { date: new Date().toISOString(), rate, source: { ar: 'أدخله مدير الشؤون المالية', en: 'Entered by Finance Manager' } }] })
    get().toast({ ar: `اعتُمد سعر اليوم ${rate} ج.س للدولار`, en: `Today's rate set to ${rate} SDG per USD` })
  },

  postRevaluation: () => {
    const s = get()
    const rate = s.rates[s.rates.length - 1].rate
    const rows = revaluation(s.accounts, s.journal, rate).filter((r) => Math.abs(r.diff) >= 0.5)
    if (!rows.length) return
    const lines: JournalLine[] = []
    let net = 0
    for (const r of rows) {
      const d = Math.round(r.diff * 100) / 100
      net += d
      lines.push({ account: r.account.code, debit: d > 0 ? d : 0, credit: d < 0 ? -d : 0, sdg: 0, officeId: r.account.officeId })
    }
    net = Math.round(net * 100) / 100
    lines.push(net < 0 ? { account: FX_LOSS, debit: -net, credit: 0 } : { account: FX_GAIN, debit: 0, credit: net })
    const je: JournalEntry = {
      id: `je-n${s.fseq.je}`,
      no: `JE-${String(s.fseq.je).padStart(4, '0')}`,
      date: new Date().toISOString(),
      memo: { ar: `إعادة تقييم أرصدة الجنيه بسعر ${rate}`, en: `Revaluation of SDG balances at ${rate}` },
      source: 'fx',
      lines,
    }
    set({ journal: [...s.journal, je], fseq: { ...s.fseq, je: s.fseq.je + 1 } })
    get().toast({ ar: `رُحّل قيد فروق العملة ${je.no}`, en: `FX entry ${je.no} posted` }, net < 0 ? 'warn' : 'ok')
  },

  setCashCounted: (officeId, v) => set((s) => ({ closes: s.closes.map((c) => (c.officeId === officeId ? { ...c, cashCounted: v } : c)) })),
  closeMonth: (officeId) => {
    set((s) => ({ closes: s.closes.map((c) => (c.officeId === officeId ? { ...c, closedAt: new Date().toISOString(), closedBy: s.userId } : c)) }))
    get().toast({ ar: 'أُقفل الشهر للمكتب — لا يمكن الترحيل بتاريخ سابق', en: 'Month closed for the office — no back-dated posting' })
  },

  updateRule: (id, patch) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  addRule: (kind) =>
    set((s) => ({
      rules: [
        ...s.rules,
        {
          id: `r${Date.now()}`,
          name: { ar: 'قاعدة جديدة', en: 'New rule' },
          minUSD: 0,
          maxUSD: null,
          appliesTo: kind,
          officeId: null,
          chain: ['supervisor'],
          active: false,
        },
      ],
    })),
  removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
  setProjectControl: (projectId, mode, tolerancePct) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, controlMode: mode, tolerancePct } : p)) })),
  }),
  {
    name: 'phf-erp-demo-v3',
    storage: createJSONStorage(() => safeStorage),
    partialize: (s) => {
      const { toasts: _t, ...rest } = s
      void _t
      return rest
    },
  },
  ),
)

// Role names are read outside React in a few places; keep a live copy.
const syncRoles = () => ((globalThis as { __phfRoles?: Role[] }).__phfRoles = useStore.getState().roles)
syncRoles()
useStore.subscribe(syncRoles)

export const getOffices = () => useStore.getState().offices
export const getUsers = () => useStore.getState().users

const rank: Record<Access, number> = { none: 0, view: 1, edit: 2, manage: 3 }
export function usePerm() {
  const user = useUser()
  const role = useStore((s) => s.roles.find((r) => r.id === user.role))
  const can = (m: ModuleKey, min: Access = 'view') => !!role && rank[role.permissions[m]] >= rank[min]
  const scopeOffice = role?.scope === 'office' ? user.officeId : null
  return { can, role, user, scopeOffice }
}

export const useUser = () => {
  const id = useStore((s) => s.userId)
  const users = useStore((s) => s.users)
  return users.find((u) => u.id === id) ?? users[0]
}

export { daysFromNow }
