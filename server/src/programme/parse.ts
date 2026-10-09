import { BadRequestException } from '@nestjs/common'
import type { ZodType, z } from 'zod'

/** Validates stored or nested content with a zod schema, answering 400 like the request pipe does. */
export function parse<T extends ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value)
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION', message: { ar: 'بيانات غير صالحة', en: 'Invalid input' }, details: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
  return r.data
}
