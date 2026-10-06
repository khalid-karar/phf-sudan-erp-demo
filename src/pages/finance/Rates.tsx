import { useMemo, useState } from 'react'
import { Button, PageHeader, Panel } from '../../components/ui'
import { date, num, usd } from '../../lib/format'
import { revaluation } from '../../lib/ledger'
import { useLang } from '../../lib/i18n'
import { usePerm, useStore, useUser } from '../../lib/store'

export function Rates() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const { can } = usePerm()
  void user
  const isFM = can('finance', 'manage')
  const current = s.rates[s.rates.length - 1]
  const first = s.rates[0]
  const [input, setInput] = useState(current.rate)
  const rows = useMemo(() => revaluation(s.accounts, s.journal, current.rate), [s.accounts, s.journal, current.rate])
  const total = rows.reduce((t, r) => t + r.diff, 0)
  const change = (current.rate / first.rate - 1) * 100

  return (
    <div>
      <PageHeader
        title={ar ? 'أسعار الصرف وفروق العملة' : 'Exchange rates & FX differences'}
        sub={
          ar
            ? 'الميزانيات بالدولار والصرف بالجنيه. كل حركة تُسجّل بسعر يومها، وأرصدة الجنيه يُعاد تقييمها لتظهر خسارة أو ربح فروق العملة بوضوح.'
            : 'Budgets are in USD and spending in SDG. Every transaction uses its day’s rate, and SDG balances are revalued so FX gains or losses are visible.'
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[13px] text-muted">{ar ? 'سعر اليوم' : 'Today’s rate'}</div>
              <div className="num font-kufi text-[30px] font-bold leading-tight">
                {num(current.rate)} <span className="text-[16px] font-medium text-muted">{ar ? 'ج.س للدولار' : 'SDG per USD'}</span>
              </div>
              <div className="num text-[13px] text-muted">
                {change >= 0 ? '+' : ''}
                {change.toFixed(1)}% {ar ? 'خلال 6 أشهر' : 'over 6 months'}
              </div>
            </div>
            {isFM && (
              <div className="flex items-end gap-2">
                <label className="text-[13px]">
                  {ar ? 'اعتماد سعر جديد' : 'Set a new rate'}
                  <input type="number" className="num mt-1 block h-10 w-32 rounded-md border border-line px-3" value={input} onChange={(e) => setInput(Math.max(1, +e.target.value))} />
                </label>
                <Button onClick={() => s.addRate(input)} disabled={input === current.rate}>
                  {ar ? 'اعتماد' : 'Set'}
                </Button>
              </div>
            )}
          </div>
          <RateChart />
        </Panel>

        <Panel title={ar ? 'سجل الأسعار' : 'Rate log'}>
          <div className="max-h-[330px] overflow-auto">
            <table className="w-full text-[14px]">
              <tbody className="divide-y divide-line">
                {[...s.rates].reverse().map((r, i) => (
                  <tr key={r.date + i}>
                    <td className="num px-5 py-2 text-muted">{date(r.date, lang)}</td>
                    <td className="num py-2 pe-3 text-end font-medium">{num(r.rate)}</td>
                    <td className="px-5 py-2 text-[12.5px] text-muted">{r.source[lang]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-6"
        title={ar ? `إعادة تقييم أرصدة الجنيه بسعر ${num(current.rate)}` : `Revaluation of SDG balances at ${num(current.rate)}`}
        aside={
          isFM && (
            <Button className="h-9" variant={total < 0 ? 'danger' : 'primary'} disabled={rows.every((r) => Math.abs(r.diff) < 0.5)} onClick={s.postRevaluation}>
              {ar ? 'ترحيل قيد فروق العملة' : 'Post FX entry'}
            </Button>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الحساب' : 'Account'}</th>
                <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'الرصيد بالجنيه' : 'SDG balance'}</th>
                <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'القيمة الدفترية' : 'Book value'}</th>
                <th className="py-2.5 pe-3 text-end font-medium">{ar ? 'القيمة بسعر اليوم' : 'Value today'}</th>
                <th className="px-5 py-2.5 text-end font-medium">{ar ? 'الفرق' : 'Difference'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.account.code}>
                  <td className="px-5 py-2.5">
                    <span className="num me-2 text-muted">{r.account.code}</span>
                    {r.account.name[lang]}
                  </td>
                  <td className="num py-2.5 pe-3 text-end">{num(r.sdg)}</td>
                  <td className="num py-2.5 pe-3 text-end">{usd(r.book)}</td>
                  <td className="num py-2.5 pe-3 text-end">{usd(r.current)}</td>
                  <td className={`num px-5 py-2.5 text-end font-medium ${Math.abs(r.diff) < 0.5 ? 'text-muted' : r.diff < 0 ? 'text-crescent' : 'text-leaf'}`}>{usd(r.diff)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/70 font-semibold">
                <td className="px-5 py-2.5" colSpan={4}>
                  {total < 0 ? (ar ? 'خسارة فروق عملة غير محققة' : 'Unrealised FX loss') : ar ? 'ربح فروق عملة غير محقق' : 'Unrealised FX gain'}
                </td>
                <td className={`num px-5 py-2.5 text-end ${total < 0 ? 'text-crescent' : 'text-leaf'}`}>{usd(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function RateChart() {
  const rates = useStore((s) => s.rates)
  const lang = useLang()
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = 200
  const pad = { l: 8, r: 52, t: 14, b: 26 }
  const min = Math.min(...rates.map((r) => r.rate)) - 40
  const max = Math.max(...rates.map((r) => r.rate)) + 40
  const x = (i: number) => pad.l + (i / (rates.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const d = rates.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.rate).toFixed(1)}`).join(' ')
  const ticks = [min + 40, (min + max) / 2, max - 40].map((v) => Math.round(v / 50) * 50)
  const h = hover !== null ? rates[hover] : null
  return (
    <div className="relative mt-4" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={lang === 'ar' ? 'منحنى سعر الصرف' : 'Exchange rate chart'}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (rates.length - 1))
          setHover(Math.max(0, Math.min(rates.length - 1, i)))
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={W - pad.r + 8} y={y(t) + 4} fontSize={11} fill="var(--color-muted)" className="num">
              {t.toLocaleString('en-US')}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--color-nile)" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(rates.length - 1)} cy={y(rates[rates.length - 1].rate)} r={4} fill="var(--color-nile)" stroke="white" strokeWidth={2} />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-muted)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(rates[hover].rate)} r={4.5} fill="var(--color-nile)" stroke="white" strokeWidth={2} />
          </>
        )}
        <text x={pad.l} y={H - 6} fontSize={11} fill="var(--color-muted)">
          {date(rates[0].date, lang)}
        </text>
        <text x={W - pad.r} y={H - 6} fontSize={11} fill="var(--color-muted)" textAnchor="end">
          {date(rates[rates.length - 1].date, lang)}
        </text>
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-md bg-ink px-2.5 py-1.5 text-[12.5px] text-white shadow"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > rates.length / 2 ? '-105%' : '5%'})` }}
        >
          <div className="num font-semibold">{num(h.rate)}</div>
          <div className="opacity-75">{date(h.date, lang)}</div>
        </div>
      )}
    </div>
  )
}
