import type { AppNotification, Bi, Channel, ChannelConfig, Delivery, NotifEvent, NotifRule, User } from '../data/types'
import { findLine, lineUsage } from './budget'
import { closingPeriod } from './ledger'
import type { useStore } from './store'

type S = ReturnType<typeof useStore.getState>

export const eventInfo: Record<NotifEvent, { name: Bi; desc: Bi; unit?: Bi; concerned: Bi }> = {
  approval_waiting: {
    name: { ar: 'طلب وصل إلى دورك في الاعتماد', en: 'A request reaches your approval step' },
    desc: { ar: 'فور وصول طلب صرف أو مناقلة إلى خطوة المعتمد.', en: 'As soon as a spend or reallocation request reaches the approver’s step.' },
    concerned: { ar: 'المعتمد في الخطوة الحالية', en: 'The approver at the current step' },
  },
  request_stale: {
    name: { ar: 'طلب متوقف عند معتمد', en: 'Request stuck with an approver' },
    desc: { ar: 'إذا بقي الطلب عند الخطوة نفسها أكثر من عدد الساعات المحدد.', en: 'When a request waits at the same step longer than the set hours.' },
    unit: { ar: 'ساعة', en: 'hours' },
    concerned: { ar: 'المعتمد المتأخر', en: 'The approver it waits on' },
  },
  request_decided: {
    name: { ar: 'اعتماد أو رفض طلبك', en: 'Your request is approved or rejected' },
    desc: { ar: 'يُبلّغ مقدم الطلب عند اكتمال الاعتماد أو الرفض أو الصرف.', en: 'Tells the requester when it is fully approved, rejected or paid.' },
    concerned: { ar: 'مقدّم الطلب', en: 'The requester' },
  },
  deadline_near: {
    name: { ar: 'اقتراب موعد تسليم تقرير', en: 'A report deadline is coming' },
    desc: { ar: 'قبل الموعد بعدد الأيام المحدد في كل موعد (من تقويم المواعيد).', en: 'The number of days before set on each deadline (in the calendar).' },
    concerned: { ar: 'المسؤول عن الموعد', en: 'The deadline owner' },
  },
  deadline_overdue: {
    name: { ar: 'تجاوز موعد تسليم', en: 'A deadline is missed' },
    desc: { ar: 'عند مرور الموعد دون تعليمه كمنجز.', en: 'When the date passes without being marked done.' },
    concerned: { ar: 'المسؤول عن الموعد', en: 'The deadline owner' },
  },
  advance_overdue: {
    name: { ar: 'عهدة تجاوزت موعد التسوية', en: 'Advance past its settlement date' },
    desc: { ar: 'عهدة مفتوحة تجاوزت تاريخ التسوية.', en: 'An open advance past its settle-by date.' },
    concerned: { ar: 'الموظف المستلم للعهدة', en: 'The staff member holding it' },
  },
  report_overdue: {
    name: { ar: 'تقرير فني متأخر', en: 'Field report overdue' },
    desc: { ar: 'نشاط مرّ على تنفيذه عدد الأيام المحدد دون تقرير فني.', en: 'An activity with no field report after the set number of days.' },
    unit: { ar: 'يوم', en: 'days' },
    concerned: { ar: 'فريق المكتب المنفذ', en: 'The office team' },
  },
  line_threshold: {
    name: { ar: 'بند ميزانية قارب سقفه', en: 'Budget line near its ceiling' },
    desc: { ar: 'عندما تتجاوز نسبة استهلاك البند الحد المحدد.', en: 'When a line’s use passes the set percentage.' },
    unit: { ar: '٪ من السقف', en: '% of ceiling' },
    concerned: { ar: 'مدير المشروع', en: 'The project lead' },
  },
  spend_no_report: {
    name: { ar: 'صرف بلا تقرير فني', en: 'Spending with no field report' },
    desc: { ar: 'مصروف مضى عليه عدد الأيام المحدد ولم يُربط بتقرير.', en: 'An expense older than the set days with no linked report.' },
    unit: { ar: 'يوم', en: 'days' },
    concerned: { ar: 'فريق المكتب', en: 'The office team' },
  },
  month_close: {
    name: { ar: 'الإقفال الشهري لم يكتمل', en: 'Monthly close not finished' },
    desc: { ar: 'إذا لم يُقفل مكتب الشهر السابق حتى اليوم المحدد من الشهر.', en: 'If an office hasn’t closed last month by the set day.' },
    unit: { ar: 'من الشهر', en: 'of the month' },
    concerned: { ar: 'مسؤول المكتب', en: 'The office manager' },
  },
  low_stock: {
    name: { ar: 'مخزون صنف تحت الحد الأدنى', en: 'Stock below minimum' },
    desc: { ar: 'عندما ينخفض رصيد صنف في مخزن عن حده الأدنى.', en: 'When an item’s stock in a store falls below its minimum.' },
    concerned: { ar: 'أمين المخزن', en: 'The storekeeper' },
  },
}

