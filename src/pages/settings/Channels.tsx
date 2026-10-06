import { CheckCircle2, ChevronDown, Eye, EyeOff, Lock, Mail, MessageCircle, MessageSquareText, Send, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, Field, inputCls, PageHeader, Panel } from '../../components/ui'
import type { Channel, ChannelConfig } from '../../data/types'
import { date } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { useStore, useUser } from '../../lib/store'

type Bi2 = { ar: string; en: string }
const emailPresets: Record<ChannelConfig['email']['provider'], { name: Bi2; host: string; port: number; security: ChannelConfig['email']['security']; userHint: Bi2 }> = {
  microsoft365: { name: { ar: 'Microsoft 365 / Outlook', en: 'Microsoft 365 / Outlook' }, host: 'smtp.office365.com', port: 587, security: 'starttls', userHint: { ar: 'البريد الكامل للحساب المرسل', en: 'Full email of the sending mailbox' } },
  google: { name: { ar: 'Google Workspace / Gmail', en: 'Google Workspace / Gmail' }, host: 'smtp.gmail.com', port: 587, security: 'starttls', userHint: { ar: 'البريد الكامل، وكلمة مرور التطبيقات (App password)', en: 'Full email, with an App password' } },
  sendgrid: { name: { ar: 'SendGrid', en: 'SendGrid' }, host: 'smtp.sendgrid.net', port: 587, security: 'starttls', userHint: { ar: 'اكتب apikey حرفياً، وكلمة المرور هي مفتاح API', en: 'Type apikey literally; the password is the API key' } },
  smtp: { name: { ar: 'خادم بريد آخر (SMTP)', en: 'Other mail server (SMTP)' }, host: '', port: 465, security: 'ssl', userHint: { ar: 'كما يعطيك مزوّد البريد', en: 'As given by your mail provider' } },
}

