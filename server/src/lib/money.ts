// Exact money arithmetic on integer cents. Postgres numerics arrive as strings
// ("1234.50"); we convert to cents, do integer maths, and send strings back.
// Cents stay well inside Number.MAX_SAFE_INTEGER for any realistic NGO amount.

export type Cents = number

export function toCents(v: string | number | null | undefined): Cents {
  if (v === null || v === undefined || v === '') return 0
  const s = typeof v === 'number' ? v.toFixed(2) : v.trim()
  const m = /^(-)?(\d+)(?:\.(\d{1,}))?$/.exec(s)
  if (!m) throw new Error(`Not a money amount: ${v}`)
  const [, neg, whole, frac = ''] = m
  // Round half away from zero on the third decimal.
  const f = (frac + '000').slice(0, 3)
  let cents = Number(whole) * 100 + Number(f.slice(0, 2)) + (Number(f[2]) >= 5 ? 1 : 0)
  if (!Number.isSafeInteger(cents)) throw new Error(`Amount out of range: ${v}`)
  if (neg) cents = -cents
  return cents
}

export function fromCents(c: Cents): string {
  const neg = c < 0
  const a = Math.abs(c)
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

export const sumCents = (xs: Cents[]) => xs.reduce((a, b) => a + b, 0)

/** Parses a rate (SDG per USD) to an integer scaled by 10_000. */
export function toRate4(v: string | number): number {
  const s = typeof v === 'number' ? v.toFixed(4) : v.trim()
  const m = /^(\d+)(?:\.(\d{1,4}))?\d*$/.exec(s)
  if (!m) throw new Error(`Not a rate: ${v}`)
  const r = Number(m[1]) * 10_000 + Number((m[2] ?? '').padEnd(4, '0'))
  if (r <= 0) throw new Error('Rate must be positive')
  return r
}

/** USD cents for an SDG amount (cents) at a rate (×10_000), rounded half away from zero. */
export function sdgToUsd(sdgCents: Cents, rate4: number): Cents {
  const sign = sdgCents < 0 ? -1 : 1
  const num = BigInt(Math.abs(sdgCents)) * 10_000n
  const den = BigInt(rate4)
  const q = num / den
  const r = num % den
  return sign * Number(r * 2n >= den ? q + 1n : q)
}

/** SDG cents for a USD amount (cents) at a rate (×10_000). */
export function usdToSdg(usdCents: Cents, rate4: number): Cents {
  const sign = usdCents < 0 ? -1 : 1
  const num = BigInt(Math.abs(usdCents)) * BigInt(rate4)
  const q = num / 10_000n
  const r = num % 10_000n
  return sign * Number(r * 2n >= 10_000n ? q + 1n : q)
}

/** Percentage (e.g. "10.00") applied to cents. */
export function pctOf(c: Cents, pct: string | number): Cents {
  const p = toCents(pct) // percent × 100
  return Math.round((c * p) / 10_000)
}
