// Procurement files: on the server in live mode, on this device (localStorage) in the demo.
import { useCallback, useEffect, useState } from 'react'
import { api, LIVE } from './http'

export interface PrLine { item: string; unit: string; spec: string; qty: number; unitCost: number; freq: number }
export interface CaseData {
  pr: { department: string; unit: string; reason: string; method: 'single' | 'ip' | 'competitive'; requiredDate?: string | null; deliveryPlace: string; deliveryTerms: string; requestedBy: string; lines: PrLine[] }
  rfq?: { issueDate?: string | null; closeDate?: string | null; vendors: { name: string; email: string; phone: string }[] }
  bids?: { vendor: string; unitPrices: number[]; deliveryDays?: number | null; accepted: boolean; note: string }[]
  award?: { vendor: string; reason: string }
  po?: { date?: string | null; vendor: { name: string; place: string; phone: string }; shipTo: string }
  receipt?: { date?: string | null; store: string; lines: { received: number }[]; notes: string }
}
export type CaseStatus = 'draft' | 'rfq' | 'evaluated' | 'ordered' | 'received' | 'cancelled'
export interface Case {
  id: string
  no: string
  officeId: string
  projectId: string | null
  lineId: string | null
  status: CaseStatus
  data: CaseData
  forms: { pr: string; rfq: string; po: string; grn: string }
  totalSdg: number
}

const KEY = 'phf-procurement-demo'
const statusOf = (d: CaseData): Exclude<CaseStatus, 'cancelled'> => (d.receipt ? 'received' : d.po ? 'ordered' : d.award || d.bids?.length ? 'evaluated' : d.rfq ? 'rfq' : 'draft')
const total = (d: CaseData) => Math.round(d.pr.lines.reduce((t, l) => t + l.qty * l.unitCost * l.freq, 0) * 100) / 100
const forms = (no: string) => {
  const t = no.replace(/^PC-/, '')
  return { pr: no, rfq: `RFQ-${t}`, po: `PO-${t}`, grn: `GRN-${t}` }
}
const read = (): Case[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}
const write = (c: Case[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* storage full or blocked: the demo just forgets */
  }
}

export function useProcurement(officeId: string) {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setCases(LIVE ? await api.get<Case[]>('/procurement') : read())
    setLoading(false)
  }, [])
  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  const save = async (id: string | null, data: CaseData, link: { projectId: string | null; lineId: string | null }): Promise<Case> => {
    let out: Case
    if (LIVE) out = id ? await api.put<Case>(`/procurement/${id}`, { data, ...link }) : await api.post<Case>('/procurement', { data, ...link, officeId })
    else {
      const all = read()
      if (id) {
        const i = all.findIndex((c) => c.id === id)
        out = { ...all[i], data, ...link, status: statusOf(data), totalSdg: total(data) }
        all[i] = out
      } else {
        const no = `PC-${new Date().getFullYear()}-${String(all.length + 1).padStart(4, '0')}`
        out = { id: crypto.randomUUID(), no, officeId, ...link, status: statusOf(data), data, forms: forms(no), totalSdg: total(data) }
        all.unshift(out)
      }
      write(all)
    }
    await reload()
    return out
  }
  const cancel = async (id: string) => {
    if (LIVE) await api.post(`/procurement/${id}/cancel`)
    else write(read().map((c) => (c.id === id ? { ...c, status: 'cancelled' as const } : c)))
    await reload()
  }
  return { cases, loading, save, cancel }
}
