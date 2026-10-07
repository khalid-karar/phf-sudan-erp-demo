import { z } from 'zod'
import { positiveMoney } from '../common/zod'

const text = z.string().trim().min(1).max(300)

export const checkBody = z.object({ lineId: z.string().min(1), amountUsd: positiveMoney })

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
          .array(z.object({ code: z.string().trim().min(1).max(20), nameAr: text, nameEn: text, ceilingUsd: positiveMoney, expenseAccountCode: z.string().nullable().optional() }))
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
  active: z.boolean().optional(),
})