export const defaultRules: NotifRule[] = [
  { id: 'n1', event: 'approval_waiting', name: eventInfo.approval_waiting.name, recipients: { concerned: true, roles: [], users: [] }, channels: { inapp: true, email: true, whatsapp: true, sms: false }, enabled: true },
  { id: 'n2', event: 'request_stale', name: eventInfo.request_stale.name, threshold: 48, recipients: { concerned: true, roles: ['finance_manager'], users: [] }, channels: { inapp: true, email: true, whatsapp: false, sms: false }, enabled: true },
  { id: 'n3', event: 'request_decided', name: eventInfo.request_decided.name, recipients: { concerned: true, roles: [], users: [] }, channels: { inapp: true, email: false, whatsapp: true, sms: false }, enabled: true },
  { id: 'n4', event: 'deadline_near', name: eventInfo.deadline_near.name, recipients: { concerned: true, roles: ['finance_manager'], users: [] }, channels: { inapp: true, email: true, whatsapp: false, sms: false }, enabled: true },
  { id: 'n5', event: 'deadline_overdue', name: eventInfo.deadline_overdue.name, recipients: { concerned: true, roles: ['executive_director'], users: [] }, channels: { inapp: true, email: true, whatsapp: false, sms: true }, enabled: true },
  { id: 'n6', event: 'advance_overdue', name: eventInfo.advance_overdue.name, recipients: { concerned: true, roles: ['finance_manager', 'accountant'], users: [] }, channels: { inapp: true, email: false, whatsapp: false, sms: true }, enabled: true },
  { id: 'n7', event: 'report_overdue', name: eventInfo.report_overdue.name, threshold: 5, recipients: { concerned: true, roles: ['supervisor'], users: [] }, channels: { inapp: true, email: false, whatsapp: true, sms: false }, enabled: true },
  { id: 'n8', event: 'line_threshold', name: eventInfo.line_threshold.name, threshold: 85, recipients: { concerned: false, roles: ['finance_manager', 'executive_director'], users: [] }, channels: { inapp: true, email: true, whatsapp: false, sms: false }, enabled: true },
  { id: 'n9', event: 'spend_no_report', name: eventInfo.spend_no_report.name, threshold: 10, recipients: { concerned: true, roles: ['accountant'], users: [] }, channels: { inapp: true, email: false, whatsapp: false, sms: false }, enabled: true },
  { id: 'n10', event: 'month_close', name: eventInfo.month_close.name, threshold: 5, recipients: { concerned: false, roles: ['finance_manager'], users: [] }, channels: { inapp: true, email: true, whatsapp: false, sms: false }, enabled: true },
  { id: 'n11', event: 'low_stock', name: eventInfo.low_stock.name, recipients: { concerned: true, roles: ['logistics_officer'], users: [] }, channels: { inapp: true, email: false, whatsapp: true, sms: false }, enabled: true },
]

export const defaultChannels: ChannelConfig = {
  email: {
    enabled: true,
    provider: 'microsoft365',
    host: 'smtp.office365.com',
    port: 587,
    security: 'starttls',
    username: 'notifications@kphfs.org',
    password: '••••••••••••',
    fromName: 'نظام إدارة الموارد — صندوق إعانة المرضى',
    fromAddress: 'notifications@kphfs.org',
    replyTo: 'finance@kphfs.org',
    lastTest: { at: new Date(Date.now() - 6 * 86_400_000).toISOString(), ok: true, message: { ar: 'أُرسلت رسالة تجريبية بنجاح', en: 'Test message sent successfully' } },
  },
  whatsapp: {
    enabled: false,
    mode: 'cloud_api',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    senderNumber: '',
    templateName: 'erp_alert',
    templateLanguage: 'ar',
  },
  sms: { enabled: false, provider: 'http', accountSid: '', authToken: '', fromNumber: '', apiUrl: '', apiKey: '', senderId: 'PHF-SUDAN' },
}

