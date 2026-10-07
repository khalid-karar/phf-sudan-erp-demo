// The patient register is too big to hold on every screen, so it is read from the server a page at a time.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Beneficiary, Service, ServiceType } from '../data/types'
import { useStore } from '../lib/store'
import { api } from './http'

const PAGE = 50
type Dto = { id: string; no: string; nameAr: string; nameEn: string | null; gender: 'm' | 'f'; birthYear: number; officeId: string; locality: string | null; displaced: boolean; phone: string | null; registeredAt: string; registeredById: string | null }
type ListDto = Dto & { services: number; lastService: string | null; lastServiceType: ServiceType | null }
type ServiceDto = { id: string; date: string; type: ServiceType; officeId: string; activityId: string | null; note: string | null }

const person = (p: Dto): Beneficiary => ({ id: p.id, no: p.no, name: { ar: p.nameAr, en: p.nameEn || p.nameAr }, gender: p.gender, birthYear: p.birthYear, officeId: p.officeId, locality: p.locality ?? '', displaced: p.displaced, phone: p.phone ?? undefined, registeredAt: p.registeredAt, registeredBy: p.registeredById ?? undefined, services: [] })
const row = (p: ListDto): Beneficiary => ({ ...person(p), serviceCount: p.services, lastService: p.lastService && p.lastServiceType ? { type: p.lastServiceType, date: p.lastService } : undefined })

export interface Filters { q: string; office: string; gender: string; svc: string }

/** The register, filtered and searched on the server. Typing waits a moment so each keystroke is not a request. */
export function usePatientPage(f: Filters, enabled: boolean) {
  const version = useStore((s) => s.patientsVersion ?? 0)
  const [items, setItems] = useState<Beneficiary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const ticket = useRef(0)
  const key = JSON.stringify(f) + version

  const fetchPage = useCallback(
    async (offset: number) => {
      const my = ++ticket.current
      setLoading(true)
      try {
        const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
        if (f.q) p.set('q', f.q)
        if (f.office) p.set('officeId', f.office)
        if (f.gender) p.set('gender', f.gender)
        if (f.svc) p.set('service', f.svc)
        const r = await api.get<{ total: number; items: ListDto[] }>(`/patients?${p}`)
        if (my !== ticket.current) return // a newer search replaced this one
        setTotal(r.total)
        setItems((old) => (offset === 0 ? r.items.map(row) : [...old, ...r.items.map(row)]))
      } finally {
        if (my === ticket.current) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => void fetchPage(0).catch(() => undefined), f.q ? 300 : 0)
    return () => clearTimeout(t)
  }, [enabled, fetchPage, f.q])

  return { items, total, loading, hasMore: items.length < total, more: () => fetchPage(items.length) }
}

/** One person with their full service history. */
export async function fetchPatient(id: string): Promise<Beneficiary> {
  const r = await api.get<Dto & { services: ServiceDto[] }>(`/patients/${id}`)
  const services: Service[] = r.services.map((s) => ({ id: s.id, date: s.date, type: s.type, officeId: s.officeId, activityId: s.activityId ?? undefined, note: s.note ?? undefined }))
  return { ...person(r), services }
}

export async function fetchDuplicates(b: Beneficiary): Promise<Beneficiary[]> {
  const p = new URLSearchParams({ nameAr: b.name.ar || b.name.en, birthYear: String(b.birthYear) })
  if (b.name.en) p.set('nameEn', b.name.en)
  if (b.phone) p.set('phone', b.phone)
  const r = await api.get<(Dto & { phone?: null })[]>(`/patients/duplicates?${p}`)
  return r.map(person)
}

export interface PatientStatsDto {
  registered: number
  women: number
  men: number
  children: number
  elderly: number
  displaced: number
  services: number
  peopleServed: number
  byType: { type: ServiceType; n: number }[]
  byOffice: { officeId: string; n: number; people: number }[]
  byMonth: { month: string; n: number }[]
  ages: { under5: number; a5_14: number; a15_49: number; over50: number }
  registeredByMonth: { month: string; n: number }[]
  registeredByOffice: { officeId: string; n: number }[]
}

export function usePatientStats(office: string, enabled: boolean) {
  const version = useStore((s) => s.patientsVersion ?? 0)
  const [stats, setStats] = useState<PatientStatsDto | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    api
      .get<PatientStatsDto>(`/patients/stats${office ? `?officeId=${office}` : ''}`)
      .then((r) => live && setStats(r))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [enabled, office, version])
  return stats
}
