import { X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { RequestStatus, StepStatus } from '../data/types'
import type { Usage } from '../lib/budget'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { usd as usdFmt } from '../lib/format'
import { PageHelpButton } from './Help'

type Variant = 'primary' | 'quiet' | 'danger' | 'ok'
export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v: Record<Variant, string> = {
    primary: 'bg-nile text-white hover:bg-nile-2 disabled:bg-line disabled:text-muted',
    quiet: 'bg-surface text-ink border border-line hover:border-nile-2 hover:text-nile disabled:text-muted',
    danger: 'bg-surface text-crescent border border-crescent/40 hover:bg-crescent-soft',
    ok: 'bg-leaf text-white hover:brightness-110',
  }
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 h-10 text-[14px] font-medium transition-colors disabled:cursor-not-allowed ${v[variant]} ${className}`}
    />
  )
}

const tone = {
  pending: 'bg-amber-soft text-amber',
  waiting: 'bg-paper text-muted',
  approved: 'bg-leaf-soft text-leaf',
  paid: 'bg-nile-soft text-nile',
  rejected: 'bg-crescent-soft text-crescent',
}
export function StatusBadge({ status }: { status: RequestStatus | StepStatus }) {
  const t = useT()
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[12.5px] font-medium whitespace-nowrap ${tone[status]}`}>{t(`st_${status}`)}</span>
}

/**
 * The ceiling gauge — the visual signature of the system.
 * Fills in reading direction: spent, committed, in approval, then (optionally) the request being drafted.
 */
export function UsageBar({ u, incoming = 0, height = 10, showTolerance = 0 }: { u: Usage; incoming?: number; height?: number; showTolerance?: number }) {
  const total = Math.max(u.ceiling, u.spent + u.committed + u.pending + incoming, 1)
  const w = (v: number) => `${(Math.max(0, v) / total) * 100}%`
  const used = u.spent + u.committed + u.pending
  const fitsIncoming = Math.max(0, Math.min(incoming, u.ceiling - used))
  const overIncoming = Math.max(0, incoming - fitsIncoming)
  const overExisting = Math.max(0, used - u.ceiling)
  const t = useT()
  const segs: { v: number; cls?: string; style?: React.CSSProperties }[] = [
    { v: Math.min(u.spent, Math.max(u.ceiling, u.spent)), cls: 'bg-nile' },
    { v: u.committed, cls: 'bg-amber' },
    { v: u.pending, style: { background: 'repeating-linear-gradient(135deg, var(--color-amber) 0 3px, var(--color-amber-soft) 3px 6px)' } },
    { v: fitsIncoming, cls: 'bg-nile-2/45 ring-1 ring-inset ring-nile-2' },
    { v: overIncoming + overExisting, cls: 'bg-crescent' },
  ].filter((s) => s.v > 0)
  const tip = `${t('ceiling')} ${usdFmt(u.ceiling)} — ${t('spent')} ${usdFmt(u.spent)}, ${t('committed')} ${usdFmt(u.committed)}, ${t('pending')} ${usdFmt(u.pending)}, ${t('available')} ${usdFmt(u.available)}`
  return (
    <div className="relative w-full" style={{ height }} title={tip}>
      <div className="absolute inset-0 rounded-[3px] bg-paper ring-1 ring-inset ring-line" />
      <div className="absolute inset-0 flex gap-[2px] overflow-hidden rounded-[3px]">
        {segs.map((s, i) => (
          <div key={i} className={`shrink-0 ${s.cls ?? ''}`} style={{ width: w(s.v), ...s.style }} />
        ))}
      </div>
      {/* ceiling marker when the bar is stretched past it */}
      {total > u.ceiling && (
        <div className="absolute -top-1 -bottom-1 w-[2px] bg-ink" style={{ insetInlineStart: w(u.ceiling) }} />
      )}
      {showTolerance > 0 && (
        <div
          className="absolute -top-1 -bottom-1 w-0 border-s-2 border-dashed border-amber"
          style={{ insetInlineStart: w(u.ceiling * (1 + showTolerance)) }}
        />
      )}
    </div>
  )
}

export function UsageLegend() {
  const t = useT()
  const item = (cls: string, label: string, style?: React.CSSProperties) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-2.5 rounded-[2px] ${cls}`} style={style} />
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
      {item('bg-nile', t('spent'))}
      {item('bg-amber', t('committed'))}
      {item('', t('pending'), { background: 'repeating-linear-gradient(135deg, var(--color-amber) 0 2px, var(--color-amber-soft) 2px 4px)' })}
      {item('bg-paper ring-1 ring-line', t('available'))}
    </div>
  )
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-[26px] font-bold text-ink">
          <span className="min-w-0">{title}</span>
          <PageHelpButton />
        </h1>
        {sub && <p className="mt-1 max-w-[70ch] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({ children, className = '', title, aside }: { children: ReactNode; className?: string; title?: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line px-5 py-3">
          <h2 className="text-[15.5px] font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const lang = useStore((s) => s.lang)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.slice(-2).map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-md px-4 py-2.5 text-[14px] text-white shadow-lg ${
            t.tone === 'ok' ? 'bg-nile' : t.tone === 'warn' ? 'bg-amber' : 'bg-crescent'
          }`}
        >
          {t.text[lang]}
          <button onClick={() => dismiss(t.id)} aria-label="dismiss" className="opacity-70 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-lg bg-surface shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full h-10 rounded-md border border-line bg-surface px-3 text-[14.5px] text-ink focus:border-nile-2 focus:outline-none focus:ring-2 focus:ring-nile-2/20'
