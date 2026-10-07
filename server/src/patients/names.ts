/** Loose Arabic/English name normaliser used for search and duplicate detection. */
export const normName = (t: string) =>
  t
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // diacritics, tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const nameKey = (ar: string, en?: string | null) => normName([ar, en ?? ''].join(' '))
/** Phone numbers compared by their last nine digits, so +249 912 000 111, 00249912000111 and 0912000111 are the same. */
export const digits = (p?: string | null) => {
  const d = p ? p.replace(/\D/g, '') : ''
  return d.length >= 9 ? d.slice(-9) : d
}

/** Same person? Same phone, or the same name (or first two names) with a birth year within two years. */
export function looksSame(a: { names: string[]; birthYear: number; phone: string }, b: { names: string[]; birthYear: number; phone: string }) {
  if (a.phone.length >= 7 && a.phone === b.phone) return true
  if (Math.abs(a.birthYear - b.birthYear) > 2) return false
  return a.names.some((x) => b.names.some((y) => x.length >= 5 && y.length >= 5 && (x === y || x.split(' ').slice(0, 2).join(' ') === y.split(' ').slice(0, 2).join(' '))))
}
