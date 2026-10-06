import { ArrowLeftRight, CornerDownLeft, FileText, Hash, Layers, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { helpItem } from '../lib/nav'
import { usePerm, useStore } from '../lib/store'
import { useVisibleNav } from './Layout'

interface Hit {
  id: string
  group: string
  title: string
  sub?: string
  to: string
  icon: ReactNode
}

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useStore((s) => s.lang)
  const ar = lang === 'ar'
  const s = useStore()
  const nav = useVisibleNav()
  const { can } = usePerm()
  const go = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => input.current?.focus(), 10)
    }
  }, [open])

  const hits = useMemo(() => {
    const G = {
      pages: ar ? 'الصفحات' : 'Pages',
      actions: ar ? 'إجراءات سريعة' : 'Quick actions',
      records: ar ? 'السجلات' : 'Records',
    }
    const all: Hit[] = []
    for (const m of nav)
      for (const it of m.items)
        all.push({ id: it.to, group: G.pages, title: it.label[lang], sub: m.items.length > 1 ? m.label[lang] + (it.hint ? ` — ${it.hint[lang]}` : '') : it.hint?.[lang], to: it.to, icon: <Layers size={16} /> })
    all.push({ id: '/help', group: G.pages, title: helpItem.label[lang], to: '/help', icon: <Layers size={16} /> })

    const act = (id: string, title: string, to: string, ok: boolean) => ok && all.push({ id, group: G.actions, title, to, icon: <Plus size={16} /> })
    act('a-req', ar ? 'طلب صرف جديد' : 'New spend request', '/requests/new', can('projects', 'edit'))
    act('a-rep', ar ? 'رفع تقرير فني' : 'Submit a field report', '/activities/report', can('activities', 'edit'))
    act('a-rv', ar ? 'سند قبض جديد' : 'New receipt voucher', '/finance/vouchers?new=receipt', can('finance', 'edit'))
    act('a-user', ar ? 'إضافة مستخدم' : 'Add a user', '/settings/users?new=1', can('settings', 'manage'))
    act('a-office', ar ? 'إضافة مكتب' : 'Add an office', '/settings/offices?new=1', can('settings', 'manage'))
    act('a-role', ar ? 'إنشاء دور وصلاحيات' : 'Create a role', '/settings/roles?new=1', can('settings', 'manage'))
    act('a-hq', ar ? 'إصدار التقرير الشهري للمقر' : 'Produce the monthly HQ report', '/reports/hq', can('reports', 'view'))

    if (q.trim()) {
      if (can('projects'))
        for (const r of s.requests) all.push({ id: r.id, group: G.records, title: `${r.code} — ${r.purpose[lang]}`, to: `/requests/${r.id}`, icon: <FileText size={16} /> })
      if (can('projects'))
        for (const p of s.projects) all.push({ id: p.id, group: G.records, title: `${p.code} — ${p.name[lang]}`, to: `/projects/${p.id}`, icon: <FileText size={16} /> })
      if (can('finance')) {
        for (const a of s.accounts) all.push({ id: 'acc' + a.code, group: G.records, title: `${a.code} ${a.name[lang]}`, sub: ar ? 'دليل الحسابات' : 'Chart of accounts', to: '/finance/accounts', icon: <Hash size={16} /> })
        for (const a of s.advances) all.push({ id: a.id, group: G.records, title: `${a.no} — ${a.activityCode}`, sub: ar ? 'عهدة' : 'Advance', to: '/finance/advances', icon: <ArrowLeftRight size={16} /> })
      }
      if (can('settings', 'manage'))
        for (const u of s.users) all.push({ id: u.id, group: G.records, title: u.name[lang], sub: u.email, to: '/settings/users', icon: <FileText size={16} /> })
    }
    const nq = norm(q.trim())
    const res = nq ? all.filter((h) => norm(h.title + ' ' + (h.sub ?? '')).includes(nq)) : all.filter((h) => h.group !== G.records)
    const byGroup: Record<string, number> = {}
    return res.filter((h) => (byGroup[h.group] = (byGroup[h.group] ?? 0) + 1) <= (h.group === G.records ? 8 : 12))
  }, [q, nav, lang, ar, can, s.requests, s.projects, s.accounts, s.advances, s.users])

  useEffect(() => setSel(0), [q])
  if (!open) return null
  const choose = (h: Hit) => {
    go(h.to)
    onClose()
  }
  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={input}
            className="h-14 flex-1 bg-transparent text-[16px] outline-none"
            placeholder={ar ? 'ابحث عن صفحة أو إجراء أو رقم طلب أو حساب…' : 'Search pages, actions, request numbers, accounts…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((x) => Math.min(hits.length - 1, x + 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((x) => Math.max(0, x - 1))
              }
              if (e.key === 'Enter' && hits[sel]) choose(hits[sel])
            }}
            aria-label={ar ? 'بحث' : 'Search'}
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto p-2" role="listbox">
          {hits.length === 0 && <li className="px-3 py-8 text-center text-muted">{ar ? 'لا توجد نتائج. جرّب كلمة أخرى.' : 'No results. Try another word.'}</li>}
          {hits.map((h, i) => {
            const header = h.group !== lastGroup
            lastGroup = h.group
            return (
              <li key={h.group + h.id}>
                {header && <div className="px-3 pt-2.5 pb-1 text-[12px] text-muted">{h.group}</div>}
                <button
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => choose(h)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-start ${i === sel ? 'bg-nile-soft' : ''}`}
                >
                  <span className="text-muted">{h.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{h.title}</span>
                    {h.sub && <span className="block truncate text-[12px] text-muted">{h.sub}</span>}
                  </span>
                  {i === sel && <CornerDownLeft size={14} className="text-muted" />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex gap-4 border-t border-line px-4 py-2 text-[12px] text-muted">
          <span>{ar ? '↑ ↓ للتنقل' : '↑ ↓ to move'}</span>
          <span>{ar ? 'Enter للفتح' : 'Enter to open'}</span>
        </div>
      </div>
    </div>
  )
}
