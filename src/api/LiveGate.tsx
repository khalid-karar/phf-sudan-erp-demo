import { Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Field, inputCls } from '../components/ui'
import { useSession } from '../lib/session'
import { useStore } from '../lib/store'
import { ApiError, changePassword, hasRefreshToken, login, resume, whenSignedOut } from './http'
import { SecretDialog } from './secret'
import { guardUnwired, bootstrapLive, refreshInbox } from './live'

type Phase = 'checking' | 'signedOut' | 'mustChange' | 'loading' | 'ready' | 'error'

function Shell({ children }: { children: ReactNode }) {
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const org = useStore((s) => s.org)
  const ar = lang === 'ar'
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex flex-col justify-between bg-nile p-8 text-white lg:p-12">
        <div className="flex items-center gap-3">
          <img src={org.logo.replace('phf-logo', 'phf-mark')} alt="" className="size-12 rounded-full bg-white object-contain p-0.5" />
          <div className="leading-tight">
            <div className="font-kufi text-[17px] font-semibold">{org.shortName[lang]}</div>
            <div className="text-[13px] text-white/65">{org.name[lang]}</div>
          </div>
        </div>
        <div className="my-10 max-w-md">
          <h1 className="font-kufi text-[30px] leading-snug font-bold">{ar ? 'مَن كان في حاجة أخيه كان الله في حاجته' : 'Whoever helps his brother, God helps him'}</h1>
          <p className="mt-3 text-white/70">{ar ? 'الرئاسة في الخرطوم والمكاتب في الولايات على نظام واحد: الصرف والتقارير الفنية والمخازن والموظفون.' : 'Khartoum HQ and every state office on one system: spending, field reports, stores and staff.'}</p>
        </div>
        <button onClick={() => setLang(ar ? 'en' : 'ar')} className="w-fit rounded-md border border-white/30 px-3 py-1.5 text-[13px] hover:bg-white/10">
          {ar ? 'English' : 'العربية'}
        </button>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}

function SignIn({ onDone }: { onDone: (mustChange: boolean) => void }) {
  const lang = useStore((s) => s.lang)
  const ar = lang === 'ar'
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!email.trim() || !pw) return setErr(ar ? 'أدخل البريد وكلمة المرور.' : 'Enter your email and password.')
    setBusy(true)
    setErr('')
    try {
      const r = await login(email.trim(), pw)
      onDone(r.mustChangePassword)
    } catch (e) {
      setErr(e instanceof ApiError ? e.msg[lang] : ar ? 'تعذّر تسجيل الدخول.' : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <h2 className="text-[24px] font-bold">{ar ? 'تسجيل الدخول' : 'Sign in'}</h2>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label={ar ? 'البريد الإلكتروني' : 'Email'}>
          <input className={inputCls} dir="ltr" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@kphfs.org" autoFocus />
        </Field>
        <Field label={ar ? 'كلمة المرور' : 'Password'}>
          <input className={inputCls} dir="ltr" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {err && (
          <p role="alert" className="text-[13.5px] text-crescent">
            {err}
          </p>
        )}
        <Button className="w-full" disabled={busy} type="submit">
          {busy ? (ar ? 'جارٍ الدخول…' : 'Signing in…') : ar ? 'دخول' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 text-[13px] text-muted">{ar ? 'نسيت كلمة المرور؟ اطلب من مدير النظام إعادة تعيينها.' : 'Forgot your password? Ask the system administrator to reset it.'}</p>
    </>
  )
}

function MustChange({ onDone }: { onDone: () => void }) {
  const lang = useStore((s) => s.lang)
  const ar = lang === 'ar'
  const [cur, setCur] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (a !== b) return setErr(ar ? 'كلمتا المرور غير متطابقتين.' : 'The two passwords do not match.')
    if (a.length < 10 || !/\d/.test(a) || !/[A-Za-z؀-ۿ]/.test(a)) return setErr(ar ? 'كلمة المرور 10 خانات على الأقل وتحتوي أحرفاً وأرقاماً.' : 'Use at least 10 characters, with letters and numbers.')
    setBusy(true)
    setErr('')
    try {
      await changePassword(cur, a)
      onDone()
    } catch (e) {
      setErr(e instanceof ApiError ? e.msg[lang] : ar ? 'تعذّر تغيير كلمة المرور.' : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <h2 className="text-[24px] font-bold">{ar ? 'اختر كلمة مرور جديدة' : 'Choose a new password'}</h2>
      <p className="mt-2 text-muted">{ar ? 'كلمة المرور الحالية مؤقتة. اختر كلمة مرور خاصة بك قبل المتابعة.' : 'Your current password is temporary. Choose your own before you continue.'}</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label={ar ? 'كلمة المرور المؤقتة' : 'Temporary password'}>
          <input className={inputCls} dir="ltr" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
        </Field>
        <Field label={ar ? 'كلمة المرور الجديدة' : 'New password'} hint={ar ? '10 خانات على الأقل، أحرف وأرقام' : 'At least 10 characters, letters and numbers'}>
          <input className={inputCls} dir="ltr" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} />
        </Field>
        <Field label={ar ? 'أعد كتابتها' : 'Type it again'}>
          <input className={inputCls} dir="ltr" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} />
        </Field>
        {err && (
          <p role="alert" className="text-[13.5px] text-crescent">
            {err}
          </p>
        )}
        <Button className="w-full" disabled={busy} type="submit">
          {ar ? 'حفظ ومتابعة' : 'Save and continue'}
        </Button>
      </form>
    </>
  )
}

