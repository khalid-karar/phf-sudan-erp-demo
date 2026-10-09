import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { audit } from '../common/audit'
import { AppError } from '../common/errors'
import { env } from '../config/env'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { refreshTokens, roles, users } from '../db/schema'
import type { AuthUser } from './auth-user'
import { hashPassword, verifyPassword } from './passwords'

const MAX_FAILED = 5
const LOCK_MINUTES = 15
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const badLogin = () => new AppError(401, 'BAD_CREDENTIALS', { ar: 'البريد أو كلمة المرور غير صحيحة', en: 'Wrong email or password' })

export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const [u] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase()))
    // Hash anyway when the user is unknown, so response time doesn't reveal which emails exist.
    if (!u) {
      await hashPassword(password)
      throw badLogin()
    }
    if (!u.active) throw badLogin()
    if (u.lockedUntil && u.lockedUntil > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', { ar: 'الحساب مقفل مؤقتاً بسبب محاولات خاطئة متكررة', en: 'Account temporarily locked after repeated failed attempts' }, { until: u.lockedUntil })
    }
    if (!(await verifyPassword(u.passwordHash, password))) {
      // Counted in the database so several wrong guesses at once cannot all read the same count.
      await this.db.execute(sql`update users set
        failed_logins = case when failed_logins + 1 >= ${MAX_FAILED} then 0 else failed_logins + 1 end,
        locked_until = case when failed_logins + 1 >= ${MAX_FAILED} then now() + (${LOCK_MINUTES} * interval '1 minute') else null end
        where id = ${u.id}`)
      await audit(this.db, null, 'auth.login_failed', 'user', u.id, { ip: meta.ip })
      throw badLogin()
    }
    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id))
    await audit(this.db, null, 'auth.login', 'user', u.id, { ip: meta.ip })
    const tokens = await this.issue(u.id, randomBytes(12).toString('hex'), meta.userAgent)
    return { ...tokens, mustChangePassword: u.mustChangePassword }
  }

  /** Rotates a refresh token. Presenting an already-used token revokes its whole family (theft signal). */
  async refresh(token: string, userAgent?: string): Promise<Tokens> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(token)))
    if (!row) throw new AppError(401, 'BAD_REFRESH', { ar: 'انتهت الجلسة، سجّل الدخول مرة أخرى', en: 'Session expired, please sign in again' })
    if (row.revokedAt) {
      await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.family, row.family), isNull(refreshTokens.revokedAt)))
      await audit(this.db, null, 'auth.refresh_reuse', 'user', row.userId)
      throw new AppError(401, 'BAD_REFRESH', { ar: 'انتهت الجلسة، سجّل الدخول مرة أخرى', en: 'Session expired, please sign in again' })
    }
    if (row.expiresAt < new Date()) throw new AppError(401, 'BAD_REFRESH', { ar: 'انتهت الجلسة، سجّل الدخول مرة أخرى', en: 'Session expired, please sign in again' })
    const [u] = await this.db.select({ active: users.active }).from(users).where(eq(users.id, row.userId))
    if (!u?.active) throw new AppError(401, 'BAD_REFRESH', { ar: 'الحساب موقوف', en: 'Account is deactivated' })
    // Only one concurrent refresh can win the rotation.
    const revoked = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    if (!revoked.length) throw new AppError(401, 'BAD_REFRESH', { ar: 'انتهت الجلسة، سجّل الدخول مرة أخرى', en: 'Session expired, please sign in again' })
    return this.issue(row.userId, row.family, userAgent)
  }

  async logout(token: string) {
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.tokenHash, sha256(token)), isNull(refreshTokens.revokedAt)))
  }

  async changePassword(user: AuthUser, current: string, next: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, user.id))
    if (!(await verifyPassword(u.passwordHash, current))) throw new AppError(400, 'BAD_PASSWORD', { ar: 'كلمة المرور الحالية غير صحيحة', en: 'Current password is wrong' })
    if (current === next) throw new AppError(400, 'SAME_PASSWORD', { ar: 'اختر كلمة مرور مختلفة', en: 'Choose a different password' })
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id))
      // Sign out other sessions.
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)))
      await audit(tx, user, 'auth.password_changed', 'user', user.id)
    })
  }

  async me(user: AuthUser) {
    const [r] = await this.db.select().from(roles).where(eq(roles.id, user.roleId))
    return {
      id: user.id,
      email: user.email,
      nameAr: user.nameAr,
      nameEn: user.nameEn,
      officeId: user.officeId,
      mustChangePassword: user.mustChangePassword,
      donorId: user.donorId,
      role: { id: r.id, nameAr: r.nameAr, nameEn: r.nameEn, scope: r.scope, canApprove: r.canApprove, permissions: r.permissions },
    }
  }

  private async issue(userId: string, family: string, userAgent?: string): Promise<Tokens> {
    const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_DAYS } = env()
    const accessToken = await this.jwt.signAsync({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL })
    const refreshToken = randomBytes(32).toString('base64url')
    await this.db.insert(refreshTokens).values({
      userId,
      family,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      userAgent: userAgent?.slice(0, 200),
    })
    // Housekeeping: drop this user's long-dead tokens.
    await this.db.execute(sql`delete from refresh_tokens where user_id = ${userId} and expires_at < now() - interval '7 days'`)
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL }
  }
}
