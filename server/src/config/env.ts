import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().default(15 * 60), // seconds
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.enum(['true', 'false', '1', '0']).default('false').transform((v) => v === 'true' || v === '1'),
  // Key for encrypting channel passwords and tokens at rest. When unset it is derived from JWT_SECRET.
  SECRETS_KEY: z.string().min(32, 'SECRETS_KEY must be at least 32 characters').optional(),
  // Where people open the app, used for links inside emails and messages (e.g. https://erp.kphfs.org).
  APP_URL: z.string().url().optional(),
  // How often the notification engine looks for new alerts and sends queued messages (0 turns the background loop off).
  NOTIFY_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(300),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

export function env(): Env {
  if (cached) return cached
  // docker compose passes unset optional variables as empty strings
  const raw = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => !(['APP_URL', 'SECRETS_KEY', 'NOTIFY_INTERVAL_SECONDS'].includes(k) && v === '')))
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  const placeholder = /change-me|dev-only|example|secret-test/i.test(parsed.data.JWT_SECRET)
  if (parsed.data.NODE_ENV === 'production' && (placeholder || new Set(parsed.data.JWT_SECRET).size < 16))
    throw new Error('JWT_SECRET looks like a placeholder. Generate one with: openssl rand -base64 48')
  cached = parsed.data
  return cached
}
