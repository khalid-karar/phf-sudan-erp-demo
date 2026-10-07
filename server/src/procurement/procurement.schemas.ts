import { z } from 'zod'

const s = (n = 500) => z.string().trim().max(n)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()

export const prLine = z.object({
  item: s(300).min(1),
  unit: s(40).default(''),
  spec: s(1000).default(''),
  qty: z.number().positive().max(1e9),
  unitCost: z.number().min(0).max(1e12),
  freq: z.number().positive().max(1e6).default(1),
})

export const caseData = z.object({
  pr: z.object({
    department: s(200).default(''),
    unit: s(200).default(''),
    reason: s(1000).default(''),
    method: z.enum(['single', 'ip', 'competitive']).default('competitive'),
    requiredDate: date,
    deliveryPlace: s(200).default(''),
    deliveryTerms: s(300).default(''),
    requestedBy: s(120).default(''),
    lines: z.array(prLine).min(1).max(60),
  }),
  rfq: z.object({ issueDate: date, closeDate: date, vendors: z.array(z.object({ name: s(200).min(1), email: s(200).default(''), phone: s(60).default('') })).max(10) }).optional(),
  bids: z
    .array(z.object({ vendor: s(200).min(1), unitPrices: z.array(z.number().min(0).max(1e12)).max(60), deliveryDays: z.number().int().min(0).max(3650).nullable().optional(), accepted: z.boolean().default(true), note: s(500).default('') }))
    .max(10)
    .optional(),
  award: z.object({ vendor: s(200).min(1), reason: s(1000).default('') }).optional(),
  po: z.object({ date: date, vendor: z.object({ name: s(200).min(1), place: s(200).default(''), phone: s(60).default('') }), shipTo: s(300).default('') }).optional(),
  receipt: z.object({ date: date, store: s(120).default(''), lines: z.array(z.object({ received: z.number().min(0).max(1e9) })).max(60), notes: s(500).default('') }).optional(),
})
export type CaseData = z.infer<typeof caseData>

export const createBody = z.object({ officeId: z.string().min(1).optional(), projectId: z.string().nullable().optional(), lineId: z.string().nullable().optional(), data: caseData })
export const updateBody = z.object({ projectId: z.string().nullable().optional(), lineId: z.string().nullable().optional(), data: caseData })
export const listQuery = z.object({ status: z.enum(['draft', 'rfq', 'evaluated', 'ordered', 'received', 'cancelled']).optional(), officeId: z.string().optional() })
