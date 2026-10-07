import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** `print(<Form …/>)` shows the form on a print-only layer and opens the browser's print dialog (Save as PDF works there). */
export function usePrint() {
  const [doc, setDoc] = useState<ReactNode>(null)
  useEffect(() => {
    if (!doc) return
    const done = () => setDoc(null)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 80)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [doc])
  const print = useCallback((n: ReactNode) => setDoc(n), [])
  const host = doc ? createPortal(<div className="print-root">{doc}</div>, document.body) : null
  return { print, host }
}
