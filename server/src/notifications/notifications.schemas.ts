import { z } from 'zod'
import { isoDate } from '../common/zod'
import { EVENTS } from './events'

const text = z.string().trim().min(1).max(300)

export const ruleBody = z.object({
  event: z.enum(EVENTS),
  nameAr: text,
  nameEn: text,
  threshold: z.number().int().min(1).max(100_000).nullable().optional(),
  recipients: z.object({ concerned: z.boolean(), roles: z.array(z.string().min(1)).max(30), users: z.array(z.string().min(1)).max(100) }),
  channels: z.object({ inapp: z.boolean(), email: z.boolean(), whatsapp: z.boolean(), sms: z.boolean() }),
  enabled: z.boolean().default(true),
})
export const rulePatch = ruleBody.partial()

export const deadlineBody = z.object({
  titleAr: text,
  titleEn: text,
  projectId: z.string().nullable().optional(),
  due: isoDate,
  notifyDaysBefore: z.number().int().min(0).max(365).default(5),
  ownerRoleId: z.string().min(1),
  recurrence: z.enum(['none', 'monthly', 'quarterly', 'yearly']).default('none'),
})
export const deadlinePatch = deadlineBody.partial()
export const deadlineQuery = z.object({ done: z.enum(['yes', 'no']).optional() })

export const inboxQuery = z.object({ unread: z.enum(['1', '0']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })
export const deliveryQuery = z.object({ status: z.enum(['queued', 'sent', 'failed', 'skipped']).optional(), channel: z.enum(['email', 'whatsapp', 'sms']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) })
export const channelTestBody = z.object({ to: z.string().trim().min(5).max(200), config: z.record(z.string(), z.unknown()).optional() })
