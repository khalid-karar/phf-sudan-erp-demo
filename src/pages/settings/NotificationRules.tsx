import { AlertTriangle, Bell, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, inputCls, Modal, PageHeader, Panel } from '../../components/ui'
import type { Channel, NotifEvent, NotifRule } from '../../data/types'
import { date } from '../../lib/format'
import { useLang } from '../../lib/i18n'
import { eventInfo } from '../../lib/notify'
import { useStore } from '../../lib/store'
import { channelIcon, channelName } from '../alerts/Inbox'

const chans: Channel[] = ['email', 'whatsapp', 'sms']

export function NotificationRules() {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [tab, setTab] = useState<'rules' | 'log'>('rules')
  const [edit, setEdit] = useState<NotifRule | null>(null)
  const roleName = (id: string) => s.roles.find((r) => r.id === id)?.name[lang] ?? id
  const notReady = chans.filter((c) => !s.channels[c].enabled)

  return (
    <div>
      <PageHeader
        title={ar ? 'قواعد التنبيهات' : 'Notification rules'}
        sub={
          ar
            ? 'حدد متى يُنبَّه من، وعبر أي قناة. كل قاعدة تراقب حالة معينة في النظام وترسل التنبيه مرة واحدة لكل حالة جديدة.'
            : 'Choose when to alert whom, and through which channel. Each rule watches one situation and alerts once per new case.'
        }
        actions={
          <Button onClick={() => setEdit({ id: '', event: 'deadline_near', name: eventInfo.deadline_near.name, recipients: { concerned: true, roles: [], users: [] }, channels: { inapp: true, email: true, whatsapp: false, sms: false }, enabled: true })}>
            <Plus size={16} /> {ar ? 'قاعدة جديدة' : 'New rule'}
          </Button>
        }
      />
      {notReady.length > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-amber-soft px-4 py-2.5 text-[13.5px] text-amber">
          <AlertTriangle size={16} />
          {ar ? `قنوات غير مفعّلة: ${notReady.map((c) => channelName[c].ar).join('، ')}. التنبيهات عبرها لن تُرسل.` : `Channels turned off: ${notReady.map((c) => channelName[c].en).join(', ')}. Alerts through them won’t send.`}
          <Link to="/settings/channels" className="font-medium underline">
            {ar ? 'إعداد القنوات' : 'Set up channels'}
          </Link>
        </p>
      )}
      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ['rules', ar ? 'القواعد' : 'Rules'],
            ['log', ar ? 'سجل الإرسال' : 'Delivery log'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium ${tab === k ? 'border-nile text-nile' : 'border-transparent text-muted hover:text-ink'}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'rules' ? (
        <Panel>
          <ul className="divide-y divide-line">
            {s.notifRules.map((r) => {
              const info = eventInfo[r.event]
              return (
                <li key={r.id} className={`flex flex-wrap items-center gap-4 px-5 py-3.5 ${r.enabled ? '' : 'opacity-60'}`}>
                  <label className="relative inline-flex cursor-pointer items-center" title={r.enabled ? (ar ? 'إيقاف' : 'Turn off') : ar ? 'تشغيل' : 'Turn on'}>
                    <input type="checkbox" className="peer sr-only" checked={r.enabled} onChange={(e) => s.saveNotifRule({ ...r, enabled: e.target.checked })} />
                    <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-leaf" />
                    <span className="absolute start-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.name[lang]}</div>
                    <div className="text-[12.5px] text-muted">
                      {info.desc[lang]}
                      {r.threshold !== undefined && info.unit && (
                        <b className="num text-ink">
                          {' '}
                          ({r.threshold} {info.unit[lang]})
                        </b>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
                      {r.recipients.concerned && <span className="rounded bg-nile-soft px-1.5 py-0.5 text-nile">{info.concerned[lang]}</span>}
                      {r.recipients.roles.map((x) => (
                        <span key={x} className="rounded bg-paper px-1.5 py-0.5 ring-1 ring-line">
                          {roleName(x)}
                        </span>
                      ))}
                      {r.recipients.users.map((x) => (
                        <span key={x} className="rounded bg-paper px-1.5 py-0.5 ring-1 ring-line">
                          {s.users.find((u) => u.id === x)?.name[lang]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.channels.inapp && (
                      <span className="inline-flex items-center gap-1 rounded bg-paper px-1.5 py-1 text-[12px] ring-1 ring-line" title={ar ? 'داخل النظام' : 'In the app'}>
                        <Bell size={13} />
                      </span>
                    )}
                    {chans
                      .filter((c) => r.channels[c])
                      .map((c) => (
                        <span key={c} className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] ring-1 ${s.channels[c].enabled ? 'bg-paper ring-line' : 'bg-amber-soft text-amber ring-amber/30'}`} title={channelName[c][lang]}>
                          {channelIcon[c]}
                        </span>
                      ))}
                  </div>
                  <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-nile hover:bg-nile-soft" onClick={() => setEdit(r)}>
                    <Pencil size={14} /> {ar ? 'تعديل' : 'Edit'}
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'الوقت' : 'Time'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'القناة' : 'Channel'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'إلى' : 'To'}</th>
                <th className="py-2.5 pe-3 text-start font-medium">{ar ? 'الموضوع' : 'Subject'}</th>
                <th className="px-5 py-2.5 text-start font-medium">{ar ? 'النتيجة' : 'Result'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.deliveries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">
                    {ar ? 'لم يُرسل شيء بعد.' : 'Nothing sent yet.'}
                  </td>
                </tr>
              )}
              {s.deliveries.slice(0, 120).map((d) => (
                <tr key={d.id}>
                  <td className="num px-5 py-2 whitespace-nowrap text-muted">{date(d.at, lang)}</td>
                  <td className="py-2 pe-3">
                    <span className="inline-flex items-center gap-1">
                      {channelIcon[d.channel]} {channelName[d.channel][lang]}
                    </span>
                  </td>
                  <td className="py-2 pe-3">
                    {d.toName?.[lang]}
                    <span className="num block text-[12px] text-muted" dir="ltr">
                      {d.to}
                    </span>
                  </td>
                  <td className="max-w-[300px] truncate py-2 pe-3">{d.subject}</td>
                  <td className="px-5 py-2">
                    {d.status === 'sent' ? (
                      <span className="rounded bg-leaf-soft px-2 py-0.5 text-[12.5px] text-leaf">{ar ? 'أُرسل' : 'Sent'}</span>
                    ) : (
                      <span className={`rounded px-2 py-0.5 text-[12.5px] ${d.status === 'failed' ? 'bg-crescent-soft text-crescent' : 'bg-amber-soft text-amber'}`} title={d.reason?.[lang]}>
                        {d.status === 'failed' ? (ar ? 'فشل' : 'Failed') : ar ? 'لم يُرسل' : 'Not sent'}
                      </span>
                    )}
                    {d.reason && <span className="block text-[11.5px] text-muted">{d.reason[lang]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {edit && <RuleModal rule={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function RuleModal({ rule, onClose }: { rule: NotifRule; onClose: () => void }) {
  const lang = useLang()
  const ar = lang === 'ar'
  const s = useStore()
  const [r, setR] = useState<NotifRule>(rule)
  const info = eventInfo[r.event]
  const isNew = !rule.id
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const defaults: Partial<Record<NotifEvent, number>> = { request_stale: 48, report_overdue: 5, line_threshold: 85, spend_no_report: 10, month_close: 5 }
  return (
    <Modal open onClose={onClose} title={isNew ? (ar ? 'قاعدة تنبيه جديدة' : 'New notification rule') : ar ? 'تعديل قاعدة التنبيه' : 'Edit notification rule'} wide>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Field label={ar ? 'متى يُرسل التنبيه؟' : 'When should it alert?'}>
            <select className={inputCls} value={r.event} onChange={(e) => {
              const ev = e.target.value as NotifEvent
              setR({ ...r, event: ev, name: eventInfo[ev].name, threshold: defaults[ev] })
            }}>
              {(Object.keys(eventInfo) as NotifEvent[]).map((k) => (
                <option key={k} value={k}>
                  {eventInfo[k].name[lang]}
                </option>
              ))}
            </select>
          </Field>
          <p className="-mt-2 text-[13px] text-muted">{info.desc[lang]}</p>
          {info.unit && (
            <Field label={ar ? 'الحد' : 'Threshold'}>
              <div className="flex items-center gap-2">
                <input type="number" min={0} className={`${inputCls} num w-28`} value={r.threshold ?? ''} onChange={(e) => setR({ ...r, threshold: Math.max(0, +e.target.value) })} />
                <span className="text-[14px] text-muted">{info.unit[lang]}</span>
              </div>
            </Field>
          )}
          <Field label={ar ? 'اسم القاعدة' : 'Rule name'}>
            <input className={inputCls} value={r.name[lang]} onChange={(e) => setR({ ...r, name: { ...r.name, [lang]: e.target.value } })} />
          </Field>
          <div>
            <div className="mb-1.5 text-[13.5px] font-medium">{ar ? 'القنوات' : 'Channels'}</div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" className="size-4" checked={r.channels.inapp} onChange={(e) => setR({ ...r, channels: { ...r.channels, inapp: e.target.checked } })} />
                <Bell size={14} /> {ar ? 'داخل النظام (الجرس)' : 'In the app (bell)'}
              </label>
              {chans.map((c) => (
                <label key={c} className="flex items-center gap-2 text-[14px]">
                  <input type="checkbox" className="size-4" checked={r.channels[c]} onChange={(e) => setR({ ...r, channels: { ...r.channels, [c]: e.target.checked } })} />
                  {channelIcon[c]} {channelName[c][lang]}
                  {!s.channels[c].enabled && (
                    <Link to="/settings/channels" className="text-[12px] text-amber underline">
                      {ar ? 'غير مفعّلة — إعداد' : 'off — set up'}
                    </Link>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[13.5px] font-medium">{ar ? 'من يستلم التنبيه؟' : 'Who gets it?'}</div>
            <label className="flex items-start gap-2 rounded-md border border-line p-3 text-[14px]">
              <input type="checkbox" className="mt-1 size-4" checked={r.recipients.concerned} onChange={(e) => setR({ ...r, recipients: { ...r.recipients, concerned: e.target.checked } })} />
              <span>
                {info.concerned[lang]}
                <span className="block text-[12px] text-muted">{ar ? 'يحدده النظام تلقائياً لكل حالة.' : 'Worked out automatically for each case.'}</span>
              </span>
            </label>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] text-muted">{ar ? 'وأيضاً كل من يحمل هذه الأدوار:' : 'Also everyone with these roles:'}</div>
            <div className="flex flex-wrap gap-1.5">
              {s.roles.map((ro) => (
                <button
                  key={ro.id}
                  onClick={() => setR({ ...r, recipients: { ...r.recipients, roles: toggle(r.recipients.roles, ro.id) } })}
                  className={`rounded-md border px-2.5 py-1 text-[13px] ${r.recipients.roles.includes(ro.id) ? 'border-nile bg-nile-soft text-nile' : 'border-line hover:border-nile-2'}`}
                  aria-pressed={r.recipients.roles.includes(ro.id)}
                >
                  {ro.name[lang]}
                </button>
              ))}
            </div>
          </div>
          <Field label={ar ? 'أشخاص محددون' : 'Specific people'}>
            <select
              className={inputCls}
              value=""
              onChange={(e) => e.target.value && setR({ ...r, recipients: { ...r.recipients, users: [...new Set([...r.recipients.users, e.target.value])] } })}
            >
              <option value="">{ar ? '+ إضافة شخص' : '+ Add a person'}</option>
              {s.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name[lang]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {r.recipients.users.map((id) => (
              <button key={id} onClick={() => setR({ ...r, recipients: { ...r.recipients, users: r.recipients.users.filter((x) => x !== id) } })} className="rounded-md bg-nile-soft px-2.5 py-1 text-[13px] text-nile">
                {s.users.find((u) => u.id === id)?.name[lang]} ×
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-between gap-2">
        {!isNew ? (
          <Button
            variant="danger"
            onClick={() => {
              s.deleteNotifRule(r.id)
              onClose()
            }}
          >
            {ar ? 'حذف القاعدة' : 'Delete rule'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="quiet" onClick={onClose}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            disabled={!r.channels.inapp && !chans.some((c) => r.channels[c])}
            onClick={async () => {
              if ((await s.saveNotifRule({ ...r, id: r.id || `n-${Date.now().toString(36)}` })) === false) return
              onClose()
            }}
          >
            {ar ? 'حفظ القاعدة' : 'Save rule'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
