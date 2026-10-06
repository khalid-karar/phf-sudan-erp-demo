import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PAGE_W } from './HqReportDoc'

/** Shows an A4-width document scaled down to the space available, without changing its real size (so the PDF is unaffected). */
export function FitPreview({ children, innerRef }: { children: ReactNode; innerRef: React.RefObject<HTMLDivElement | null> }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [h, setH] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!box.current || !innerRef.current) return
      const k = Math.min(1, (box.current.clientWidth - 2) / PAGE_W)
      setScale(k)
      setH(innerRef.current.offsetHeight * k)
    })
    if (box.current) ro.observe(box.current)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [innerRef])
  return (
    <div className="rounded-lg bg-[#e7ebec] p-3 sm:p-5">
      <div ref={box} className="relative w-full" style={{ height: h || undefined }}>
        <div className="absolute top-0 left-1/2 shadow-lg" style={{ width: PAGE_W, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}>
          <div ref={innerRef}>{children}</div>
        </div>
      </div>
    </div>
  )
}
