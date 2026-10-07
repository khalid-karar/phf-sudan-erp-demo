import { CheckCircle2, ChevronDown, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import type { Account, AccountType } from '../../data/types'
import { balances, children, lineMatches, nextAccountCode } from '../../lib/ledger'
import { date, usd } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { getOffices, usePerm, useStore, useUser } from '../../lib/store'

export const typeName: Record<AccountType, { ar: string; en: string }> = {
  asset: { ar: 'أصول', en: 'Asset' },
  liability: { ar: 'التزامات', en: 'Liability' },
  net_assets: { ar: 'صافي أصول', en: 'Net assets' },
  revenue: { ar: 'إيرادات', en: 'Revenue' },
  expense: { ar: 'مصروفات', en: 'Expense' },
}

export function Accounts() {
  const lang = useLang()
  const ar = lang === 'ar'
  const user = useUser()
  const { can } = usePerm()
  void user
  const canEdit = can('finance', 'manage')
  const [tab, setTab] = useState<'tree' | 'mapping'>('tree')
  const [adding, setAdding] = useState(false)
  const [statement, setStatement] = useState<Account | null>(null)

  return (
    <div>
      <PageHeader
        title={ar ? 'دليل الحسابات' : 'Chart of accounts'}
        sub={
          ar
            ? 'الحساب يحدد نوع المال، أما المشروع والبند والمكتب فتُحمل على كل قيد كأبعاد. لذلك يبقى الدليل قصيراً ويخدم كل المشاريع والمانحين.'
            : 'The account says what the money is; project, budget line and office travel on every entry as dimensions. That keeps the chart short and serves every project and donor.'
        }
        actions={
          canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} /> {ar ? 'إضافة حساب' : 'Add account'}
            </Button>
          )
        }
      />
      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ['tree', ar ? 'شجرة الحسابات' : 'Account tree'],
            ['mapping', ar ? 'ربط بنود الميزانية بالحسابات' : 'Budget line → account mapping'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium ${tab === k ? 'border-nile text-nile' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'tree' ? <Tree onOpen={setStatement} /> : <Mapping canEdit={canEdit} />}
      <AddAccount open={adding} onClose={() => setAdding(false)} />
      <Statement account={statement} onClose={() => setStatement(null)} />
    </div>
  )
}