const guides: Record<string, { ar: string[]; en: string[] }> = {
  microsoft365: {
    ar: [
      'أنشئ صندوق بريد للإرسال مثل notifications@kphfs.org في مركز إدارة Microsoft 365.',
      'من: المستخدمون ← اختر الحساب ← البريد ← إدارة تطبيقات البريد، فعّل «Authenticated SMTP».',
      'إذا كان التحقق الثنائي مفعّلاً على الحساب، أنشئ كلمة مرور تطبيقات واستخدمها هنا.',
      'اختر Microsoft 365 أعلاه، أدخل البريد وكلمة المرور، ثم أرسل رسالة تجريبية.',
    ],
    en: [
      'Create a sending mailbox such as notifications@kphfs.org in the Microsoft 365 admin center.',
      'Go to Users → select the account → Mail → Manage email apps, and turn on “Authenticated SMTP”.',
      'If the account uses two-step verification, create an app password and use it here.',
      'Pick Microsoft 365 above, enter the email and password, then send a test message.',
    ],
  },
  google: {
    ar: [
      'سجّل الدخول بحساب الإرسال وفعّل التحقق بخطوتين من إعدادات الأمان في حساب Google.',
      'افتح صفحة «كلمات مرور التطبيقات» وأنشئ كلمة مرور باسم «نظام الموارد».',
      'اختر Google أعلاه، أدخل البريد وكلمة مرور التطبيقات (16 حرفاً)، ثم أرسل رسالة تجريبية.',
    ],
    en: [
      'Sign in to the sending account and turn on 2-Step Verification in Google account security.',
      'Open “App passwords” and create one named “Resource system”.',
      'Pick Google above, enter the email and the 16-character app password, then send a test.',
    ],
  },
  sendgrid: {
    ar: ['أنشئ حساب SendGrid ووثّق نطاق البريد kphfs.org.', 'من Settings ← API Keys أنشئ مفتاحاً بصلاحية Mail Send.', 'اسم المستخدم: apikey، وكلمة المرور: المفتاح. ثم أرسل رسالة تجريبية.'],
    en: ['Create a SendGrid account and verify the kphfs.org domain.', 'Under Settings → API Keys, create a key with Mail Send access.', 'Username: apikey; password: the key. Then send a test.'],
  },
  smtp: {
    ar: ['اطلب من مزوّد الاستضافة: عنوان خادم SMTP، المنفذ، نوع التشفير.', 'المنفذ 465 يعمل مع SSL، والمنفذ 587 مع STARTTLS.', 'أدخل حساب الإرسال وكلمة مروره، ثم أرسل رسالة تجريبية.'],
    en: ['Ask your hosting provider for the SMTP server, port and encryption type.', 'Port 465 uses SSL; port 587 uses STARTTLS.', 'Enter the sending account and password, then send a test.'],
  },
  cloud_api: {
    ar: [
      'وثّق المؤسسة في Meta Business Manager (business.facebook.com).',
      'من developers.facebook.com أنشئ تطبيقاً من نوع Business وأضف إليه WhatsApp.',
      'في صفحة API Setup أضف رقم الإرسال (رقم غير مسجّل في تطبيق واتساب)، وانسخ Phone number ID و WhatsApp Business Account ID.',
      'من إعدادات الأعمال ← System users أنشئ مستخدماً وولّد رمز وصول دائماً بصلاحية whatsapp_business_messaging.',
      'من Message templates أنشئ قالباً عربياً باسم erp_alert فيه متغيّر واحد {{1}}، وانتظر الموافقة.',
      'الصق القيم هنا وأرسل رسالة تجريبية إلى جوالك.',
    ],
    en: [
      'Verify the organisation in Meta Business Manager (business.facebook.com).',
      'At developers.facebook.com create a Business app and add WhatsApp to it.',
      'On API Setup add the sending number (one not registered in the WhatsApp app); copy the Phone number ID and WhatsApp Business Account ID.',
      'In Business settings → System users, create a user and generate a permanent token with whatsapp_business_messaging.',
      'Under Message templates, create an Arabic template named erp_alert with one variable {{1}}, and wait for approval.',
      'Paste the values here and send a test to your phone.',
    ],
  },
  click_to_chat: {
    ar: [
      'لا يحتاج أي تسجيل لدى Meta — مناسب للبدء فوراً.',
      'يظهر للموظف زر «إرسال عبر واتساب» بجانب التنبيه، يفتح المحادثة برسالة جاهزة فيضغط إرسال.',
      'الإرسال ليس تلقائياً، لذا يُفضّل الانتقال إلى الربط الرسمي لاحقاً.',
    ],
    en: [
      'No Meta registration needed — good for starting right away.',
      'Staff see a “Send on WhatsApp” button next to an alert that opens the chat with the message ready; they press send.',
      'Sending is not automatic, so moving to the official connection later is recommended.',
    ],
  },
  twilio: {
    ar: ['أنشئ حساب Twilio وفعّله للسودان من Messaging ← Geo permissions.', 'انسخ Account SID و Auth Token من لوحة التحكم.', 'اشترِ رقماً أو سجّل اسم مرسل (Sender ID)، ثم أرسل رسالة تجريبية.'],
    en: ['Create a Twilio account and allow Sudan under Messaging → Geo permissions.', 'Copy the Account SID and Auth Token from the console.', 'Buy a number or register a Sender ID, then send a test.'],
  },
  http: {
    ar: [
      'اتفق مع مزوّد رسائل محلي يدعم الإرسال عبر الإنترنت (API).',
      'سيعطيك رابط الإرسال ومفتاح الخدمة. سجّل اسم المرسل PHF-SUDAN لدى المزوّد؛ قد يستغرق ذلك أياماً لدى شركات الاتصال.',
      'أدخل الرابط والمفتاح واسم المرسل، ثم أرسل رسالة تجريبية.',
    ],
    en: [
      'Agree with a local SMS provider that offers an internet API.',
      'They give you a sending URL and an API key. Register the sender name PHF-SUDAN with them; operators can take days to approve.',
      'Enter the URL, key and sender name, then send a test.',
    ],
  },
}

