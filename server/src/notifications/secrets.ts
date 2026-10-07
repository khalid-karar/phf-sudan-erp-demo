import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env'

// Channel passwords and tokens are encrypted (AES-256-GCM) before they are stored, so a copy of the
// database or a backup does not reveal them. The key comes from SECRETS_KEY, or from JWT_SECRET if unset.
const PREFIX = 'enc:v1:'
const key = () => createHash('sha256').update('phf-secrets|' + (env().SECRETS_KEY ?? env().JWT_SECRET)).digest()

export const isEncrypted = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX)

export function encryptSecret(plain: string): string {
  if (!plain) return ''
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  if (!isEncrypted(stored)) return stored
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64')
  const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
}

/** Which fields of each channel's settings are secrets. */
export const SECRET_FIELDS: Record<string, string[]> = { email: ['password'], whatsapp: ['accessToken'], sms: ['authToken', 'apiKey'] }
