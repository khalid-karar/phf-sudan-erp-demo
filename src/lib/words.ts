// A whole amount in words, for the "الجملة كتابة" / "Total in words" line of payment documents.

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
const HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']

/** 1–999 in Arabic. */
function below1000(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(HUND[h])
  if (r) {
    if (r < 20) parts.push(ONES[r])
    else {
      const o = r % 10
      parts.push(o ? `${ONES[o]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)])
    }
  }
  return parts.join(' و')
}

const SCALES: [number, string, string, string][] = [
  [1e9, 'مليار', 'ملياران', 'مليارات'],
  [1e6, 'مليون', 'مليونان', 'ملايين'],
  [1e3, 'ألف', 'ألفان', 'آلاف'],
]

export function wordsAr(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'صفر'
  const parts: string[] = []
  for (const [size, one, two, many] of SCALES) {
    const q = Math.floor(n / size)
    if (!q) continue
    n -= q * size
    if (q === 1) parts.push(one)
    else if (q === 2) parts.push(two)
    else if (q <= 10) parts.push(`${below1000(q)} ${many}`)
    else parts.push(`${below1000(q)} ${one}`)
  }
  if (n) parts.push(below1000(n))
  return parts.join(' و')
}

const E_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const E_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const e3 = (n: number): string => {
  const out: string[] = []
  if (n >= 100) {
    out.push(`${E_ONES[Math.floor(n / 100)]} hundred`)
    n %= 100
  }
  if (n >= 20) out.push(E_TENS[Math.floor(n / 10)] + (n % 10 ? `-${E_ONES[n % 10]}` : ''))
  else if (n) out.push(E_ONES[n])
  return out.join(' ')
}
export function wordsEn(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'zero'
  const parts: string[] = []
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) {
    const q = Math.floor(n / size)
    if (q) {
      parts.push(`${e3(q)} ${name}`)
      n -= q * size
    }
  }
  if (n) parts.push(e3(n))
  return parts.join(' ')
}

/** "فقط مائتان وثمانية وثمانون ألف جنيه سوداني لا غير." */
export const sdgInWordsAr = (n: number) => `فقط ${wordsAr(n)} جنيه سوداني لا غير.`
export const sdgInWordsEn = (n: number) => `${wordsEn(n).replace(/^./, (c) => c.toUpperCase())} SDG only`
