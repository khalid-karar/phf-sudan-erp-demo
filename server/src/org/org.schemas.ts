import { z } from 'zod'
import { MODULES } from '../auth/auth-user'
import { passwordRule } from '../auth/passwords'

const text = z.string().trim().min(1).max(200)
const access = z.enum(['none', 'view', 'edit', 'manage'])

export const settingsBody = z.object({
  nameAr: text,
  nameEn: text,
  shortNameAr: text,
  shortNameEn: text,
  hqNameAr: text,
  hqNameEn: text,
  logoUrl: z.string().max(500_000).nullable().optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  defaultLang: z.enum(['ar', 'en']),
})

export const officeBody = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,15}$/, 'Short lowercase code, e.g. ksl'),
  nameAr: text,
  nameEn: text,
  stateAr: text,
  stateEn: text,
  type: z.enum(['hq', 'office', 'warehouse']).default('office'),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  active: z.boolean().default(true),
})
export const officePatch = officeBody.omit({ id: true }).partial()

export const roleBody = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Lowercase id, e.g. store_assistant'),
  nameAr: text,
  nameEn: text,
  descAr: z.string().max(500).default(''),
  descEn: z.string().max(500).default(''),
  permissions: z.object(Object.fromEntries(MODULES.map((m) => [m, access])) as Record<(typeof MODULES)[number], typeof access>),
  scope: z.enum(['office', 'all']),
  canApprove: z.boolean(),
})
export const rolePatch = roleBody.omit({ id: true }).partial()

export const userBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  nameAr: text,
  nameEn: text,
  phone: z.string().max(40).nullable().optional(),
  roleId: z.string().min(1),
  officeId: z.string().min(1),
  password: passwordRule.optional(), // omitted → a temporary password is generated and must be changed at first sign-in
})
export const userPatch = z.object({
  nameAr: text.optional(),
  nameEn: text.optional(),
  phone: z.string().max(40).nullable().optional(),
  roleId: z.string().min(1).optional(),
  officeId: z.string().min(1).optional(),
  active: z.boolean().optional(),
})
