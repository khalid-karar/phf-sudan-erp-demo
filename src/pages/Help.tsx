import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Keyboard, LifeBuoy, ListChecks, Mail, PlayCircle, Route, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HelpDrawer } from '../components/Help'
import { useVisibleNav } from '../components/Layout'
import { articles, faqs, glossary, tasks, type HelpArticle } from '../lib/help'
import { useLang } from '../lib/i18n'
import { locate } from '../lib/nav'
import { useStore } from '../lib/store'

const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')

export function HelpCentre() {
  const lang = useLang()
  const ar = lang === 'ar'
  const nav = useVisibleNav()
  const startTour = useStore((s) => s.startTour)
  const hidden = useStore((s) => s.checklistHidden.includes(s.userId))
  const showChecklist = useStore((s) => s.hideChecklist)
  const users = useStore((s) => s.users)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [faqOpen, setFaqOpen] = useState<number | null>(0)
  const [taskOpen, setTaskOpen] = useState<string | null>(null)

  const allowed = useMemo(() => new Set(nav.flatMap((m) => m.items.map((i) => i.to))), [nav])
  const mine = articles.filter((a) => allowed.has(a.path))
  const openPath = params.get('a')
  const open = openPath ? articles.find((a) => a.path === openPath) : undefined
  const setOpen = (a?: HelpArticle) => setParams(a ? { a: a.path } : {}, { replace: true })

  const nq = norm(q.trim())
  const found = nq ? mine.filter((a) => norm(a.title[lang] + ' ' + a.what[lang] + ' ' + a.steps[lang].join(' ')).includes(nq)) : mine
  const groups = nav
    .map((m) => ({ m, list: found.filter((a) => locate(a.path)?.module.key === m.key) }))
    .filter((g) => g.list.length)
  const admin = users.find((u) => u.role === 'admin')
  // A task is shown when the person can open its first page (so it is a job they can really do).
  const myTasks = tasks.filter((k) => {
    const first = k.steps.find((x) => x.to)?.to
    return !first || allowed.has(first)
  })
  const foundTasks = nq ? myTasks.filter((k) => norm(k.title[lang] + ' ' + k.steps.map((x) => x.text[lang]).join(' ')).includes(nq)) : myTasks
  const Go = ar ? ArrowLeft : ArrowRight

  return (
    <div>
      <section className="mb-7 rounded-xl bg-nile px-6 py-8 text-white sm:px-10">
        <h1 className="font-kufi text-[26px] font-bold">{ar ? 'مركز المساعدة' : 'Help centre'}</h1>
        <p className="mt-1.5 max-w-[60ch] text-white/75">
          {ar ? 'كل صفحة في النظام مشروحة هنا خطوة بخطوة. تظهر لك فقط الصفحات المتاحة لدورك.' : 'Every page in the system is explained here step by step. You only see the pages your role can use.'}
        </p>
        <div className="relative mt-5 max-w-xl">
          <Search size={18} className="pointer-events-none absolute top-1/2 start-3.5 -translate-y-1/2 text-muted" />
          <input
            className="h-12 w-full rounded-lg border-0 bg-white ps-11 pe-4 text-[15px] text-ink outline-none ring-2 ring-transparent focus:ring-amber"
            placeholder={ar ? 'ما الذي تريد أن تفعله؟ مثال: عهدة، سقف، تقرير المقر…' : 'What do you want to do? e.g. advance, ceiling, HQ report…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={ar ? 'ابحث في المساعدة' : 'Search help'}
          />
        </div>
      </section>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button onClick={startTour} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-start hover:border-nile-2">
          <PlayCircle className="mt-0.5 shrink-0 text-crescent" size={20} />
          <span>
            <span className="block font-medium">{ar ? 'الجولة التعريفية' : 'Guided tour'}</span>
            <span className="block text-[13px] text-muted">{ar ? 'دقيقة واحدة لتتعرف على الواجهة' : 'One minute around the interface'}</span>
          </span>
        </button>
        <button onClick={() => showChecklist(true)} disabled={!hidden} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-start hover:border-nile-2 disabled:opacity-60">
          <ListChecks className="mt-0.5 shrink-0 text-leaf" size={20} />
          <span>
            <span className="block font-medium">{ar ? 'قائمة «ابدأ من هنا»' : '“Get started” checklist'}</span>
            <span className="block text-[13px] text-muted">{hidden ? (ar ? 'أظهرها مجدداً في لوحة القيادة' : 'Show it again on the dashboard') : ar ? 'ظاهرة في لوحة القيادة' : 'Showing on your dashboard'}</span>
          </span>
        </button>
        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
          <Keyboard className="mt-0.5 shrink-0 text-nile" size={20} />
          <span>
            <span className="block font-medium">{ar ? 'اختصار البحث' : 'Search shortcut'}</span>
            <span className="block text-[13px] text-muted">
              <kbd className="rounded border border-line bg-paper px-1.5 text-[12px]" dir="ltr">
                Ctrl K
              </kbd>{' '}
              {ar ? 'للانتقال إلى أي صفحة أو سجل' : 'to jump to any page or record'}
            </span>
          </span>
        </div>
        <a href={admin ? `mailto:${admin.email}` : undefined} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 hover:border-nile-2">
          <LifeBuoy className="mt-0.5 shrink-0 text-amber" size={20} />
          <span className="min-w-0">
            <span className="block font-medium">{ar ? 'تحتاج مساعدة إضافية؟' : 'Need more help?'}</span>
            <span className="block truncate text-[13px] text-muted">
              <Mail size={12} className="me-1 inline" />
              {admin?.email ?? '—'}
            </span>
          </span>
        </a>
      </div>

      {foundTasks.length > 0 && (
        <section className="mb-9">
          <h2 className="mb-3 flex items-center gap-2 font-kufi text-[18px] font-semibold">
            <Route size={19} /> {ar ? 'ما الذي تريد إنجازه؟' : 'What do you want to get done?'}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {foundTasks.map((k) => {
              const isOpen = taskOpen === k.id || (!!nq && foundTasks.length <= 2)
              return (
                <div key={k.id} className="rounded-lg border border-line bg-surface">
                  <button onClick={() => setTaskOpen(isOpen && taskOpen === k.id ? null : k.id)} className="flex w-full items-center gap-3 px-4 py-3 text-start" aria-expanded={isOpen}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{k.title[lang]}</span>
                      <span className="block text-[12.5px] text-muted">{k.who[lang]}</span>
                    </span>
                    <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <ol className="space-y-3 border-t border-line px-4 py-4">
                      {k.steps.map((st, i) => {
                        const ok = !st.to || allowed.has(st.to)
                        return (
                          <li key={i} className="flex gap-3">
                            <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-nile-soft text-[12.5px] font-semibold text-nile">{i + 1}</span>
                            <span className="min-w-0 flex-1 text-[14.5px] leading-relaxed">
                              {st.text[lang]}
                              {st.to && ok && (
                                <Link to={st.to} className="ms-2 inline-flex items-center gap-1 whitespace-nowrap text-[13.5px] font-medium text-nile hover:underline">
                                  {ar ? 'افتح الصفحة' : 'Open page'} <Go size={14} />
                                </Link>
                              )}
                            </span>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <h2 className="mb-3 flex items-center gap-2 font-kufi text-[18px] font-semibold">
        <BookOpen size={19} /> {nq ? (ar ? `نتائج البحث (${found.length})` : `Search results (${found.length})`) : ar ? 'شرح الصفحات' : 'Page guides'}
      </h2>
      {groups.length === 0 && <p className="mb-8 rounded-lg border border-line bg-surface px-5 py-8 text-center text-muted">{ar ? 'لا توجد نتائج. جرّب كلمة أخرى، أو اطّلع على الأسئلة الشائعة أدناه.' : 'No results. Try another word, or see the common questions below.'}</p>}
      <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(({ m, list }) => (
          <section key={m.key} className="rounded-lg border border-line bg-surface">
            <h3 className="border-b border-line px-4 py-2.5 text-[14.5px] font-semibold">{m.label[lang]}</h3>
            <ul className="p-1.5">
              {list.map((a) => (
                <li key={a.path}>
                  <button onClick={() => setOpen(a)} className="w-full rounded-md px-3 py-2 text-start hover:bg-paper">
                    <span className="block text-[14px] font-medium text-nile">{a.title[lang]}</span>
                    <span className="line-clamp-2 block text-[12.5px] text-muted">{a.what[lang]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section>
          <h2 className="mb-3 font-kufi text-[18px] font-semibold">{ar ? 'أسئلة شائعة' : 'Common questions'}</h2>
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {faqs.map((f, i) => (
              <div key={i}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="flex w-full items-center gap-3 px-5 py-3.5 text-start font-medium" aria-expanded={faqOpen === i}>
                  <span className="flex-1">{f.q[lang]}</span>
                  <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} />
                </button>
                {faqOpen === i && <p className="px-5 pb-4 text-[14.5px] leading-relaxed text-muted">{f.a[lang]}</p>}
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-kufi text-[18px] font-semibold">{ar ? 'مصطلحات' : 'Glossary'}</h2>
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
            {glossary.map((g) => (
              <div key={g.term.en} className="px-5 py-3">
                <dt className="font-medium">{g.term[lang]}</dt>
                <dd className="text-[13.5px] text-muted">{g.def[lang]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      {open && <HelpDrawer a={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}
