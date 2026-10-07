import { isIP } from 'node:net'
import nodemailer from 'nodemailer'
import type { Channel, ChannelConfigs, EmailConfig, SmsConfig, WhatsappConfig } from './channels'

export interface Message {
  to: string
  subject: string
  body: string
  lang: 'ar' | 'en'
  /** Email only: copies, files to attach, and whether this is an automatic message (false for one a person sent). */
  cc?: string[]
  attachments?: { filename: string; content: Buffer; contentType: string }[]
  auto?: boolean
}

/** Sends one message. Throws with a short reason when it could not be sent. */
export interface Transport {
  send(channel: Channel, cfg: ChannelConfigs[Channel], m: Message): Promise<void>
}

export const TRANSPORT = Symbol('TRANSPORT')

// Tests replace the sender so no real message leaves the machine.
let override: Transport | null = null
export const setTransportForTests = (t: Transport | null) => {
  override = t
}
export const transportProvider = () => {
  const real = new RealTransport()
  return { send: (channel: Channel, cfg: ChannelConfigs[Channel], m: Message) => (override ?? real).send(channel, cfg, m) } satisfies Transport
}

const TIMEOUT_MS = 15_000
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Refuses addresses that point inside the server's own network (the URL comes from the settings screen). */
export function assertPublicHttps(url: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error('The service URL is not valid')
  }
  if (u.protocol !== 'https:') throw new Error('The service URL must start with https://')
  const h = u.hostname.toLowerCase()
  const privateV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || (isIP(h) === 4 && privateV4.test(h)) || (isIP(h) === 6 && (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))) || !h.includes('.') && isIP(h) === 0)
    throw new Error('The service URL must be a public address')
}

async function post(url: string, init: RequestInit, what: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
  if (!res.ok) {
    const text = clip((await res.text().catch(() => '')).replace(/\s+/g, ' '), 200)
    throw new Error(`${what} answered ${res.status}${text ? `: ${text}` : ''}`)
  }
}

export class RealTransport implements Transport {
  async send(channel: Channel, cfg: ChannelConfigs[Channel], m: Message) {
    if (channel === 'email') return this.email(cfg as EmailConfig, m)
    if (channel === 'whatsapp') return this.whatsapp(cfg as WhatsappConfig, m)
    return this.sms(cfg as SmsConfig, m)
  }

  private async email(c: EmailConfig, m: Message) {
    const t = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.security === 'ssl',
      requireTLS: c.security === 'starttls',
      ignoreTLS: c.security === 'none',
      auth: c.username ? { user: c.username, pass: c.password } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: TIMEOUT_MS,
    })
    try {
      await t.sendMail({
        from: c.fromName ? { name: c.fromName, address: c.fromAddress } : c.fromAddress,
        to: m.to,
        cc: m.cc?.length ? m.cc : undefined,
        replyTo: c.replyTo || undefined,
        subject: m.subject,
        text: m.body,
        attachments: m.attachments,
        headers: m.auto === false ? undefined : { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
      })
    } finally {
      t.close()
    }
  }

  private async whatsapp(c: WhatsappConfig, m: Message) {
    // Business-initiated WhatsApp messages must use an approved template; its two variables carry the title and the text.
    const flat = (s: string, n: number) => clip(s.replace(/\s*\n+\s*/g, ' | ').replace(/ {4,}/g, '   '), n)
    await post(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(c.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: m.to.replace(/\D/g, ''),
          type: 'template',
          template: { name: c.templateName, language: { code: c.templateLanguage }, components: [{ type: 'body', parameters: [{ type: 'text', text: flat(m.subject, 200) }, { type: 'text', text: flat(m.body, 900) }] }] },
        }),
      },
      'WhatsApp',
    )
  }

  private async sms(c: SmsConfig, m: Message) {
    const text = clip(`${m.subject}${m.body ? ' — ' + m.body : ''}`.replace(/\s*\n+\s*/g, ' '), 300)
    if (c.provider === 'twilio') {
      const form = new URLSearchParams({ To: m.to, From: c.fromNumber || c.senderId, Body: text })
      await post(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/Messages.json`,
        { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form },
        'Twilio',
      )
      return
    }
    assertPublicHttps(c.apiUrl)
    await post(c.apiUrl, { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: m.to, message: text, sender: c.senderId || undefined }) }, 'The SMS service')
  }
}
