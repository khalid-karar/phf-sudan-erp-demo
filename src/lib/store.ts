import { create } from 'zustand'
import { buildSeed, daysFromNow, projects as seedProjects, SDG_RATE, users } from '../data/seed'
import type { ApprovalRule, ApprovalStep, Bi, ControlMode, Expense, Lang, Project, Reallocation, SpendRequest } from '../data/types'
import { checkCeiling, findLine, routeApproval } from './budget'

export interface Toast {
  id: number
  text: Bi
  tone: 'ok' | 'warn' | 'bad'
}

interface State {
  lang: Lang
  userId: string
  projects: Project[]
  expenses: Expense[]
  requests: SpendRequest[]
  reallocations: Reallocation[]
  rules: ApprovalRule[]
  deadlines: ReturnType<typeof buildSeed>['deadlines']
  toasts: Toast[]
  seq: number

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
  payRequest: (id: string) => void

  submitReallocation: (draft: { projectId: string; fromLineId: string; toLineId: string; amountUSD: number; reason: string }) => Reallocation
  decideReallocation: (id: string, approve: boolean, note?: string) => void

  updateRule: (id: string, patch: Partial<ApprovalRule>) => void
  addRule: (kind: ApprovalRule['appliesTo']) => void
  removeRule: (id: string) => void
  setProjectControl: (projectId: string, mode: ControlMode, tolerancePct: number) => void
}

const fresh = () => {
  const s = buildSeed()
  return {
    projects: structuredClone(seedProjects),
    expenses: s.expenses,
    requests: s.requests,
    reallocations: s.reallocations,
    rules: s.rules,
    deadlines: s.deadlines,
    seq: 143,
  }
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

export const useStore = create<State>((set, get) => ({
  lang: initialLang(),
  userId: 'u-fo',
  toasts: [],
  ...fresh(),

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
    const amountUSD = draft.currency === 'USD' ? draft.amount : draft.amount / SDG_RATE
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
      rate: SDG_RATE,
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

  payRequest: (id) => {
    const s = get()
    const req = s.requests.find((r) => r.id === id)
    if (!req || req.status !== 'approved') return
    const exp: Expense = {
      id: `ex-pay-${id}`,
      lineId: req.lineId,
      projectId: req.projectId,
      officeId: req.officeId,
      requestId: id,
      amountUSD: req.amountUSD,
      date: new Date().toISOString(),
      hasTechReport: false,
    }
    set({
      requests: s.requests.map((x) => (x.id === id ? { ...x, status: 'paid' } : x)),
      expenses: [exp, ...s.expenses],
    })
    get().toast({ ar: `سُجّل صرف ${req.code} — بانتظار التقرير الفني`, en: `${req.code} paid — awaiting technical report` })
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
}))

export const useUser = () => {
  const id = useStore((s) => s.userId)
  return users.find((u) => u.id === id)!
}

export { daysFromNow }
