import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Access, ModuleKey } from '../data/types'
import { locate } from '../lib/nav'
import { useStore, usePerm } from '../lib/store'

/** Shows the page only when the user's role allows it; otherwise explains why and who can help. */
export function Guard({ children }: { children: ReactNode }) {
  const { can, role } = usePerm()
  const lang = useStore((s) => s.lang)
  const users = useStore((s) => s.users)
  const loc = useLocation()
  const here = locate(loc.pathname)
  if (!here) return <>{children}</>
  const m = here.module.key as ModuleKey
  const min: Access = here.item.min ?? 'view'
  if (can(m, min)) return <>{children}</>
  const admins = users.filter((u) => u.role === 'admin' && u.active !== false)
  const ar = lang === 'ar'
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-paper text-muted ring-1 ring-line">
        <Lock size={24} />
      </span>
      <h1 className="mt-4 text-[22px] font-bold">{ar ? 'هذه الصفحة غير متاحة لدورك' : 'This page isn’t available for your role'}</h1>
      <p className="mt-2 text-muted">
        {ar
          ? `دورك الحالي «${role?.name.ar}» لا يملك صلاحية «${here.item.label.ar}». إذا كنت تحتاجها في عملك، اطلبها من مدير النظام.`
          : `Your role “${role?.name.en}” doesn’t include “${here.item.label.en}”. If you need it for your work, ask the system administrator.`}
      </p>
      {admins[0] && (
        <p className="mt-3 text-[14px]">
          {admins[0].name[lang]} —{' '}
          <a className="text-nile hover:underline" href={`mailto:${admins[0].email}`} dir="ltr">
            {admins[0].email}
          </a>
        </p>
      )}
      <Link to="/" className="mt-6 inline-block text-nile hover:underline">
        {ar ? 'العودة إلى لوحة القيادة' : 'Back to the dashboard'}
      </Link>
    </div>
  )
}
