import { BadRequestException, type PipeTransform } from '@nestjs/common'
import { z, type ZodType } from 'zod'

/** Validates a body/query with a zod schema: `@Body(new Zod(schema)) dto: z.infer<typeof schema>`. */
export class Zod<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value)
    if (!r.success) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: { ar: 'بيانات غير صالحة', en: 'Invalid input' },
        details: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    return r.data
  }
}

/** Common field validators. */
/** A non-negative amount with at most 2 decimals and 12 integer digits. Numbers are accepted only if exact. */
export const money = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Must be an amount with at most 2 decimals')
export const positiveMoney = money.refine((v) => Number(v) > 0, 'Must be greater than zero')
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
export const id = z.string().min(1).max(64)

/** A signed amount (e.g. SDG moved on a journal line: + in, − out). */
export const signedMoney = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
  .refine((v) => /^-?\d{1,12}(\.\d{1,2})?$/.test(v), 'Must be an amount with at most 2 decimals')