function Tree({ onOpen }: { onOpen: (a: Account) => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [office, setOffice] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({ '1': true, '11': true, '1101': true, '1102': true, '2': true, '3': true, '4': true, '5': true, '51': true, '52': true })
  const bal = useMemo(() => balances(s.accounts, s.journal, { officeId: office || undefined }), [s.accounts, s.journal, office])
  const query = q.trim().toLowerCase()
  const matches = (a: Account) => !query || a.code.includes(query) || a.name.ar.includes(q.trim()) || a.name.en.toLowerCase().includes(query)
  const subtreeMatches = (a: Account): boolean => matches(a) || children(s.accounts, a.code).some(subtreeMatches)

  const A = bal.get('1')!.balance
  const L = bal.get('2')!.balance
  const N = bal.get('3')!.balance
  const R = bal.get('4')!.balance
  const E = bal.get('5')!.balance
  const balanced = Math.abs(A - (L + N + R - E)) < 1

  const rows: React.ReactNode[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const a of children(s.accounts, parent)) {
      if (!subtreeMatches(a)) continue
      const b = bal.get(a.code)!
      const kids = children(s.accounts, a.code)
      const isOpen = query ? true : !!open[a.code]
      rows.push(
        <tr key={a.code} className={`${depth === 0 ? 'bg-paper/80 font-semibold' : ''} ${a.postable ? 'cursor-pointer hover:bg-nile-soft/40' : ''}`} onClick={() => a.postable && onOpen(a)}>
          <td className="py-2 pe-3" style={{ paddingInlineStart: 20 + depth * 22 }}>
            <span className="inline-flex items-center gap-1.5">
              {kids.length > 0 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen((o) => ({ ...o, [a.code]: !o[a.code] }))
                  }}
                  className="text-muted hover:text-ink"
                  aria-label={isOpen ? 'collapse' : 'expand'}
                  aria-expanded={isOpen}
                >
                  <ChevronDown size={15} className={isOpen ? '' : 'ltr:-rotate-90 rtl:rotate-90'} />
                </button>
              ) : (
                <span className="inline-block w-[15px]" />
              )}
              <span className="num w-16 text-muted">{a.code}</span>
            </span>
          </td>
          <td className={`py-2 pe-3 ${a.postable ? '' : 'font-medium'}`}>
            {a.name[lang]}
            {a.currency && <span className="ms-2 rounded bg-paper px-1.5 text-[11.5px] text-muted ring-1 ring-line">{a.currency === 'SDG' ? (ar ? 'جنيه' : 'SDG') : ar ? 'دولار' : 'USD'}</span>}
          </td>
          <td className="py-2 pe-3 text-[12.5px] text-muted">{depth === 0 ? typeName[a.type][lang] : a.postable ? '' : ar ? 'تجميعي' : 'Header'}</td>
          <td className="num py-2 pe-3 text-end">{b.debit ? usd(b.debit) : <span className="text-muted">—</span>}</td>
          <td className="num py-2 pe-3 text-end">{b.credit ? usd(b.credit) : <span className="text-muted">—</span>}</td>
          <td className={`num py-2 pe-5 text-end ${a.postable ? 'font-medium' : 'font-semibold'}`}>
            {usd(b.balance)}
            {a.currency === 'SDG' && b.sdg !== 0 && <span className="block text-[11.5px] font-normal text-muted">{new Intl.NumberFormat('en-US').format(b.sdg)} {ar ? 'ج.س' : 'SDG'}</span>}
          </td>
        </tr>,
      )
      if (isOpen) walk(a.code, depth + 1)
    }
  }
  walk(null, 0)

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
          <input className={`${inputCls} ps-9`} placeholder={ar ? 'ابحث برقم الحساب أو اسمه' : 'Search by code or name'} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="h-10 rounded-md border border-line bg-surface px-2 text-[14px]" value={office} onChange={(e) => setOffice(e.target.value)}>
          <option value="">{ar ? 'كل المكاتب' : 'All offices'}</option>
          {getOffices().map((o) => (
            <option key={o.id} value={o.id}>
              {o.name[lang]}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md px-3 text-[13.5px] text-muted hover:bg-paper hover:text-ink" onClick={() => setOpen(Object.fromEntries(s.accounts.map((a) => [a.code, true])))}>
          {ar ? 'توسيع الكل' : 'Expand all'}
        </button>
        <button className="h-10 rounded-md px-3 text-[13.5px] text-muted hover:bg-paper hover:text-ink" onClick={() => setOpen({})}>
          {ar ? 'طي الكل' : 'Collapse all'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-muted">
              <th className="py-2 ps-5 pe-3 text-start font-medium">{ar ? 'الرقم' : 'Code'}</th>
              <th className="py-2 pe-3 text-start font-medium">{ar ? 'اسم الحساب' : 'Account'}</th>
              <th className="py-2 pe-3 text-start font-medium">{ar ? 'النوع' : 'Type'}</th>
              <th className="py-2 pe-3 text-end font-medium">{ar ? 'مدين' : 'Debit'}</th>
              <th className="py-2 pe-3 text-end font-medium">{ar ? 'دائن' : 'Credit'}</th>
              <th className="py-2 pe-5 text-end font-medium">{ar ? 'الرصيد' : 'Balance'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{rows}</tbody>
        </table>
      </div>
      <div className={`flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-[13.5px] ${balanced ? 'text-leaf' : 'text-crescent'}`}>
        <CheckCircle2 size={16} />
        <span>{ar ? 'المعادلة المحاسبية:' : 'Accounting equation:'}</span>
        <span className="num text-ink">
          {ar ? 'الأصول' : 'Assets'} {usd(A)} = {ar ? 'الالتزامات' : 'Liabilities'} {usd(L)} + {ar ? 'صافي الأصول' : 'Net assets'} {usd(N)} + {ar ? 'فائض الفترة' : 'Period surplus'} {usd(R - E)}
        </span>
      </div>
      <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-muted">{ar ? 'اضغط على أي حساب لعرض كشف الحساب.' : 'Click any account to see its statement.'}</p>
    </Panel>
  )
}

function Mapping({ canEdit }: { canEdit: boolean }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const expenseAccounts = s.accounts.filter((a) => a.type === 'expense' && a.postable)
  return (
    <div className="space-y-5">
      <p className="max-w-[80ch] text-[14px] text-muted">
        {ar
          ? 'كل بند في ميزانية المشروع يُرحّل تلقائياً إلى حساب مصروف. يتغير الربط للقيود الجديدة فقط، ولا يمس القيود المرحّلة.'
          : 'Each project budget line posts automatically to an expense account. A change applies to new entries only; posted entries are untouched.'}
      </p>
      {s.projects.map((p) => (
        <Panel key={p.id} title={`${p.code} — ${p.name[lang]}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <tbody className="divide-y divide-line">
                {p.pillars.map((pl) => [
                  <tr key={pl.id} className="bg-paper/70">
                    <td colSpan={2} className="px-5 py-2 font-medium">
                      {pl.code}. {pl.name[lang]}
                    </td>
                  </tr>,
                  ...pl.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-5 py-2">
                        <span className="num me-2 text-muted">{l.code}</span>
                        {l.name[lang]}
                      </td>
                      <td className="w-[46%] px-5 py-1.5">
                        <select
                          className="h-9 w-full rounded-md border border-line bg-surface px-2 text-[13.5px] disabled:bg-paper"
                          value={s.lineMap[l.id]}
                          disabled={!canEdit}
                          onChange={(e) => s.setLineAccount(l.id, e.target.value)}
                        >
                          {expenseAccounts.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.code} {a.name[lang]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  )
}

function AddAccount({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const headers = s.accounts.filter((a) => !a.postable)
  const [parent, setParent] = useState('52')
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [postable, setPostable] = useState(true)
  const [office, setOffice] = useState('')
  const p = s.accounts.find((a) => a.code === parent)!
  const code = nextAccountCode(s.accounts, parent)
  const isCash = parent === '1101' || parent === '1102'
  const [currency, setCurrency] = useState<'SDG' | 'USD'>('SDG')
  const save = async () => {
    const r = await s.addAccount({
      code,
      parent,
      name: { ar: nameAr || nameEn, en: nameEn || nameAr },
      type: p.type,
      postable,
      currency: isCash && postable ? currency : undefined,
      officeId: isCash && office ? office : undefined,
    })
    if (r === false) return
    setNameAr('')
    setNameEn('')
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={ar ? 'إضافة حساب' : 'Add account'}>
      <div className="space-y-4">
        <Field label={ar ? 'تحت الحساب' : 'Under'}>
          <select className={inputCls} value={parent} onChange={(e) => setParent(e.target.value)}>
            {headers.map((h) => (
              <option key={h.code} value={h.code}>
                {h.code} {h.name[lang]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
          <Field label={ar ? 'الرقم' : 'Code'} hint={ar ? 'تلقائي' : 'Automatic'}>
            <input className={`${inputCls} num bg-paper`} value={code} readOnly />
          </Field>
          <Field label={ar ? 'الاسم بالعربية' : 'Name in Arabic'}>
            <input className={inputCls} value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
          </Field>
        </div>
        <Field label={ar ? 'الاسم بالإنجليزية' : 'Name in English'}>
          <input className={inputCls} value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
        </Field>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
          <span className="text-muted">
            {ar ? 'النوع:' : 'Type:'} <b className="text-ink">{typeName[p.type][lang]}</b>
          </span>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={postable} onChange={(e) => setPostable(e.target.checked)} className="size-4" />
            {ar ? 'يقبل القيود (حساب فرعي)' : 'Takes entries (detail account)'}
          </label>
        </div>
        {isCash && postable && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={ar ? 'العملة' : 'Currency'}>
              <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as 'SDG' | 'USD')}>
                <option value="SDG">{ar ? 'جنيه سوداني' : 'SDG'}</option>
                <option value="USD">{ar ? 'دولار' : 'USD'}</option>
              </select>
            </Field>
            <Field label={ar ? 'المكتب' : 'Office'}>
              <select className={inputCls} value={office} onChange={(e) => setOffice(e.target.value)}>
                <option value="">—</option>
                {getOffices().map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name[lang]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          {ar ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button onClick={save} disabled={!nameAr.trim() && !nameEn.trim()}>
          {ar ? 'حفظ الحساب' : 'Save account'}
        </Button>
      </div>
    </Modal>
  )
}

function Statement({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  if (!account) return null
  const dn = account.type === 'asset' || account.type === 'expense'
  let run = 0
  const rows = s.journal
    .flatMap((e) => e.lines.filter((l) => l.account === account.code && lineMatches(l, e, {})).map((l) => ({ e, l })))
    .sort((a, b) => +new Date(a.e.date) - +new Date(b.e.date))
    .map(({ e, l }) => {
      run += dn ? l.debit - l.credit : l.credit - l.debit
      return { e, l, run }
    })
  const proj = (id?: string) => s.projects.find((p) => p.id === id)?.code
  const off = (id?: string) => getOffices().find((o) => o.id === id)?.name[lang]
  return (
    <Modal open onClose={onClose} title={`${ar ? 'كشف حساب' : 'Account statement'} — ${account.code} ${account.name[lang]}`} wide>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-[12px] text-muted">
              <th className="py-2 pe-3 text-start font-medium">{ar ? 'التاريخ' : 'Date'}</th>
              <th className="py-2 pe-3 text-start font-medium">{ar ? 'القيد' : 'Entry'}</th>
              <th className="py-2 pe-3 text-start font-medium">{ar ? 'البيان' : 'Description'}</th>
              <th className="py-2 pe-3 text-end font-medium">{ar ? 'مدين' : 'Debit'}</th>
              <th className="py-2 pe-3 text-end font-medium">{ar ? 'دائن' : 'Credit'}</th>
              <th className="py-2 text-end font-medium">{ar ? 'الرصيد' : 'Balance'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted">
                  {ar ? 'لا توجد حركات على هذا الحساب بعد.' : 'No entries on this account yet.'}
                </td>
              </tr>
            )}
            {rows.map(({ e, l, run }, i) => (
              <tr key={e.id + i}>
                <td className="num py-2 pe-3 whitespace-nowrap text-muted">{date(e.date, lang)}</td>
                <td className="num py-2 pe-3 whitespace-nowrap">
                  {e.no}
                  {e.ref && <span className="block text-[11.5px] text-muted">{e.ref}</span>}
                </td>
                <td className="py-2 pe-3">
                  {e.memo[lang]}
                  {(l.projectId || l.officeId) && (
                    <span className="block text-[11.5px] text-muted">{[proj(l.projectId), off(l.officeId)].filter(Boolean).join(ar ? '، ' : ', ')}</span>
                  )}
                </td>
                <td className="num py-2 pe-3 text-end">{l.debit ? usd(l.debit) : ''}</td>
                <td className="num py-2 pe-3 text-end">{l.credit ? usd(l.credit) : ''}</td>
                <td className="num py-2 text-end font-medium">{usd(run)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
