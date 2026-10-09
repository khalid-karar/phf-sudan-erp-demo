// Reads a donor budget workbook (the "ICE" file: one row per budget item) into project → activity (pillar) → line.
// The sheet is found by its header row, not by name or position, so a re-issued template keeps working.
import ExcelJS from 'exceljs'
import { inspectZip } from '../activities/excel'
import { fromCents } from '../lib/money'
import { guessNature, natureByName } from './natures'

export interface IceLine {
  row: number
  state: string
  activityCode: string
  activityTitle: string
  description: string
  item: string
  fundCode: string
  unit: string
  qty: number
  duration: number
  unitCostUsd: string
  totalUsd: string
  nature: string | null
  donorAccount: string | null
}
/** What one funding entity calls its columns. Lists are header prefixes, case-insensitive; a missing list means the ICE default. */
export type IceField = 'state' | 'id' | 'title' | 'desc' | 'item' | 'nature' | 'fund' | 'unit' | 'qty' | 'dur' | 'cost'
export interface IceProfile {
  headers: Partial<Record<IceField, string[]>>
}
export const ICE_DEFAULT_HEADERS: Record<IceField, string[]> = {
  state: ['state'],
  id: ['activity id'],
  title: ['activity title'],
  desc: ['activity description'],
  item: ['budget item'],
  nature: ['nature'],
  fund: ['fund'],
  unit: ['unit of measure'],
  qty: ['unit quantity'],
  dur: ['duration'],
  cost: ['unit cost'],
}
const FIELD_ORDER: IceField[] = ['state', 'id', 'title', 'desc', 'item', 'nature', 'fund', 'unit', 'qty', 'dur', 'cost']
const headersOf = (p?: IceProfile): Record<IceField, string[]> => {
  const out = { ...ICE_DEFAULT_HEADERS }
  for (const k of FIELD_ORDER) {
    const v = p?.headers?.[k]?.map((x) => x.trim().toLowerCase()).filter(Boolean)
    if (v?.length) out[k] = v
  }
  return out
}

export interface IceParsed {
  ipCode: string | null
  rate: number | null
  startDate: string | null
  endDate: string | null
  lines: IceLine[]
  warnings: { row: number; en: string; ar: string }[]
  sheet: string
}

const str = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const o = v as { text?: unknown; richText?: { text: string }[]; result?: unknown }
    if (o.richText) return o.richText.map((x) => x.text).join('').trim()
    if (o.text !== undefined) return String(o.text).trim()
    if (o.result !== undefined) return str(o.result)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
  }
  return String(v).replace(/\s+/g, ' ').trim()
}
const num = (v: unknown): number => {
  const raw = typeof v === 'object' && v && 'result' in (v as object) ? (v as { result: unknown }).result : v
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}
const isoDate = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(+v)) return v.toISOString().slice(0, 10)
  const s = str(v)
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

/** One state, however it was typed ("gazira", "Jazira ", "North Darfour"). */
export function normalizeState(s: string): string {
  const t = s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (/^(gazira|jazira|gezira|al ?jazeera|aljazira|gazera)/.test(t)) return 'Gezira'
  if (/^(gedarif|gadaref|gedaref|qadarif|al ?gadarif)/.test(t)) return 'Gedaref'
  if (/^north(ern)? darf/.test(t)) return 'North Darfur'
  if (/^(northern|north state)/.test(t)) return 'Northern State'
  if (/^river nile|^nahr/.test(t)) return 'River Nile'
  if (/^(kassala|kasala)/.test(t)) return 'Kassala'
  if (/^red sea/.test(t)) return 'Red Sea'
  if (/^(khartoum)/.test(t)) return 'Khartoum'
  return s.replace(/\s+/g, ' ').trim()
}

