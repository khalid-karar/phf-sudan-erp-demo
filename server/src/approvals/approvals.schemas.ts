import { z } from 'zod'
import { money, positiveMoney } from '../common/zod'

export const ruleBody = z
  .object({
    nameAr: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().min(1).max(200),
    kind: z.enum(['spend', 'reallocation']),
    minUsd: money,
    maxUsd: money.nullable(),
    officeId: z.string().nullable().default(null),
    chain: z.array(z.string().min(1)).min(1).max(8),
    active: z.boolean().default(true),
  })
  .refine((r) => r.maxUsd === null || Number(r.maxUsd) > Number(r.minUsd), { message: 'maxUsd must be above minUsd', path: ['maxUsd'] })
  .refine((r) => new Set(r.chain).size === r.chain.length, { message: 'A role appears twice in the chain', path: ['chain'] })

export const requestBody = z.object({
  officeId: z.string().min(1).optional(), // defaults to the user's office
  lineId: z.string().min(1),
  activityId: z.string().nullable().optional(),
  purpose: z.string().trim().min(3).max(1000),
  amount: positiveMoney,
  currency: z.enum(['USD', 'SDG']),
})

export const decisionBody = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).optional(),
})

export const reallocationBody = z.object({
  fromLineId: z.string().min(1),
  toLineId: z.string().min(1),
  amountUsd: positiveMoney,
  reason: z.string().trim().min(3).max(1000),
})

export const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'paid', 'cancelled']).optional(),
  officeId: z.string().optional(),
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