interface Candidate {
  key: string
  event: NotifEvent
  severity: AppNotification['severity']
  title: Bi
  body: Bi
  link: string
  concerned: string[] // user ids the event is about
  officeId?: string
}

const DAY = 86_400_000
const days = (iso: string) => Math.floor((Date.now() - +new Date(iso)) / DAY)

function usersForRole(s: S, role: string, officeId?: string) {
  const r = s.roles.find((x) => x.id === role)
  return s.users.filter((u) => u.active !== false && u.role === role && (!officeId || r?.scope !== 'office' || u.officeId === officeId)).map((u) => u.id)
}
const officeTeam = (s: S, officeId: string) =>
  s.users.filter((u) => u.active !== false && u.officeId === officeId && ['field_officer', 'supervisor'].includes(u.role)).map((u) => u.id)

function candidates(s: S, rule: NotifRule): Candidate[] {
  const out: Candidate[] = []
  const office = (id?: string) => s.offices.find((o) => o.id === id)?.name ?? { ar: '', en: '' }
  switch (rule.event) {
    case 'approval_waiting':
    case 'request_stale': {
      const stale = rule.event === 'request_stale'
      for (const r of s.requests) {
        if (r.status !== 'pending') continue
        const i = r.steps.findIndex((x) => x.status === 'pending')
        if (i < 0) continue
        const since = i > 0 ? r.steps[i - 1].at ?? r.createdAt : r.createdAt
        if (stale && (Date.now() - +new Date(since)) / 3_600_000 < (rule.threshold ?? 48)) continue
        out.push({
          key: `${rule.event}:${r.id}:${i}`,
          event: rule.event,
          severity: stale ? 'warn' : 'info',
          title: stale ? { ar: `الطلب ${r.code} متوقف منذ ${days(since)} يوم`, en: `${r.code} waiting for ${days(since)} days` } : { ar: `طلب بانتظار اعتمادك: ${r.code}`, en: `Waiting for your approval: ${r.code}` },
          body: { ar: `${r.purpose.ar} — ${office(r.officeId).ar}`, en: `${r.purpose.en} — ${office(r.officeId).en}` },
          link: `/requests/${r.id}`,
          concerned: usersForRole(s, r.steps[i].role, r.officeId),
          officeId: r.officeId,
        })
      }
      if (!stale)
        for (const r of s.reallocations) {
          if (r.status !== 'pending') continue
          const i = r.steps.findIndex((x) => x.status === 'pending')
          out.push({
            key: `${rule.event}:${r.id}:${i}`,
            event: rule.event,
            severity: 'info',
            title: { ar: `مناقلة بانتظار اعتمادك: ${r.code}`, en: `Reallocation waiting for you: ${r.code}` },
            body: r.reason,
            link: '/approvals',
            concerned: usersForRole(s, r.steps[i].role),
          })
        }
      break
    }
    case 'request_decided':
      for (const r of s.requests) {
        if (r.status === 'pending') continue
        if (days(r.steps.at(-1)?.at ?? r.createdAt) > 2) continue // only recent decisions
        const t =
          r.status === 'rejected'
            ? { ar: `رُفض طلبك ${r.code}`, en: `Your request ${r.code} was rejected` }
            : r.status === 'paid'
              ? { ar: `صُرف طلبك ${r.code}`, en: `Your request ${r.code} was paid` }
              : { ar: `اعتُمد طلبك ${r.code}`, en: `Your request ${r.code} was approved` }
        out.push({ key: `${rule.event}:${r.id}:${r.status}`, event: rule.event, severity: r.status === 'rejected' ? 'warn' : 'info', title: t, body: r.purpose, link: `/requests/${r.id}`, concerned: [r.requesterId], officeId: r.officeId })
      }
      break
    case 'deadline_near':
    case 'deadline_overdue':
      for (const d of s.deadlines) {
        if (d.done) continue
        const left = Math.ceil((+new Date(d.due) - Date.now()) / DAY)
        const over = rule.event === 'deadline_overdue'
        if (over ? left >= 0 : left < 0 || left > d.notifyDaysBefore) continue
        out.push({
          key: `${rule.event}:${d.id}:${d.due.slice(0, 10)}`,
          event: rule.event,
          severity: over ? 'critical' : left <= 2 ? 'warn' : 'info',
          title: over ? { ar: `تجاوز الموعد: ${d.title.ar}`, en: `Missed: ${d.title.en}` } : { ar: `موعد قريب: ${d.title.ar}`, en: `Coming up: ${d.title.en}` },
          body: over
            ? { ar: `كان الموعد قبل ${-left} يوم`, en: `It was due ${-left} days ago` }
            : { ar: left === 0 ? 'الموعد اليوم' : `يتبقى ${left} يوم`, en: left === 0 ? 'Due today' : `${left} days left` },
          link: '/alerts/calendar',
          concerned: usersForRole(s, d.owner),
        })
      }
      break
    case 'advance_overdue':
      for (const a of s.advances) {
        if (a.status !== 'open' || +new Date(a.dueAt) > Date.now()) continue
        const holder = s.users.find((u) => u.officeId === a.officeId && u.role === 'field_officer')
        out.push({
          key: `${rule.event}:${a.id}`,
          event: rule.event,
          severity: 'critical',
          title: { ar: `عهدة متأخرة: ${a.no}`, en: `Overdue advance: ${a.no}` },
          body: { ar: `${office(a.officeId).ar} — تجاوزت موعد التسوية بـ ${days(a.dueAt)} يوم`, en: `${office(a.officeId).en} — ${days(a.dueAt)} days past settlement date` },
          link: '/finance/advances',
          concerned: holder ? [holder.id] : [],
          officeId: a.officeId,
        })
      }
      break
    case 'report_overdue':
      for (const a of s.activities) {
        if (a.report || days(a.date) < (rule.threshold ?? 5)) continue
        out.push({
          key: `${rule.event}:${a.id}`,
          event: rule.event,
          severity: 'warn',
          title: { ar: `تقرير فني متأخر: ${a.code}`, en: `Field report overdue: ${a.code}` },
          body: { ar: `${a.title.ar} — منذ ${days(a.date)} يوم`, en: `${a.title.en} — ${days(a.date)} days ago` },
          link: `/activities/${a.id}`,
          concerned: officeTeam(s, a.officeId),
          officeId: a.officeId,
        })
      }
      break
    case 'line_threshold':
      for (const p of s.projects)
        for (const pl of p.pillars)
          for (const l of pl.lines) {
            const u = lineUsage(l, s)
            const used = u.ceiling ? (u.ceiling - u.available) / u.ceiling : 0
            if (used * 100 < (rule.threshold ?? 85)) continue
            out.push({
              key: `${rule.event}:${l.id}:${rule.threshold}`,
              event: rule.event,
              severity: used >= 1 ? 'critical' : 'warn',
              title: { ar: `البند ${l.code} بلغ ${Math.round(used * 100)}٪ من سقفه`, en: `Line ${l.code} at ${Math.round(used * 100)}% of its ceiling` },
              body: { ar: `${p.code} — ${l.name.ar}`, en: `${p.code} — ${l.name.en}` },
              link: `/projects/${p.id}`,
              concerned: [],
            })
          }
      break
    case 'spend_no_report':
      for (const e of s.expenses) {
        if (e.hasTechReport || days(e.date) < (rule.threshold ?? 10)) continue
        const f = findLine(s.projects, e.lineId)
        out.push({
          key: `${rule.event}:${e.id}`,
          event: rule.event,
          severity: 'warn',
          title: { ar: `صرف بلا تقرير فني منذ ${days(e.date)} يوم`, en: `Spending without a report for ${days(e.date)} days` },
          body: { ar: `${office(e.officeId).ar} — ${f?.line.code} ${f?.line.name.ar}`, en: `${office(e.officeId).en} — ${f?.line.code} ${f?.line.name.en}` },
          link: '/reconciliation',
          concerned: officeTeam(s, e.officeId),
          officeId: e.officeId,
        })
      }
      break
    case 'month_close': {
      if (new Date().getDate() < (rule.threshold ?? 5)) break
      const { start } = closingPeriod()
      const open = s.closes.filter((c) => !c.closedAt)
      if (!open.length) break
      out.push({
        key: `${rule.event}:${start.slice(0, 7)}:${open.length}`,
        event: rule.event,
        severity: 'warn',
        title: { ar: `${open.length} مكاتب لم تُقفل الشهر السابق`, en: `${open.length} offices haven’t closed last month` },
        body: { ar: open.map((c) => office(c.officeId).ar).join('، '), en: open.map((c) => office(c.officeId).en).join(', ') },
        link: '/finance/close',
        concerned: [],
      })
      break
    }
    case 'low_stock': {
      const x = s as unknown as { stock?: { itemId: string; officeId: string; qty: number }[]; items?: { id: string; name: Bi; min: number }[] }
      if (!x.stock || !x.items) break
      for (const st of x.stock) {
        const it = x.items.find((i) => i.id === st.itemId)
        if (!it || st.qty >= it.min) continue
        out.push({
          key: `${rule.event}:${st.itemId}:${st.officeId}:${st.qty}`,
          event: rule.event,
          severity: st.qty === 0 ? 'critical' : 'warn',
          title: { ar: `${it.name.ar} تحت الحد الأدنى`, en: `${it.name.en} below minimum` },
          body: { ar: `${office(st.officeId).ar} — الرصيد ${st.qty} والحد الأدنى ${it.min}`, en: `${office(st.officeId).en} — ${st.qty} in stock, minimum ${it.min}` },
          link: '/supply',
          concerned: s.users.filter((u) => u.role === 'storekeeper' && u.active !== false).map((u) => u.id),
          officeId: st.officeId,
        })
      }
      break
    }
  }
  return out
}

