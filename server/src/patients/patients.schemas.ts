import { z } from 'zod'
import { isoDate } from '../common/zod'

const thisYear = () => new Date().getUTCFullYear()
export const serviceTypes = ['consultation', 'surgery', 'medicines', 'nutrition', 'vaccination', 'referral', 'maternal'] as const

export const beneficiaryBody = z.object({
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().max(200).optional(),
  gender: z.enum(['m', 'f']),
  birthYear: z.number().int().min(1900).refine((y) => y <= thisYear(), 'Birth year is in the future'),
  officeId: z.string().optional(),
  locality: z.string().trim().max(200).optional(),
  displaced: z.boolean().default(false),
  phone: z.string().trim().max(40).optional(),
  // The person was warned about a possible duplicate and confirmed they are different people.
  confirmNotDuplicate: z.boolean().default(false),
  // First service, recorded together with the registration.
  service: z.object({ type: z.enum(serviceTypes), activityId: z.string().optional(), date: isoDate.optional(), note: z.string().trim().max(500).optional() }).optional(),
})
export const beneficiaryPatch = z.object({
  nameAr: z.string().trim().min(2).max(200).optional(),
  nameEn: z.string().trim().max(200).nullable().optional(),
  birthYear: z.number().int().min(1900).refine((y) => y <= thisYear(), 'Birth year is in the future').optional(),
  gender: z.enum(['m', 'f']).optional(),
  locality: z.string().trim().max(200).nullable().optional(),
  displaced: z.boolean().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
})
export const serviceBody = z.object({
  type: z.enum(serviceTypes),
  date: isoDate.optional(),
  activityId: z.string().optional(),
  note: z.string().trim().max(500).optional(),
})
export const mergeBody = z.object({ intoId: z.string().min(1) })
export const beneficiaryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  officeId: z.string().optional(),
  gender: z.enum(['m', 'f']).optional(),
  service: z.enum(serviceTypes).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const statsQuery = z.object({ officeId: z.string().optional(), from: isoDate.optional(), to: isoDate.optional() })
export const duplicateQuery = z.object({ nameAr: z.string().trim().min(2).max(200), nameEn: z.string().trim().max(200).optional(), birthYear: z.coerce.number().int(), phone: z.string().trim().max(40).optional() })
