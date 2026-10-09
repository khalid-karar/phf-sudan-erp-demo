import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common'
import type { Access, AuthUser, ModuleKey } from './auth-user'

export const IS_PUBLIC = 'isPublic'
export const PERM = 'perm'

/** Route needs no sign-in. */
export const Public = () => SetMetadata(IS_PUBLIC, true)

/** Route needs at least `level` access to `module` (e.g. @Perm('finance', 'edit')). */
export const Perm = (module: ModuleKey, level: Access = 'view') => SetMetadata(PERM, { module, level })

/** Injects the signed-in user. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user)

export const DONOR_OK = 'donorOk'
/** Route a donor representative may use. Every other route is closed to them, whatever their role says. */
export const DonorOk = () => SetMetadata(DONOR_OK, true)

export const ALLOW_PW_CHANGE = 'allowPasswordChange'
/** Route stays usable while the user must still change a temporary password. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PW_CHANGE, true)