function channelReady(cfg: ChannelConfig, ch: Channel): Bi | null {
  if (ch === 'email') {
    const c = cfg.email
    if (!c.enabled) return { ar: 'البريد غير مفعّل في الإعدادات', en: 'Email is turned off in settings' }
    if (!c.host || !c.fromAddress) return { ar: 'إعدادات البريد ناقصة', en: 'Email settings are incomplete' }
  }
  if (ch === 'whatsapp') {
    const c = cfg.whatsapp
    if (!c.enabled) return { ar: 'واتساب غير مفعّل في الإعدادات', en: 'WhatsApp is turned off in settings' }
    if (c.mode === 'cloud_api' && (!c.phoneNumberId || !c.accessToken)) return { ar: 'إعدادات واتساب ناقصة', en: 'WhatsApp settings are incomplete' }
  }
  if (ch === 'sms') {
    const c = cfg.sms
    if (!c.enabled) return { ar: 'الرسائل النصية غير مفعّلة في الإعدادات', en: 'SMS is turned off in settings' }
    if (c.provider === 'twilio' ? !c.accountSid || !c.authToken : !c.apiUrl) return { ar: 'إعدادات الرسائل ناقصة', en: 'SMS settings are incomplete' }
  }
  return null
}

/** Evaluates every enabled rule against the current data and returns only what is new. */
export function runEngine(s: S): { notifications: AppNotification[]; deliveries: Delivery[] } {
  const known = new Set(s.notifications.map((n) => n.key))
  const notifications: AppNotification[] = []
  const deliveries: Delivery[] = []
  const now = new Date().toISOString()
  for (const rule of s.notifRules) {
    if (!rule.enabled) continue
    for (const c of candidates(s, rule)) {
      if (known.has(c.key)) continue
      known.add(c.key)
      const ids = new Set<string>()
      if (rule.recipients.concerned) c.concerned.forEach((u) => ids.add(u))
      rule.recipients.roles.forEach((r) => usersForRole(s, r, c.officeId).forEach((u) => ids.add(u)))
      rule.recipients.users.forEach((u) => ids.add(u))
      const recipients = [...ids].map((id) => s.users.find((u) => u.id === id)).filter((u): u is User => !!u && u.active !== false)
      if (!recipients.length) continue
      const n: AppNotification = {
        id: `nt-${Date.now().toString(36)}-${notifications.length}`,
        key: c.key,
        ruleId: rule.id,
        event: c.event,
        severity: c.severity,
        title: c.title,
        body: c.body,
        link: c.link,
        createdAt: now,
        userIds: recipients.map((u) => u.id),
        readBy: [],
      }
      if (rule.channels.inapp) notifications.push(n)
      for (const ch of ['email', 'whatsapp', 'sms'] as Channel[]) {
        if (!rule.channels[ch]) continue
        const notReady = channelReady(s.channels, ch)
        for (const u of recipients) {
          const to = ch === 'email' ? u.email : u.phone
          deliveries.push({
            id: `dl-${Date.now().toString(36)}-${deliveries.length}`,
            at: now,
            notificationId: n.id,
            channel: ch,
            to: to ?? '—',
            toName: u.name,
            subject: c.title.ar,
            status: notReady ? 'skipped' : to ? 'sent' : 'failed',
            reason: notReady ?? (to ? undefined : { ar: ch === 'email' ? 'لا يوجد بريد للمستخدم' : 'لا يوجد رقم جوال للمستخدم', en: ch === 'email' ? 'User has no email' : 'User has no mobile number' }),
          })
        }
      }
    }
  }
  return { notifications, deliveries }
}

