import { HttpException } from '@nestjs/common'

export interface Bi {
  ar: string
  en: string
}

/**
 * A business-rule failure the client can show as-is: a stable `code`, a message in both
 * languages, and optional details (e.g. the ceiling check that failed).
 */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly msg: Bi,
    readonly details?: unknown,
  ) {
    super({ code, message: msg, details }, status)
  }
}

export const notFound = (what: Bi) => new AppError(404, 'NOT_FOUND', { ar: `${what.ar} غير موجود`, en: `${what.en} not found` })
export const forbidden = (msg: Bi = { ar: 'لا تملك صلاحية هذا الإجراء', en: 'You do not have permission for this action' }) => new AppError(403, 'FORBIDDEN', msg)
export const conflict = (code: string, msg: Bi, details?: unknown) => new AppError(409, code, msg, details)
export const unprocessable = (code: string, msg: Bi, details?: unknown) => new AppError(422, code, msg, details)
