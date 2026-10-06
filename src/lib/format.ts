import type { Bi, Lang } from '../data/types'

// Finance staff in Sudan work with Western digits, so numbers stay Latin in both languages.
const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const n2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })

// Wrapped in Unicode isolates so signs and currency symbols keep their order inside Arabic text.
const iso = (s: string) => `\u2066${s}\u2069`
export const usd = (v: number) => iso(`${v < 0 ? '−' : ''}$${n0.format(Math.abs(Math.round(v)))}`)
export const sdg = (v: number, lang: Lang) => (lang === 'ar' ? `${n0.format(Math.round(v))} ج.س` : iso(`${n0.format(Math.round(v))} SDG`))
export const money = (v: number, cur: 'USD' | 'SDG', lang: Lang) => (cur === 'USD' ? usd(v) : sdg(v, lang))
export const num = (v: number) => n0.format(v)
export const num2 = (v: number) => n2.format(v)

export const bi = (b: Bi, lang: Lang) => b[lang]

export function date(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SD-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function daysUntil(iso: string) {
  const ms = new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)
  return Math.round(ms / 86_400_000)
}

export function relDays(iso: string, lang: Lang) {
  const d = daysUntil(iso)
  if (lang === 'ar') {
    if (d === 0) return 'اليوم'
    if (d === 1) return 'غداً'
    if (d === -1) return 'أمس'
    if (d > 0) return `بعد ${d} ${d <= 10 ? 'أيام' : 'يوماً'}`
    return `متأخر ${-d} ${-d <= 10 ? 'أيام' : 'يوماً'}`
  }
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  return d > 0 ? `in ${d} days` : `${-d} days overdue`
}
