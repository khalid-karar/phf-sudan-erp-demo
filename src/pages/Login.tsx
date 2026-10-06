import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { initialsOf } from '../components/Layout'
import { Button, Field, inputCls } from '../components/ui'
import { useStore } from '../lib/store'

export function Login() {
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const org = useStore((s) => s.org)
  const users = useStore((s) => s.users)
  const roles = useStore((s) => s.roles)
  const offices = useStore((s) => s.offices)
  const setUser = useStore((s) => s.setUser)
  const go = useNavigate()
  const ar = lang === 'ar'
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const signIn = (id: string) => {
    setUser(id)
    go('/')
  }
  const submit = () => {
    const u = users.find((x) => x.email?.toLowerCase() === email.trim().toLowerCase() && x.active !== false)
    if (!u) return setErr(ar ? 'لا يوجد مستخدم نشط بهذا البريد.' : 'No active user with this email.')
    if (!pw) return setErr(ar ? 'أدخل كلمة المرور.' : 'Enter your password.')
    signIn(u.id)
  }
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex flex-col justify-between bg-nile p-8 text-white lg:p-12">
        <div className="flex items-center gap-3">
          <img src={org.logo} alt="" className="size-12 rounded-full bg-white object-cover" />
          <div className="leading-tight">
            <div className="font-kufi text-[17px] font-semibold">{org.shortName[lang]}</div>
            <div className="text-[13px] text-white/65">{org.name[lang]}</div>
          </div>
        </div>
        <div className="my-10 max-w-md">
          <h1 className="font-kufi text-[30px] leading-snug font-bold">{ar ? 'مَن كان في حاجة أخيه كان الله في حاجته' : 'Whoever helps his brother, God helps him'}</h1>
          <p className="mt-3 text-white/70">
            {ar ? 'الرئاسة في الخرطوم والمكاتب في الولايات على نظام واحد: الصرف والتقارير الفنية والمخازن والموظفون.' : 'Khartoum HQ and every state office on one system: spending, field reports, stores and staff.'}
          </p>
        </div>
        <button onClick={() => setLang(ar ? 'en' : 'ar')} className="w-fit rounded-md border border-white/30 px-3 py-1.5 text-[13px] hover:bg-white/10">
          {ar ? 'English' : 'العربية'}
        </button>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <h2 className="text-[24px] font-bold">{ar ? 'تسجيل الدخول' : 'Sign in'}</h2>
          <div className="mt-6 space-y-4">
            <Field label={ar ? 'البريد الإلكتروني' : 'Email'}>
              <input className={inputCls} dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@kphfs.org" />
            </Field>
            <Field label={ar ? 'كلمة المرور' : 'Password'}>
              <input className={inputCls} dir="ltr" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </Field>
            {err && <p className="text-[13.5px] text-crescent">{err}</p>}
            <Button className="w-full" onClick={submit}>
              {ar ? 'دخول' : 'Sign in'}
            </Button>
          </div>
          <div className="mt-8">
            <div className="mb-2 text-[13px] text-muted">{ar ? 'للعرض: ادخل مباشرة بأحد المستخدمين' : 'Demo: sign in directly as one of the users'}</div>
            <div className="grid max-h-[340px] gap-2 overflow-y-auto sm:grid-cols-2">
              {users
                .filter((u) => u.active !== false)
                .map((u) => (
                  <button key={u.id} onClick={() => signIn(u.id)} className="flex items-center gap-2.5 rounded-md border border-line bg-surface p-2.5 text-start hover:border-nile-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded bg-nile-soft font-kufi text-[11.5px] font-semibold text-nile">{initialsOf(u.name[lang])}</span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[13px] font-medium">{roles.find((r) => r.id === u.role)?.name[lang]}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {u.name[lang]}
                        {ar ? '، ' : ', '}
                        {offices.find((o) => o.id === u.officeId)?.name[lang]}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
