import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Button, PageHeader, Panel } from '../components/ui'
import { roleNames } from '../data/seed'
import type { ApprovalRule, RoleKey } from '../data/types'
import { routeApproval } from '../lib/budget'
import { usd } from '../lib/format'
import { useLang } from '../lib/i18n'
import { getOffices, usePerm, useStore, useUser } from '../lib/store'


function gapsAndOverlaps(rules: ApprovalRule[]) {
  // Checks general (all-office) spend rules for amounts that match no rule or two rules.
  const r = rules.filter((x) => x.active && x.appliesTo === 'spend' && x.officeId === null).sort((a, b) => a.minUSD - b.minUSD)
  const issues: { kind: 'gap' | 'overlap'; from: number; to: number | null }[] = []
  let cursor = 0
  for (const x of r) {
    if (x.minUSD > cursor) issues.push({ kind: 'gap', from: cursor, to: x.minUSD })
    if (x.minUSD < cursor) issues.push({ kind: 'overlap', from: x.minUSD, to: cursor })
    cursor = x.maxUSD === null ? Infinity : Math.max(cursor, x.maxUSD)
  }
  if (cursor !== Infinity) issues.push({ kind: 'gap', from: cursor, to: null })
  return issues
}

export function Rules() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const user = useUser()
  const { can } = usePerm()
  void user
  const canEdit = can('settings', 'edit')
  const spend = s.rules.filter((r) => r.appliesTo === 'spend').sort((a, b) => (a.officeId ? 1 : 0) - (b.officeId ? 1 : 0) || a.minUSD - b.minUSD)
  const realloc = s.rules.filter((r) => r.appliesTo === 'reallocation')
  const issues = gapsAndOverlaps(s.rules)

  return (
    <div>
      <PageHeader
        title={ar ? 'قواعد الاعتماد' : 'Approval rules'}
        sub={
          ar
            ? 'تحدد من يعتمد كل طلب حسب المبلغ والمكتب. التعديل هنا يسري فوراً على الطلبات الجديدة دون الحاجة لأي برمجة.'
            : 'Decide who approves each request by amount and office. Changes apply immediately to new requests, with no programming.'
        }
      />
      {!canEdit && (
        <p className="mb-4 rounded-md bg-amber-soft px-4 py-2.5 text-[14px] text-amber">
          {ar ? 'للعرض فقط. التعديل يحتاج صلاحية إدخال في الإعدادات.' : 'View only. Editing needs enter access to Settings.'}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel
            title={ar ? 'طلبات الصرف' : 'Spend requests'}
            aside={
              canEdit && (
                <Button variant="quiet" className="h-8 px-3 text-[13px]" onClick={() => s.addRule('spend')}>
                  <Plus size={15} /> {ar ? 'قاعدة' : 'Rule'}
                </Button>
              )
            }
          >
            {issues.length > 0 && (
              <div className="flex gap-2 border-b border-line bg-crescent-soft px-5 py-2.5 text-[13.5px] text-crescent">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  {issues.map((i, k) => (
                    <div key={k}>
                      {i.kind === 'gap'
                        ? ar
                          ? `المبالغ من ${usd(i.from)} ${i.to === null ? 'فما فوق' : `إلى ${usd(i.to)}`} لا تغطيها أي قاعدة — ستُحال لمدير الشؤون المالية.`
                          : `Amounts from ${usd(i.from)} ${i.to === null ? 'and up' : `to ${usd(i.to)}`} match no rule — they go to the Finance Manager.`
                        : ar
                          ? `قاعدتان تغطيان المبالغ من ${usd(i.from)} إلى ${usd(i.to!)} — تُطبّق الأولى.`
                          : `Two rules cover ${usd(i.from)} to ${usd(i.to!)} — the first one wins.`}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ul className="divide-y divide-line">
              {spend.map((r) => (
                <RuleRow key={r.id} rule={r} canEdit={canEdit} />
              ))}
            </ul>
          </Panel>

          <Panel title={ar ? 'المناقلة بين البنود' : 'Budget reallocation'}>
            <ul className="divide-y divide-line">
              {realloc.map((r) => (
                <RuleRow key={r.id} rule={r} canEdit={canEdit} />
              ))}
            </ul>
          </Panel>
        </div>

        <Tester />
      </div>
    </div>
  )
}

function RuleRow({ rule, canEdit }: { rule: ApprovalRule; canEdit: boolean }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const up = (patch: Partial<ApprovalRule>) => s.updateRule(rule.id, patch)
  const approverRoles: RoleKey[] = s.roles.filter((r) => r.canApprove).map((r) => r.id)
  const remaining = approverRoles.filter((r) => !rule.chain.includes(r))
  const numInput = 'num h-9 w-28 rounded-md border border-line bg-surface px-2.5 text-[14px] disabled:bg-paper'

  return (
    <li className={`px-5 py-4 ${rule.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 font-medium hover:border-line focus:border-line disabled:hover:border-transparent"
          value={rule.name[lang]}
          disabled={!canEdit}
          onChange={(e) => up({ name: { ...rule.name, [lang]: e.target.value } })}
          aria-label={ar ? 'اسم القاعدة' : 'Rule name'}
        />
        <label className="inline-flex items-center gap-2 text-[13.5px] text-muted">
          <input type="checkbox" className="size-4 accent-[var(--color-leaf)]" checked={rule.active} disabled={!canEdit} onChange={(e) => up({ active: e.target.checked })} />
          {ar ? 'مفعّلة' : 'Active'}
        </label>
        {canEdit && (
          <button onClick={() => s.removeRule(rule.id)} className="rounded p-1.5 text-muted hover:bg-crescent-soft hover:text-crescent" aria-label={ar ? 'حذف' : 'Delete'}>
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px]">
        <span className="text-muted">{ar ? 'إذا كان المبلغ من' : 'If the amount is from'}</span>
        <input type="number" min={0} className={numInput} value={rule.minUSD} disabled={!canEdit} onChange={(e) => up({ minUSD: Math.max(0, +e.target.value) })} />
        <span className="text-muted">{ar ? 'إلى أقل من' : 'to under'}</span>
        <input
          type="number"
          min={0}
          className={numInput}
          placeholder={ar ? 'بلا حد' : 'no limit'}
          value={rule.maxUSD ?? ''}
          disabled={!canEdit}
          onChange={(e) => up({ maxUSD: e.target.value === '' ? null : Math.max(0, +e.target.value) })}
        />
        <span className="text-muted">{ar ? 'دولار، في' : 'USD, in'}</span>
        <select
          className="h-9 rounded-md border border-line bg-surface px-2 text-[14px] disabled:bg-paper"
          value={rule.officeId ?? ''}
          disabled={!canEdit}
          onChange={(e) => up({ officeId: e.target.value || null })}
        >
          <option value="">{ar ? 'كل المكاتب' : 'all offices'}</option>
          {getOffices().map((o) => (
            <option key={o.id} value={o.id}>
              {o.name[lang]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[14px] text-muted">{ar ? 'يعتمده بالترتيب:' : 'Approved in order by:'}</span>
        {rule.chain.map((role, i) => (
          <span key={role} className="inline-flex items-center gap-1.5 rounded-md bg-nile-soft py-1 ps-2.5 pe-1.5 text-[13.5px] text-nile">
            <span className="num text-nile/60">{i + 1}</span>
            {roleNames[role][lang]}
            {canEdit && rule.chain.length > 1 && (
              <button onClick={() => up({ chain: rule.chain.filter((r) => r !== role) })} className="rounded p-0.5 hover:bg-white/70" aria-label={ar ? 'إزالة' : 'Remove'}>
                <X size={13} />
              </button>
            )}
          </span>
        ))}
        {canEdit && remaining.length > 0 && (
          <select
            className="h-8 rounded-md border border-dashed border-line bg-surface px-2 text-[13px] text-muted"
            value=""
            onChange={(e) => e.target.value && up({ chain: [...rule.chain, e.target.value as RoleKey] })}
          >
            <option value="">{ar ? '+ إضافة معتمد' : '+ Add approver'}</option>
            {remaining.map((r) => (
              <option key={r} value={r}>
                {roleNames[r][lang]}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  )
}

function Tester() {
  const lang = useLang()
  const ar = lang === 'ar'
  const rules = useStore((s) => s.rules)
  const [amount, setAmount] = useState(1800)
  const [office, setOffice] = useState('ksl')
  const [over, setOver] = useState(false)
  const { rule, chain } = routeApproval(rules, 'spend', amount, over, office)
  return (
    <Panel className="h-fit p-5 xl:sticky xl:top-20">
      <h2 className="text-[15.5px] font-semibold">{ar ? 'جرّب القواعد' : 'Try the rules'}</h2>
      <p className="mt-1 text-[13px] text-muted">{ar ? 'أدخل مبلغاً لترى من سيعتمده.' : 'Enter an amount to see who will approve it.'}</p>
      <div className="mt-4 space-y-3">
        <label className="block text-[13.5px]">
          {ar ? 'المبلغ (دولار)' : 'Amount (USD)'}
          <input type="number" className="num mt-1 h-10 w-full rounded-md border border-line px-3" value={amount} onChange={(e) => setAmount(Math.max(0, +e.target.value))} />
        </label>
        <label className="block text-[13.5px]">
          {ar ? 'المكتب' : 'Office'}
          <select className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-2" value={office} onChange={(e) => setOffice(e.target.value)}>
            {getOffices().map((o) => (
              <option key={o.id} value={o.id}>
                {o.name[lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" className="size-4" checked={over} onChange={(e) => setOver(e.target.checked)} />
          {ar ? 'يتجاوز السقف ضمن السماحية' : 'Over ceiling, within tolerance'}
        </label>
      </div>
      <div className="mt-5 rounded-md bg-paper p-4">
        <div className="text-[12.5px] text-muted">{rule ? (ar ? `القاعدة المطبّقة: ${rule.name.ar}` : `Rule applied: ${rule.name.en}`) : ar ? 'لا تنطبق أي قاعدة' : 'No rule matches'}</div>
        <ol className="mt-2 space-y-1.5">
          {chain.map((r, i) => (
            <li key={r} className="flex items-center gap-2 text-[14.5px]">
              <span className="num grid size-6 place-items-center rounded-full bg-nile text-[12px] text-white">{i + 1}</span>
              {roleNames[r][lang]}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  )
}