export async function parseIce(buf: Buffer, profile?: IceProfile): Promise<IceParsed> {
  const z = inspectZip(buf)
  if (!z.ok) throw new Error('NOT_XLSX')
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf as never)
  } catch {
    throw new Error('NOT_XLSX')
  }
  const heads = headersOf(profile)
  const idHeads = heads.id
  // The sheet whose header row has "Activity ID" and "Unit Cost" — the visible one named ICE… first.
  const cands = wb.worksheets.filter((w) => w.state === 'visible')
  const find = (ws: ExcelJS.Worksheet) => {
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
      const cells = ws.getRow(r)
      for (let c = 1; c <= 30; c++) if (idHeads.some((h) => str(cells.getCell(c).value).toLowerCase().startsWith(h))) return r
    }
    return 0
  }
  const ws = cands.filter((w) => find(w)).sort((a, b) => Number(/^ice/i.test(b.name)) - Number(/^ice/i.test(a.name)))[0]
  if (!ws) throw new Error('NO_SHEET')
  const hr = find(ws)

  const col: Record<string, number> = {}
  const unitCosts: number[] = []
  for (let c = 1; c <= 40; c++) {
    const h = str(ws.getRow(hr).getCell(c).value).toLowerCase()
    if (!h) continue
    const hit = FIELD_ORDER.find((k) => heads[k].some((x) => h.startsWith(x)))
    if (hit === 'cost') unitCosts.push(c)
    else if (hit) col[hit] ??= c
  }
  col.cost = unitCosts[0]
  for (const k of ['id', 'item', 'qty', 'dur', 'cost']) if (!col[k]) throw new Error('NO_COLUMN:' + k)

  // Header block above the table: "IP Code:", "Transaction currency:", "Exchange rate…", "Period:".
  let ipCode: string | null = null
  let rate: number | null = null
  let startDate: string | null = null
  let endDate: string | null = null
  for (let r = 1; r < hr; r++) {
    const row = ws.getRow(r)
    const label = str(row.getCell(2).value).toLowerCase()
    const first = row.getCell(3).value
    if (label.startsWith('ip code')) ipCode = str(first) || null
    else if (label.startsWith('exchange rate')) {
      const n = num(first)
      rate = n > 0 ? n : null
    } else if (label.startsWith('period')) {
      startDate = isoDate(first)
      endDate = isoDate(row.getCell(4).value)
    }
  }

  const warnings: IceParsed['warnings'] = []
  const lines: IceLine[] = []
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const id = str(row.getCell(col.id).value)
    const item = str(row.getCell(col.item).value)
    if (!id && !item) continue
    if (/^x+$/i.test(id) || (!!col.state && /^x+$/i.test(str(row.getCell(col.state).value)))) break // the "X" sentinel row before the totals
    if (!id) {
      warnings.push({ row: r, en: 'Row has no Activity ID — skipped', ar: 'سطر بلا رمز نشاط — تم تجاهله' })
      continue
    }
    const qty = num(row.getCell(col.qty).value)
    const dur = num(row.getCell(col.dur).value)
    const cost = num(row.getCell(col.cost).value)
    if (![qty, dur, cost].every((n) => Number.isFinite(n) && n >= 0)) {
      warnings.push({ row: r, en: `Quantity, duration or unit cost is not a number (${id}) — skipped`, ar: `الكمية أو المدة أو تكلفة الوحدة ليست رقماً (${id}) — تم تجاهل السطر` })
      continue
    }
    const totalCents = Math.round(qty * dur * cost * 100)
    if (totalCents <= 0) {
      warnings.push({ row: r, en: `Zero amount (${item || id}) — skipped`, ar: `مبلغ صفري (${item || id}) — تم تجاهل السطر` })
      continue
    }
    const natName = col.nature ? str(row.getCell(col.nature).value) : ''
    const nat = natureByName(natName) ?? natureByName(guessNature(item || str(col.desc ? row.getCell(col.desc).value : '')))
    lines.push({
      row: r,
      state: normalizeState(col.state ? str(row.getCell(col.state).value) : ''),
      activityCode: id,
      activityTitle: col.title ? str(row.getCell(col.title).value) : id,
      description: col.desc ? str(row.getCell(col.desc).value) : '',
      item: item || str(col.desc ? row.getCell(col.desc).value : '') || id,
      fundCode: col.fund ? str(row.getCell(col.fund).value) : '',
      unit: col.unit ? str(row.getCell(col.unit).value) : '',
      qty,
      duration: dur,
      unitCostUsd: fromCents(Math.round(cost * 100)),
      totalUsd: fromCents(totalCents),
      nature: nat?.name ?? null,
      donorAccount: nat?.account ?? null,
    })
  }
  if (!lines.length) throw new Error('NO_ROWS')
  return { ipCode, rate, startDate, endDate, lines, warnings, sheet: ws.name }
}
