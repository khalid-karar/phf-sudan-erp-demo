import { ArrowLeft, ArrowRight, BookOpen, CircleHelp, Lightbulb, PlayCircle, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { articleFor, mainTour, type HelpArticle } from '../lib/help'
import { useLang } from '../lib/i18n'
import { useStore } from '../lib/store'

/** The “?” button that sits next to every page title. */
export function PageHelpButton({ path }: { path?: string }) {
  const loc = useLocation()
  const lang = useLang()
  const a = articleFor(path ?? loc.pathname)
  const [open, setOpen] = useState(false)
  if (!a) return null
  return (
    <>
      <button
        data-tour="page-help"
        onClick={() => setOpen(true)}
        className="inline-grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface align-middle text-muted transition-colors hover:border-nile-2 hover:text-nile"
        aria-label={lang === 'ar' ? `كيف أستخدم صفحة ${a.title.ar}؟` : `How do I use ${a.title.en}?`}
        title={lang === 'ar' ? 'كيف أستخدم هذه الصفحة؟' : 'How do I use this page?'}
      >
        <CircleHelp size={17} />
      </button>
      {open && <HelpDrawer a={a} onClose={() => setOpen(false)} />}
    </>
  )
}

export function HelpDrawer({ a, onClose }: { a: HelpArticle; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const startTour = useStore((s) => s.startTour)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={a.title[lang]}
        className="flex h-full w-[420px] max-w-[92vw] flex-col bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="text-[12.5px] text-muted">{ar ? 'مساعدة هذه الصفحة' : 'Help for this page'}</div>
            <h2 className="font-kufi text-[18px] font-semibold">{a.title[lang]}</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-paper" aria-label={ar ? 'إغلاق' : 'Close'}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-[14.5px] leading-relaxed">
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-muted">{ar ? 'ما هذه الصفحة؟' : 'What is this page?'}</h3>
            <p>{a.what[lang]}</p>
          </section>
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">{ar ? 'كيف أستخدمها' : 'How to use it'}</h3>
            <ol className="space-y-2.5">
              {a.steps[lang].map((st, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-nile text-[12px] font-semibold text-white">{i + 1}</span>
                  <span>{st}</span>
                </li>
              ))}
            </ol>
          </section>
          {a.tip && (
            <section className="flex gap-2.5 rounded-md bg-amber-soft px-3.5 py-3 text-[14px] text-ink">
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-amber" />
              <p>{a.tip[lang]}</p>
            </section>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
          <Link to="/help" onClick={onClose} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[13.5px] font-medium hover:border-nile-2">
            <BookOpen size={16} /> {ar ? 'كل المقالات' : 'All help articles'}
          </Link>
          <button
            onClick={() => {
              onClose()
              startTour()
            }}
            className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[13.5px] font-medium hover:border-nile-2"
          >
            <PlayCircle size={16} /> {ar ? 'جولة تعريفية بالنظام' : 'Take the guided tour'}
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

type Rect = { top: number; left: number; width: number; height: number }

const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false
  const r = (el as HTMLElement).getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** Spotlight tour over the main layout. Steps whose target is hidden (e.g. sidebar on a phone) are shown as a centred card. */
export function Tour() {
  const open = useStore((s) => s.tourOpen)
  const end = useStore((s) => s.endTour)
  const lang = useLang()
  const ar = lang === 'ar'
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const step = mainTour[i]

  const measure = useCallback(() => {
    if (!step?.target) return setRect(null)
    const els = Array.from(document.querySelectorAll(step.target))
    const el = els.find(visible)
    if (!el) return setRect(null)
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, measure])
  useEffect(() => {
    if (open) setI(0)
  }, [open])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, end])

  if (!open || !step) return null
  const last = i === mainTour.length - 1
  const pad = 6
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardW = Math.min(340, vw - 24)
  let cardStyle: React.CSSProperties = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: cardW }
  if (rect) {
    const roomBelow = vh - (rect.top + rect.height)
    const tall = rect.height > vh * 0.5
    if (tall) {
      // beside the element (sidebar)
      const besideLeft = rect.left > vw / 2 ? rect.left - cardW - 16 : rect.left + rect.width + 16
      cardStyle = { top: Math.max(16, vh / 2 - 110), left: Math.max(12, Math.min(vw - cardW - 12, besideLeft)), width: cardW }
    } else {
      const top = roomBelow > 230 ? rect.top + rect.height + 14 : Math.max(12, rect.top - 230)
      const left = Math.max(12, Math.min(vw - cardW - 12, rect.left + rect.width / 2 - cardW / 2))
      cardStyle = { top, left, width: cardW }
    }
  }
  const Next = ar ? ArrowLeft : ArrowRight
  const Prev = ar ? ArrowRight : ArrowLeft
  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={step.title[lang]}>
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-crescent transition-all duration-200"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(18,57,74,0.55)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-nile/55" />
      )}
      <div className="fixed rounded-lg bg-surface p-5 shadow-2xl" style={cardStyle}>
        <div className="mb-1 flex items-center justify-between">
          <span className="num text-[12px] text-muted">
            {i + 1} / {mainTour.length}
          </span>
          <button onClick={end} className="text-[13px] text-muted hover:text-ink">
            {ar ? 'تخطّي الجولة' : 'Skip tour'}
          </button>
        </div>
        <h2 className="font-kufi text-[17px] font-semibold">{step.title[lang]}</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{step.body[lang]}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {mainTour.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full ${k === i ? 'w-5 bg-crescent' : 'w-1.5 bg-line'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[13.5px] hover:border-nile-2">
                <Prev size={15} /> {ar ? 'السابق' : 'Back'}
              </button>
            )}
            <button
              autoFocus
              onClick={() => (last ? end() : setI(i + 1))}
              className="flex h-9 items-center gap-1.5 rounded-md bg-nile px-3.5 text-[13.5px] font-medium text-white hover:bg-nile-2"
            >
              {last ? (ar ? 'ابدأ العمل' : 'Start working') : ar ? 'التالي' : 'Next'} {!last && <Next size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
