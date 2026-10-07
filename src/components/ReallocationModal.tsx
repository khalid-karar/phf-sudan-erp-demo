import { ArrowDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../data/types'
import { findLine, lineUsage, reallocationSources, routeApproval } from '../lib/budget'
import { usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { useStore } from '../lib/store'
import { roleNames } from '../data/seed'
import { Button, Field, inputCls, Modal, UsageBar } from './ui'

export function ReallocationModal({
  open,
  onClose,
  project,
  toLineId: initialTo,
  suggested,
  onDone,
}: {
  open: boolean
  onClose: () => void
  project: Project
  toLineId?: string
  suggested?: number
  onDone?: () => void
}) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const allLines = project.pillars.flatMap((p) => p.lines.map((l) => ({ l, p })))
  const [to, setTo] = useState(initialTo ?? allLines[0].l.id)
  const [amount, setAmount] = useState(suggested ? Math.ceil(suggested / 50) * 50 : 500)
  const sources = useMemo(() => reallocationSources(project, to, amount, s), [project, to, amount, s])
  const [from, setFrom] = useState<string>('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) {
      setTo(initialTo ?? allLines[0].l.id)
      setAmount(suggested ? Math.ceil(suggested / 50) * 50 : 500)
      setReason('')
      setFrom('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTo, suggested])

  const fromId = from || sources[0]?.line.id || ''
  const fromF = findLine([project], fromId)
  const toF = findLine([project], to)
  const fromU = fromF ? lineUsage(fromF.line, s) : null
  const toU = toF ? lineUsage(toF.line, s) : null
  const tooMuch = !!fromU && amount > fromU.available
  const { chain } = routeApproval(s.rules, 'reallocation', amount)
  const crossPillar = fromF && toF && fromF.pillar.id !== toF.pillar.id

  const submit = async () => {
    if (!fromF || !toF || tooMuch || amount <= 0) return
    const made = await s.submitReallocation({
      projectId: project.id,
      fromLineId: fromF.line.id,
      toLineId: toF.line.id,
      amountUSD: amount,
      reason: reason || (ar ? 'تغطية عجز في البند' : 'Cover a shortfall on the line'),
    })
    if (!made) return
    onDone?.()
    onClose()
  }

  const lineSide = (label: string, f: typeof fromF, u: typeof fromU, delta: number) =>
    f &&
    u && (
      <div className="rounded-md border border-line p-3.5">
        <div className="text-[12.5px] text-muted">{label}</div>
        <div className="font-medium">
          {f.line.code} {f.line.name[lang]}
        </div>
        <div className="mt-2.5">
          <UsageBar u={{ ...u, ceiling: u.ceiling + delta, available: u.available + delta }} />
        </div>
        <div className="num mt-2 flex justify-between text-[13px]">
          <span className="text-muted">
            {ar ? 'المتاح الآن' : 'Available now'} {usd(u.available)}
          </span>
          <span className={delta < 0 ? 'text-crescent' : 'text-leaf'}>
            {ar ? 'بعد المناقلة' : 'After'} {usd(u.available + delta)}
          </span>
        </div>
      </div>
    )

  return (
    <Modal open={open} onClose={onClose} title={ar ? 'طلب مناقلة بين البنود' : 'Request a budget reallocation'} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Field label={ar ? 'البند المستفيد (إليه)' : 'Line receiving the money'}>
            <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
              {project.pillars.map((p) => (
                <optgroup key={p.id} label={`${p.code}. ${p.name[lang]}`}>
                  {p.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} {l.name[lang]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'المبلغ (دولار)' : 'Amount (USD)'}>
            <input type="number" min={1} className={`${inputCls} num`} value={amount} onChange={(e) => setAmount(+e.target.value)} />
          </Field>
          <Field
            label={ar ? 'البند المانح (منه)' : 'Line giving the money'}
            hint={ar ? 'مرتبة حسب الأنسب: نفس المحور أولاً، ثم البنود التي تغطي المبلغ كاملاً.' : 'Best first: same pillar, then lines that can cover the full amount.'}
          >
            <select className={inputCls} value={fromId} onChange={(e) => setFrom(e.target.value)}>
              {sources.map(({ line, available }) => (
                <option key={line.id} value={line.id}>
                  {line.code} {line.name[lang]} — {ar ? 'متاح' : 'available'} {usd(available)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'المبرر' : 'Reason'}>
            <textarea
              className={`${inputCls} h-20 py-2`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={ar ? 'مثال: ارتفاع تكلفة الوقود للأيام العلاجية في ريف كسلا' : 'e.g. Higher fuel cost for medical days in rural Kassala'}
            />
          </Field>
        </div>
        <div className="space-y-3">
          {lineSide(ar ? 'من' : 'From', fromF, fromU, -amount)}
          <div className="flex justify-center text-muted">
            <ArrowDown size={18} />
          </div>
          {lineSide(ar ? 'إلى' : 'To', toF, toU, amount)}
          {crossPillar && (
            <p className="rounded-md bg-amber-soft px-3 py-2 text-[13px] text-amber">
              {ar ? 'المناقلة بين محورين مختلفين ستغيّر سقف كل محور.' : 'Moving money across pillars changes both pillar ceilings.'}
            </p>
          )}
          <div className="rounded-md bg-paper px-3.5 py-3 text-[13.5px]">
            <div className="text-muted">{ar ? 'مسار الاعتماد' : 'Approval route'}</div>
            <div className="mt-1 font-medium">{chain.map((r) => roleNames[r][lang]).join(ar ? ' ← ' : ' → ')}</div>
          </div>
        </div>
      </div>
      {tooMuch && (
        <p className="mt-4 text-[13.5px] text-crescent">
          {ar ? `المبلغ أكبر من المتاح في البند المانح (${usd(fromU!.available)}).` : `Amount is more than the giving line has available (${usd(fromU!.available)}).`}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button onClick={submit} disabled={tooMuch || amount <= 0 || !fromF}>
          {ar ? 'إرسال طلب المناقلة' : 'Send reallocation request'}
        </Button>
      </div>
    </Modal>
  )
}