/** Live mode: nothing is shown until the person is signed in and their data is loaded. */
export function LiveGate({ children }: { children: ReactNode }) {
  const lang = useStore((s) => s.lang)
  const ar = lang === 'ar'
  const [phase, setPhase] = useState<Phase>('checking')
  const [failure, setFailure] = useState('')

  const load = async () => {
    setPhase('loading')
    try {
      await bootstrapLive()
      guardUnwired()
      setPhase('ready')
    } catch (e) {
      setFailure(e instanceof ApiError ? e.msg[lang] : ar ? 'تعذّر تحميل البيانات.' : 'Could not load the data.')
      setPhase('error')
    }
  }

  useEffect(() => {
    whenSignedOut(() => setPhase('signedOut'))
    void (async () => {
      if (hasRefreshToken() && (await resume())) await load()
      else setPhase('signedOut')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !useSession.getState().donorId) void refreshInbox().catch(() => undefined)
    }, 60_000)
    return () => clearInterval(t)
  }, [phase])

  if (phase === 'ready')
    return (
      <>
        {children}
        <SecretDialog />
      </>
    )
  if (phase === 'signedOut')
    return (
      <Shell>
        <SignIn onDone={(must) => (must ? setPhase('mustChange') : void load())} />
      </Shell>
    )
  if (phase === 'mustChange')
    return (
      <Shell>
        <MustChange onDone={() => void load()} />
      </Shell>
    )
  if (phase === 'error')
    return (
      <Shell>
        <h2 className="text-[22px] font-bold">{ar ? 'تعذّر فتح النظام' : 'Could not open the system'}</h2>
        <p className="mt-2 text-muted">{failure}</p>
        <div className="mt-5 flex gap-2">
          <Button onClick={() => void load()}>{ar ? 'إعادة المحاولة' : 'Try again'}</Button>
          <Button variant="quiet" onClick={() => setPhase('signedOut')}>
            {ar ? 'تسجيل الدخول من جديد' : 'Sign in again'}
          </Button>
        </div>
      </Shell>
    )
  return (
    <div className="grid min-h-screen place-items-center text-muted" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2">
        <Loader2 className="animate-spin" size={18} /> {phase === 'checking' ? (ar ? 'جارٍ التحقق…' : 'Checking…') : ar ? 'جارٍ تحميل البيانات…' : 'Loading your data…'}
      </div>
    </div>
  )
}
