import { z } from 'zod'
import { period } from '../common/zod'

const bi = (max: number) => z.object({ ar: z.string().max(max), en: z.string().max(max) })
const email = z.string().trim().toLowerCase().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Not an email address')
const emails = z.array(email).max(20).transform((a) => [...new Set(a)])

/** Who a report goes to and the default subject and text. {month}, {hq}, {org}, {sender}, {project}, {period}, {donor} are filled in when sending. */
export const delivery = z.object({ to: emails, cc: emails, subject: bi(300), body: bi(5000) })
export const hqDelivery = delivery.extend({
  requireApproval: z.boolean(),
  approverRole: z.string().min(1).max(64),
  autoSendDay: z.number().int().min(1).max(28).nullable(),
  includeSections: z.record(z.string().max(40), z.boolean()),
})
export const settingsBody = z.object({ hq: hqDelivery, donor: z.record(z.string().max(64), delivery) })
export type Delivery = z.infer<typeof delivery>
export type HqDelivery = z.infer<typeof hqDelivery>

export const periodQuery = z.object({ period })
export const deliveryQuery = z.object({ kind: z.enum(['hq', 'donor']), period, projectId: z.string().max(64).optional(), lang: z.enum(['ar', 'en']).default('ar') })
export const sentQuery = z.object({ kind: z.enum(['hq', 'donor']).optional(), period: period.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) })

export const draftBody = z.object({ summary: bi(4000).nullable().optional(), challenges: bi(4000).nullable().optional(), plan: bi(4000).nullable().optional() })

export const sendBody = z.object({
  kind: z.enum(['hq', 'donor']),
  period,
  projectId: z.string().max(64).optional(),
  attachmentId: z.string().min(1).max(64),
  to: emails.refine((a) => a.length > 0, 'At least one recipient'),
  cc: emails.default([]),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10_000),
})
