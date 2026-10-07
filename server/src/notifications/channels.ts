import { z } from 'zod'
import { decryptSecret, encryptSecret, isEncrypted, SECRET_FIELDS } from './secrets'

export type Channel = 'email' | 'whatsapp' | 'sms'
export const CHANNELS: Channel[] = ['email', 'whatsapp', 'sms']

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const phoneRe = /^\+?\d[\d\s-]{7,}$/

export const emailConfig = z.object({
  enabled: z.boolean(),
  provider: z.enum(['microsoft365', 'google', 'smtp', 'sendgrid']).default('smtp'),
  host: z.string().trim().max(200).default(''),
  port: z.number().int().min(1).max(65535).default(587),
  security: z.enum(['starttls', 'ssl', 'none']).default('starttls'),
  username: z.string().trim().max(200).default(''),
  password: z.string().max(500).default(''),
  fromName: z.string().trim().max(200).default(''),
  fromAddress: z.string().trim().max(200).default(''),
  replyTo: z.string().trim().max(200).default(''),
})
export const whatsappConfig = z.object({
  enabled: z.boolean(),
  mode: z.enum(['cloud_api', 'click_to_chat']).default('cloud_api'),
  phoneNumberId: z.string().trim().max(40).default(''),
  businessAccountId: z.string().trim().max(40).default(''),
  accessToken: z.string().max(1000).default(''),
  senderNumber: z.string().trim().max(40).default(''),
  templateName: z.string().trim().max(100).default(''),
  templateLanguage: z.enum(['ar', 'en']).default('ar'),
})
export const smsConfig = z.object({
  enabled: z.boolean(),
  provider: z.enum(['twilio', 'http']).default('http'),
  accountSid: z.string().trim().max(60).default(''),
  authToken: z.string().max(200).default(''),
  fromNumber: z.string().trim().max(40).default(''),
  apiUrl: z.string().trim().max(500).default(''),
  apiKey: z.string().max(300).default(''),
  senderId: z.string().trim().max(30).default(''),
})
export const channelSchemas = { email: emailConfig, whatsapp: whatsappConfig, sms: smsConfig } as const
export type EmailConfig = z.infer<typeof emailConfig>
export type WhatsappConfig = z.infer<typeof whatsappConfig>
export type SmsConfig = z.infer<typeof smsConfig>
export type ChannelConfigs = { email: EmailConfig; whatsapp: WhatsappConfig; sms: SmsConfig }

export const MASK = '••••••••'

/** A channel's settings for the screen: secrets are hidden, only whether one is set is shown. */
export function maskConfig(channel: Channel, cfg: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...cfg }
  for (const f of SECRET_FIELDS[channel]) {
    out[f] = cfg[f] ? MASK : ''
    out[`${f}Set`] = !!cfg[f]
  }
  return out
}

/** Encrypts new secrets; a blank or masked value keeps the one already stored. */
export function sealConfig(channel: Channel, incoming: Record<string, unknown>, stored: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = { ...incoming }
  for (const f of SECRET_FIELDS[channel]) {
    const v = incoming[f]
    if (v === undefined || v === '' || v === MASK) out[f] = (stored?.[f] as string | undefined) ?? ''
    else out[f] = isEncrypted(v) ? v : encryptSecret(String(v))
  }
  return out
}

export function openConfig<C extends Channel>(channel: C, stored: Record<string, unknown>): ChannelConfigs[C] {
  const plain: Record<string, unknown> = { ...stored }
  for (const f of SECRET_FIELDS[channel]) plain[f] = decryptSecret(String(stored[f] ?? ''))
  return channelSchemas[channel].parse(plain) as ChannelConfigs[C]
}

export const defaultConfig = <C extends Channel>(channel: C): ChannelConfigs[C] => channelSchemas[channel].parse({ enabled: false }) as ChannelConfigs[C]

/** Why a channel cannot send right now (null when it can). */
export function notReady(channel: Channel, c: ChannelConfigs[Channel]): { ar: string; en: string } | null {
  if (channel === 'email') {
    const e = c as EmailConfig
    if (!e.enabled) return { ar: 'البريد غير مفعّل في الإعدادات', en: 'Email is turned off in settings' }
    if (!e.host || !emailRe.test(e.fromAddress)) return { ar: 'إعدادات البريد ناقصة', en: 'Email settings are incomplete' }
  }
  if (channel === 'whatsapp') {
    const w = c as WhatsappConfig
    if (!w.enabled) return { ar: 'واتساب غير مفعّل في الإعدادات', en: 'WhatsApp is turned off in settings' }
    if (w.mode === 'click_to_chat') return { ar: 'وضع «النقر للمحادثة» يتطلب إرسالاً يدوياً', en: 'Click-to-chat needs a person to send the message' }
    if (!w.phoneNumberId || !w.accessToken || !w.templateName) return { ar: 'إعدادات واتساب ناقصة', en: 'WhatsApp settings are incomplete' }
  }
  if (channel === 'sms') {
    const s = c as SmsConfig
    if (!s.enabled) return { ar: 'الرسائل النصية غير مفعّلة في الإعدادات', en: 'SMS is turned off in settings' }
    if (s.provider === 'twilio' ? !s.accountSid || !s.authToken || !(s.fromNumber || s.senderId) : !s.apiUrl || !s.apiKey) return { ar: 'إعدادات الرسائل ناقصة', en: 'SMS settings are incomplete' }
  }
  return null
}

/** Checks a person's address is usable on the channel; returns the cleaned address. */
export function cleanAddress(channel: Channel, raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (channel === 'email') return emailRe.test(v) ? v : null
  const d = v.replace(/[\s-]/g, '')
  return phoneRe.test(v) ? (d.startsWith('+') ? d : '+' + d) : null
}
