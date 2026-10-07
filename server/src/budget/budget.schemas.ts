import { z } from 'zod'
import { positiveMoney } from '../common/zod'

const text = z.string().trim().min(1).max(300)

export const checkBody = z.object({ lineId: z.string().min(1), amountUsd: positiveMoney })

/** Donor budget details carried by a line imported from a budget file. */
export const lineDetail = z.object({
  activityCode: z.string().max(40).nullable().optional(),
  fundCode: z.string().max(40).nullable().optional(),
  state: z.string().max(60).nullable().optional(),
  description: z.string().max(600).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  unitQty: z.number().nonnegative().nullable().optional(),
  duration: z.number().nonnegative().nullable().optional(),
  unitCostUsd: z.string().nullable().optional(),
  nature: z.string().max(200).nullable().optional(),
  donorAccount: z.string().max(20).nullable().optional(),
})

export const projectBody = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  code: z.string().trim().min(1).max(30),
  nameAr: text,
  nameEn: text,
  donorAr: text,
  donorEn: text,
  fundId: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ceilingUsd: positiveMoney,
  ipCode: z.string().trim().max(30).nullable().optional(),
  budgetRate: z.coerce.number().positive().max(1_000_000).nullable().optional(),
  controlMode: z.enum(['hard', 'soft']).default('hard'),
  tolerancePct: z.coerce.number().min(0).max(50).default(0),
  pillars: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(20),
        nameAr: text,
        nameEn: text,
        ceilingUsd: positiveMoney,
        lines: z
          .array(z.object({ code: z.string().trim().min(1).max(20), nameAr: text, nameEn: text, ceilingUsd: positiveMoney, expenseAccountCode: z.string().nullable().optional(), detail: lineDetail.optional() }))
          .min(1),
      }),
    )
    .min(1),
})

export const controlBody = z.object({ controlMode: z.enum(['hard', 'soft']), tolerancePct: z.coerce.number().min(0).max(50) })

export const linePatch = z.object({
  ceilingUsd: positiveMoney.optional(),
  expenseAccountCode: z.string().nullable().optional(),
  nameAr: text.optional(),
  nameEn: text.optional(),
  nature: z.string().max(200).nullable().optional(),
  active: z.boolean().optional(),
})

export const linkBody = z.object({ activityId: z.string().min(1) })