/** Simulated connection test with the checks a real server would do first. */
export function testChannel(cfg: ChannelConfig, ch: Channel, to: string): { ok: boolean; message: Bi } {
  const fail = (ar: string, en: string) => ({ ok: false, message: { ar, en } })
  if (ch === 'email') {
    const c = cfg.email
    if (!c.host) return fail('أدخل عنوان خادم البريد (SMTP).', 'Enter the mail server (SMTP) address.')
    if (!c.port || c.port < 1 || c.port > 65535) return fail('رقم المنفذ غير صحيح.', 'The port number is not valid.')
    if (c.security === 'ssl' && c.port === 587) return fail('المنفذ 587 يعمل مع STARTTLS وليس SSL. غيّر الأمان إلى STARTTLS أو المنفذ إلى 465.', 'Port 587 uses STARTTLS, not SSL. Switch security to STARTTLS or the port to 465.')
    if (!c.username || !c.password) return fail('أدخل اسم المستخدم وكلمة المرور.', 'Enter the username and password.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.fromAddress)) return fail('عنوان المرسل غير صحيح.', 'The sender address is not valid.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail('أدخل بريداً صحيحاً لاستلام الرسالة التجريبية.', 'Enter a valid email to receive the test.')
    return { ok: true, message: { ar: `اتصل بالخادم ${c.host} وأُرسلت رسالة تجريبية إلى ${to}`, en: `Connected to ${c.host} and sent a test message to ${to}` } }
  }
  const phone = /^\+?\d[\d\s-]{7,}$/
  if (ch === 'whatsapp') {
    const c = cfg.whatsapp
    if (c.mode === 'cloud_api') {
      if (!/^\d{10,20}$/.test(c.phoneNumberId)) return fail('معرّف رقم الهاتف (Phone number ID) يتكون من أرقام فقط، وتجده في Meta ← WhatsApp ← API Setup.', 'The Phone number ID is digits only; find it in Meta → WhatsApp → API Setup.')
      if (c.accessToken.length < 20) return fail('رمز الوصول (Access token) غير صحيح أو ناقص.', 'The access token is missing or too short.')
      if (!c.templateName) return fail('أدخل اسم قالب الرسالة المعتمد من Meta.', 'Enter the message template name approved by Meta.')
    } else if (!phone.test(c.senderNumber)) return fail('أدخل رقم واتساب المرسل بصيغة دولية.', 'Enter the sender WhatsApp number in international format.')
    if (!phone.test(to)) return fail('أدخل رقم جوال صحيحاً بصيغة دولية (مثل +249…).', 'Enter a valid mobile number in international format (e.g. +249…).')
    return { ok: true, message: { ar: `أُرسلت رسالة واتساب تجريبية إلى ${to}`, en: `Test WhatsApp message sent to ${to}` } }
  }
  const c = cfg.sms
  if (c.provider === 'twilio') {
    if (!/^AC[0-9a-fA-F]{32}$/.test(c.accountSid)) return fail('Account SID يبدأ بـ AC ويتكون من 34 حرفاً.', 'The Account SID starts with AC and is 34 characters.')
    if (c.authToken.length < 20) return fail('Auth token غير صحيح.', 'The auth token is not valid.')
    if (!phone.test(c.fromNumber) && !c.senderId) return fail('أدخل رقم الإرسال أو اسم المرسل.', 'Enter a sending number or sender name.')
  } else {
    if (!/^https:\/\/\S+/.test(c.apiUrl)) return fail('رابط الخدمة يجب أن يبدأ بـ https://', 'The service URL must start with https://')
    if (!c.apiKey) return fail('أدخل مفتاح الخدمة (API key).', 'Enter the API key.')
  }
  if (!phone.test(to)) return fail('أدخل رقم جوال صحيحاً بصيغة دولية.', 'Enter a valid mobile number in international format.')
  return { ok: true, message: { ar: `أُرسلت رسالة نصية تجريبية إلى ${to}`, en: `Test SMS sent to ${to}` } }
}
