import argon2 from 'argon2'
import { z } from 'zod'

export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id })
export const verifyPassword = (hash: string, p: string) => argon2.verify(hash, p).catch(() => false)

/** At least 10 characters with a letter and a digit. */
export const passwordRule = z
  .string()
  .min(10, 'At least 10 characters')
  .max(200)
  .refine((p) => /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p), 'Use letters and numbers')