function Secret({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input className={`${inputCls} pe-10`} dir="ltr" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="new-password" />
      <button type="button" className="absolute top-1/2 end-2 -translate-y-1/2 p-1 text-muted hover:text-ink" onClick={() => setShow((x) => !x)} aria-label={show ? 'hide' : 'show'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-2 text-[13.5px]">
      <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-leaf" />
      <span className="absolute start-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      <span className={on ? 'font-medium text-leaf' : 'text-muted'}>{label}</span>
    </label>
  )
}

function Guide({ steps, title }: { steps: string[]; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-line">
      <button className="flex w-full items-center justify-between px-4 py-2.5 text-[13.5px] font-medium" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        {title}
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="space-y-2 border-t border-line px-4 py-3 text-[13.5px]">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-nile text-[11px] text-white">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function Channels() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const me = useUser()
  const [d, setD] = useState<ChannelConfig>(structuredClone(s.channels))
  const [to, setTo] = useState<Record<Channel, string>>({ email: me.email ?? '', whatsapp: me.phone ?? '', sms: me.phone ?? '' })
  const strip = (c: ChannelConfig) => JSON.stringify({ ...c, email: { ...c.email, lastTest: 0 }, whatsapp: { ...c.whatsapp, lastTest: 0 }, sms: { ...c.sms, lastTest: 0 } })
  const dirty = strip(d) !== strip(s.channels)
  const save = () => {
    s.setChannels(structuredClone(d))
    s.toast({ ar: 'حُفظت إعدادات القنوات', en: 'Channel settings saved' })
  }
  // Tests the settings as typed (saved or not); the result is kept with the channel.
  const test = (ch: Channel) => {
    const lastTest = s.runChannelTest(ch, to[ch], d)
    setD((x) => ({ ...x, [ch]: { ...x[ch], lastTest } }))
  }
  const E = d.email
  const W = d.whatsapp
  const S = d.sms
  const setE = (p: Partial<ChannelConfig['email']>) => setD({ ...d, email: { ...E, ...p } })
  const setW = (p: Partial<ChannelConfig['whatsapp']>) => setD({ ...d, whatsapp: { ...W, ...p } })
  const setS = (p: Partial<ChannelConfig['sms']>) => setD({ ...d, sms: { ...S, ...p } })

  const status = (ch: Channel) => {
    const c = s.channels[ch]
    if (!c.enabled) return <span className="rounded bg-paper px-2 py-0.5 text-[12px] text-muted ring-1 ring-line">{ar ? 'غير مفعّلة' : 'Off'}</span>
    if (!c.lastTest) return <span className="rounded bg-amber-soft px-2 py-0.5 text-[12px] text-amber">{ar ? 'مفعّلة — لم تُختبر' : 'On — not tested'}</span>
    return c.lastTest.ok ? (
      <span className="rounded bg-leaf-soft px-2 py-0.5 text-[12px] text-leaf">{ar ? 'تعمل' : 'Working'}</span>
    ) : (
      <span className="rounded bg-crescent-soft px-2 py-0.5 text-[12px] text-crescent">{ar ? 'فشل آخر اختبار' : 'Last test failed'}</span>
    )
  }

  const testRow = (ch: Channel, placeholder: string) => {
    const lt = d[ch].lastTest
    return (
      <div className="rounded-md bg-paper p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-52 flex-1 text-[13px]">
            {ar ? 'أرسل رسالة تجريبية إلى' : 'Send a test message to'}
            <input className={`${inputCls} mt-1 bg-surface`} dir="ltr" value={to[ch]} onChange={(e) => setTo({ ...to, [ch]: e.target.value })} placeholder={placeholder} />
          </label>
          <Button variant="quiet" className="bg-surface" onClick={() => test(ch)}>
            <Send size={15} /> {ar ? 'إرسال تجريبي' : 'Send test'}
          </Button>
        </div>
        {lt && (
          <p className={`mt-2 flex items-start gap-1.5 text-[13px] ${lt.ok ? 'text-leaf' : 'text-crescent'}`}>
            {lt.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <XCircle size={15} className="mt-0.5 shrink-0" />}
            <span>
              {lt.message[lang]} <span className="num text-muted">— {date(lt.at, lang)}</span>
            </span>
          </p>
        )}
      </div>
    )
  }

  const section = (ch: Channel, icon: ReactNode, title: string, desc: string, enabled: boolean, setEnabled: (v: boolean) => void, body: ReactNode) => (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid size-10 place-items-center rounded-md bg-nile-soft text-nile">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16.5px] font-semibold">{title}</h2>
            {status(ch)}
          </div>
          <p className="text-[13px] text-muted">{desc}</p>
        </div>
        <Toggle on={enabled} onChange={setEnabled} label={enabled ? (ar ? 'مفعّلة' : 'On') : ar ? 'متوقفة' : 'Off'} />
      </div>
      <div className={`space-y-4 p-5 ${enabled ? '' : 'opacity-60'}`}>{body}</div>
    </Panel>
  )

  return (
    <div className="pb-20">
      <PageHeader
        title={ar ? 'البريد وواتساب والرسائل النصية' : 'Email, WhatsApp & SMS'}
        sub={
          ar
            ? 'نافذة واحدة يضبط منها قسم تقنية المعلومات قنوات إرسال التنبيهات والتقارير. فعّل ما تحتاجه فقط، واختبر كل قناة قبل الاعتماد عليها.'
            : 'One place for IT to set up the channels that carry alerts and reports. Turn on only what you need, and test each one before relying on it.'
        }
      />
      <p className="mb-5 flex items-center gap-2 rounded-md bg-paper px-4 py-2.5 text-[13px] text-muted ring-1 ring-line">
        <Lock size={15} /> {ar ? 'كلمات المرور والرموز تُحفظ مشفّرة على الخادم ولا تظهر لأي مستخدم بعد الحفظ.' : 'Passwords and tokens are stored encrypted on the server and are never shown to users after saving.'}
      </p>

      <div className="space-y-6">
        {section(
          'email',
          <Mail size={20} />,
          ar ? 'البريد الإلكتروني' : 'Email',
          ar ? 'للتنبيهات الرسمية وإرسال التقرير الشهري إلى المقر بصيغة PDF.' : 'For formal alerts and sending the monthly report to headquarters as a PDF.',
          E.enabled,
          (v) => setE({ enabled: v }),
          <>
            <div>
              <div className="mb-1.5 text-[13.5px] font-medium">{ar ? 'مزوّد البريد' : 'Email provider'}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(emailPresets) as (keyof typeof emailPresets)[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setE({ provider: k, host: emailPresets[k].host, port: emailPresets[k].port, security: emailPresets[k].security })}
                    className={`rounded-md border px-3 py-2.5 text-start text-[13.5px] ${E.provider === k ? 'border-nile bg-nile-soft text-nile' : 'border-line hover:border-nile-2'}`}
                    aria-pressed={E.provider === k}
                  >
                    {emailPresets[k].name[lang]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_110px_150px]">
              <Field label={ar ? 'خادم الإرسال (SMTP)' : 'Outgoing server (SMTP)'}>
                <input className={inputCls} dir="ltr" value={E.host} onChange={(e) => setE({ host: e.target.value.trim() })} placeholder="mail.kphfs.org" />
              </Field>
              <Field label={ar ? 'المنفذ' : 'Port'}>
                <input className={`${inputCls} num`} dir="ltr" type="number" value={E.port} onChange={(e) => setE({ port: +e.target.value })} />
              </Field>
              <Field label={ar ? 'التشفير' : 'Encryption'}>
                <select className={inputCls} value={E.security} onChange={(e) => setE({ security: e.target.value as ChannelConfig['email']['security'] })}>
                  <option value="starttls">STARTTLS</option>
                  <option value="ssl">SSL/TLS</option>
                  <option value="none">{ar ? 'بدون' : 'None'}</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={ar ? 'اسم المستخدم' : 'Username'} hint={emailPresets[E.provider].userHint[lang]}>
                <input className={inputCls} dir="ltr" value={E.username} onChange={(e) => setE({ username: e.target.value.trim() })} />
              </Field>
              <Field label={ar ? 'كلمة المرور' : 'Password'}>
                <Secret value={E.password} onChange={(v) => setE({ password: v })} />
              </Field>
              <Field label={ar ? 'اسم المرسل الظاهر' : 'Sender display name'}>
                <input className={inputCls} value={E.fromName} onChange={(e) => setE({ fromName: e.target.value })} />
              </Field>
              <Field label={ar ? 'بريد المرسل' : 'Sender address'}>
                <input className={inputCls} dir="ltr" value={E.fromAddress} onChange={(e) => setE({ fromAddress: e.target.value.trim() })} />
              </Field>
              <Field label={ar ? 'بريد الردود (اختياري)' : 'Reply-to (optional)'} hint={ar ? 'إلى أين تذهب الردود على رسائل النظام' : 'Where replies to system emails go'}>
                <input className={inputCls} dir="ltr" value={E.replyTo} onChange={(e) => setE({ replyTo: e.target.value.trim() })} />
              </Field>
            </div>
            {testRow('email', 'name@kphfs.org')}
            <Guide title={ar ? `خطوات الإعداد لقسم تقنية المعلومات — ${emailPresets[E.provider].name.ar}` : `Setup steps for IT — ${emailPresets[E.provider].name.en}`} steps={guides[E.provider][lang]} />
          </>,
        )}

        {section(
          'whatsapp',
          <MessageCircle size={20} />,
          ar ? 'واتساب' : 'WhatsApp',
          ar ? 'الأنسب للمكاتب الميدانية: التنبيهات العاجلة تصل إلى الجوال مباشرة.' : 'Best for field offices: urgent alerts reach the phone directly.',
          W.enabled,
          (v) => setW({ enabled: v }),
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['cloud_api', ar ? 'الربط الرسمي (WhatsApp Business API)' : 'Official connection (WhatsApp Business API)', ar ? 'إرسال تلقائي. يحتاج توثيق المؤسسة لدى Meta.' : 'Automatic sending. Needs the organisation verified with Meta.'],
                  ['click_to_chat', ar ? 'روابط واتساب (بدون ربط)' : 'WhatsApp links (no connection)', ar ? 'يعمل فوراً. الموظف يضغط إرسال بنفسه.' : 'Works right away. Staff press send themselves.'],
                ] as const
              ).map(([k, t, dsc]) => (
                <button key={k} onClick={() => setW({ mode: k })} className={`rounded-md border p-3 text-start ${W.mode === k ? 'border-nile bg-nile-soft' : 'border-line hover:border-nile-2'}`} aria-pressed={W.mode === k}>
                  <span className={`block text-[14px] font-medium ${W.mode === k ? 'text-nile' : ''}`}>{t}</span>
                  <span className="block text-[12.5px] text-muted">{dsc}</span>
                </button>
              ))}
            </div>
            {W.mode === 'cloud_api' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone number ID" hint={ar ? 'أرقام فقط، من صفحة API Setup' : 'Digits only, from API Setup'}>
                  <input className={`${inputCls} num`} dir="ltr" value={W.phoneNumberId} onChange={(e) => setW({ phoneNumberId: e.target.value.trim() })} placeholder="1098765432101234" />
                </Field>
                <Field label="WhatsApp Business Account ID">
                  <input className={`${inputCls} num`} dir="ltr" value={W.businessAccountId} onChange={(e) => setW({ businessAccountId: e.target.value.trim() })} />
                </Field>
                <Field label={ar ? 'رمز الوصول الدائم (Access token)' : 'Permanent access token'}>
                  <Secret value={W.accessToken} onChange={(v) => setW({ accessToken: v })} placeholder="EAAG…" />
                </Field>
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <Field label={ar ? 'اسم قالب الرسالة' : 'Message template name'}>
                    <input className={inputCls} dir="ltr" value={W.templateName} onChange={(e) => setW({ templateName: e.target.value.trim() })} />
                  </Field>
                  <Field label={ar ? 'اللغة' : 'Language'}>
                    <select className={inputCls} value={W.templateLanguage} onChange={(e) => setW({ templateLanguage: e.target.value as 'ar' | 'en' })}>
                      <option value="ar">ar</option>
                      <option value="en">en</option>
                    </select>
                  </Field>
                </div>
              </div>
            ) : (
              <Field label={ar ? 'رقم واتساب المؤسسة (للظهور في الرسائل)' : 'Organisation WhatsApp number (shown in messages)'}>
                <input className={`${inputCls} num`} dir="ltr" value={W.senderNumber} onChange={(e) => setW({ senderNumber: e.target.value })} placeholder="+249 9…" />
              </Field>
            )}
            {testRow('whatsapp', '+249 9…')}
            <Guide title={ar ? 'خطوات الإعداد لقسم تقنية المعلومات' : 'Setup steps for IT'} steps={guides[W.mode][lang]} />
          </>,
        )}

        {section(
          'sms',
          <MessageSquareText size={20} />,
          ar ? 'الرسائل النصية (SMS)' : 'Text messages (SMS)',
          ar ? 'تصل حتى دون إنترنت على الجوال — للتنبيهات العاجلة جداً فقط لتقليل التكلفة.' : 'Arrive even without mobile internet — use for the most urgent alerts only to keep costs down.',
          S.enabled,
          (v) => setS({ enabled: v }),
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['http', ar ? 'مزوّد رسائل محلي (API)' : 'Local SMS provider (API)'],
                  ['twilio', 'Twilio'],
                ] as const
              ).map(([k, t]) => (
                <button key={k} onClick={() => setS({ provider: k })} className={`rounded-md border px-3 py-2.5 text-start text-[14px] ${S.provider === k ? 'border-nile bg-nile-soft text-nile' : 'border-line hover:border-nile-2'}`} aria-pressed={S.provider === k}>
                  {t}
                </button>
              ))}
            </div>
            {S.provider === 'twilio' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Account SID">
                  <input className={`${inputCls} num`} dir="ltr" value={S.accountSid} onChange={(e) => setS({ accountSid: e.target.value.trim() })} placeholder="AC…" />
                </Field>
                <Field label="Auth token">
                  <Secret value={S.authToken} onChange={(v) => setS({ authToken: v })} />
                </Field>
                <Field label={ar ? 'رقم الإرسال' : 'Sending number'}>
                  <input className={`${inputCls} num`} dir="ltr" value={S.fromNumber} onChange={(e) => setS({ fromNumber: e.target.value })} placeholder="+1…" />
                </Field>
                <Field label={ar ? 'أو اسم المرسل' : 'Or sender name'}>
                  <input className={inputCls} dir="ltr" value={S.senderId} onChange={(e) => setS({ senderId: e.target.value })} />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={ar ? 'رابط الإرسال' : 'Sending URL'} hint={ar ? 'كما يعطيك المزوّد، يبدأ بـ https://' : 'As given by the provider, starting with https://'}>
                  <input className={inputCls} dir="ltr" value={S.apiUrl} onChange={(e) => setS({ apiUrl: e.target.value.trim() })} placeholder="https://api.provider.sd/v1/send" />
                </Field>
                <Field label={ar ? 'مفتاح الخدمة (API key)' : 'API key'}>
                  <Secret value={S.apiKey} onChange={(v) => setS({ apiKey: v })} />
                </Field>
                <Field label={ar ? 'اسم المرسل (Sender ID)' : 'Sender ID'} hint={ar ? 'حتى 11 حرفاً إنجليزياً' : 'Up to 11 Latin characters'}>
                  <input className={inputCls} dir="ltr" maxLength={11} value={S.senderId} onChange={(e) => setS({ senderId: e.target.value })} />
                </Field>
              </div>
            )}
            {testRow('sms', '+249 9…')}
            <Guide title={ar ? 'خطوات الإعداد لقسم تقنية المعلومات' : 'Setup steps for IT'} steps={guides[S.provider][lang]} />
          </>,
        )}
      </div>

      <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur transition-transform lg:start-[264px] ${dirty ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <span className="text-[13.5px] text-muted">{ar ? 'لديك تغييرات غير محفوظة' : 'You have unsaved changes'}</span>
          <Button variant="quiet" onClick={() => setD(structuredClone(s.channels))}>
            {ar ? 'تراجع' : 'Discard'}
          </Button>
          <Button onClick={save}>{ar ? 'حفظ الإعدادات' : 'Save settings'}</Button>
        </div>
      </div>
    </div>
  )
}
