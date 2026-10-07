import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { ZodError } from 'zod'

/** Database errors raised by the ledger triggers (migrations/0001_ledger_guards.sql). */
const ledgerMessages: Record<string, { ar: string; en: string }> = {
  LEDGER_UNBALANCED: { ar: 'القيد غير متوازن: المدين لا يساوي الدائن', en: 'The entry does not balance: debits do not equal credits' },
  LEDGER_TOO_FEW_LINES: { ar: 'القيد يحتاج سطرين على الأقل', en: 'An entry needs at least two lines' },
  LEDGER_IMMUTABLE: { ar: 'لا يمكن تعديل قيد مرحّل أو حذفه — استخدم قيداً عكسياً', en: 'Posted entries cannot be changed or deleted — post a reversal' },
  LEDGER_PERIOD_CLOSED: { ar: 'الشهر مُقفل لهذا المكتب', en: 'This month is closed for that office' },
  LEDGER_HEADER_ACCOUNT: { ar: 'لا يمكن الترحيل على حساب رئيسي', en: 'Header accounts cannot take entries' },
  LEDGER_INACTIVE_ACCOUNT: { ar: 'الحساب موقوف', en: 'The account is inactive' },
  LEDGER_SDG_MISSING: { ar: 'حساب بالجنيه: مبلغ الجنيه مطلوب', en: 'SDG account: the SDG amount is required' },
}

interface PgError {
  code?: string
  message?: string
  detail?: string
  constraint?: string
  cause?: PgError
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors')

  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()

    if (e instanceof HttpException) {
      const body = e.getResponse()
      const status = e.getStatus()
      if (typeof body === 'object' && body && 'code' in body) return res.status(status).json(body)
      if (status === 429) return res.status(429).json({ code: 'TOO_MANY_REQUESTS', message: { ar: 'محاولات كثيرة، انتظر دقيقة ثم حاول مجدداً', en: 'Too many attempts — wait a minute and try again' } })
      const text = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? e.message)
      const msg = Array.isArray(text) ? text.join('; ') : String(text)
      return res.status(status).json({ code: httpCode(status), message: { ar: msg, en: msg } })
    }

    if (e instanceof ZodError) {
      return res.status(400).json({
        code: 'VALIDATION',
        message: { ar: 'بيانات غير صالحة', en: 'Invalid input' },
        details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }

    // Drizzle wraps driver errors; the Postgres error is on .cause.
    const pg = findPg(e)
    if (pg?.code === 'P0001' && pg.message) {
      const code = pg.message.split(':')[0]
      const m = ledgerMessages[code]
      if (m) return res.status(422).json({ code, message: m, details: pg.message })
    }
    if (pg?.code === '23505') return res.status(409).json({ code: 'DUPLICATE', message: { ar: 'السجل موجود مسبقاً', en: 'This record already exists' }, details: pg.detail })
    if (pg?.code === '23503') return res.status(409).json({ code: 'IN_USE_OR_MISSING', message: { ar: 'سجل مرتبط غير موجود أو مستخدم', en: 'A linked record is missing or still in use' }, details: pg.detail })
    if (pg?.code === '23514') return res.status(422).json({ code: 'CHECK_FAILED', message: { ar: 'القيم لا تحقق شروط النظام', en: 'Values break a system rule' }, details: pg.constraint })
    if (pg?.code === '40001' || pg?.code === '40P01') return res.status(409).json({ code: 'RETRY', message: { ar: 'تعارض مع عملية أخرى — حاول مرة أخرى', en: 'Conflicted with another operation — please retry' } })

    // Database errors can carry the query's parameters (password hashes, tokens): log everything but those.
    const text = e instanceof Error ? (e.stack ?? e.message) : String(e)
    this.log.error(text.replace(/\n?params:[^\n]*/g, ' params: [hidden]'))
    return res.status(500).json({ code: 'INTERNAL', message: { ar: 'خطأ غير متوقع', en: 'Unexpected error' } })
  }
}

function findPg(e: unknown): PgError | undefined {
  let cur = e as PgError | undefined
  for (let i = 0; i < 4 && cur; i++) {
    if (cur.code && /^[0-9A-Z]{5}$/.test(cur.code)) return cur
    cur = cur.cause
  }
  return undefined
}

function httpCode(status: number) {
  return { 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'TOO_MANY_REQUESTS' }[status] ?? 'ERROR'
}
