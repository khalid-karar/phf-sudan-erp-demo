import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { eq } from 'drizzle-orm'
import type { Request } from 'express'
import { AppError, forbidden } from '../common/errors'
import type { Db } from '../db/client'
import { DB } from '../db/db.module'
import { roles, users } from '../db/schema'
import { can, type Access, type AuthUser, type ModuleKey } from './auth-user'
import { ALLOW_PW_CHANGE, DONOR_OK, IS_PUBLIC, PERM } from './decorators'

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', { ar: 'يرجى تسجيل الدخول', en: 'Please sign in' })

/**
 * Global guard: verifies the access token, reloads the user and role from the database
 * (so a deactivated user or a changed role takes effect immediately), then checks @Perm.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) throw unauthenticated()
    let sub: string
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(header.slice(7))).sub
    } catch {
      throw unauthenticated()
    }
    const [row] = await this.db
      .select({ u: users, r: roles })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, sub))
    if (!row || !row.u.active) throw unauthenticated()

    const user: AuthUser = {
      id: row.u.id,
      email: row.u.email,
      nameAr: row.u.nameAr,
      nameEn: row.u.nameEn,
      roleId: row.r.id,
      officeId: row.u.officeId,
      scope: row.r.scope,
      canApprove: row.r.canApprove,
      permissions: row.r.permissions,
      mustChangePassword: row.u.mustChangePassword,
      donorId: row.u.donorId,
      ip: req.ip,
    }
    req.user = user

    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PW_CHANGE, targets)) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', { ar: 'يجب تغيير كلمة المرور المؤقتة أولاً', en: 'Change your temporary password first' })
    }
    // A donor representative gets the portal routes and nothing else, whatever their role's permissions say.
    if (user.donorId && !this.reflector.getAllAndOverride<boolean>(DONOR_OK, targets)) throw forbidden()
    const perm = this.reflector.getAllAndOverride<{ module: ModuleKey; level: Access } | undefined>(PERM, targets)
    if (perm && !can(user, perm.module, perm.level)) throw forbidden()
    return true
  }
}
