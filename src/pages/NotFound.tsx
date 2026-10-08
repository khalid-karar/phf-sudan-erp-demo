import { Compass, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useLang } from '../lib/i18n'

/** Shown for any address the app does not know — an old bookmark, a mistyped link. */
export function NotFound() {
  const lang = useLang()
  const ar = lang === 'ar'
  const { pathname } = useLocation()
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-paper text-muted ring-1 ring-line">
        <Compass size={24} />
      </span>
      <h1 className="mt-4 text-[22px] font-bold">{ar ? 'لم نجد هذه الصفحة' : 'We couldn’t find that page'}</h1>
      <p className="mt-2 text-muted">
        {ar ? 'ربما تغيّر الرابط أو كُتب خطأً. يمكنك العودة إلى لوحة القيادة أو البحث عن الصفحة بالاسم.' : 'The link may have changed or been mistyped. Go back to the dashboard, or search for the page by name.'}
      </p>
      <p className="num mt-3 text-[13px] text-muted" dir="ltr">
        {pathname}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="inline-flex h-10 items-center rounded-md bg-nile px-4 text-[14px] font-medium text-white hover:bg-nile-2">
          {ar ? 'العودة إلى لوحة القيادة' : 'Back to the dashboard'}
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-[14px] hover:border-nile-2 hover:text-nile"
        >
          <Search size={16} /> {ar ? 'ابحث عن صفحة' : 'Search for a page'}
        </button>
      </div>
    </div>
  )
}
