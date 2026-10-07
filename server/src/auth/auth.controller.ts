import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { z } from 'zod'
import { Zod } from '../common/zod'
import type { AuthUser } from './auth-user'
import { AuthService } from './auth.service'
import { AllowPendingPasswordChange, CurrentUser, Public } from './decorators'
import { passwordRule } from './passwords'

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1).max(200) })
const refreshBody = z.object({ refreshToken: z.string().min(10) })
const changeBody = z.object({ currentPassword: z.string().min(1), newPassword: passwordRule })

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body(new Zod(loginBody)) b: z.infer<typeof loginBody>, @Req() req: Request) {
    return this.auth.login(b.email, b.password, { ip: req.ip, userAgent: req.headers['user-agent'] })
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new Zod(refreshBody)) b: z.infer<typeof refreshBody>, @Req() req: Request) {
    return this.auth.refresh(b.refreshToken, req.headers['user-agent'])
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new Zod(refreshBody)) b: z.infer<typeof refreshBody>) {
    await this.auth.logout(b.refreshToken)
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u)
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(204)
  async change(@CurrentUser() u: AuthUser, @Body(new Zod(changeBody)) b: z.infer<typeof changeBody>) {
    await this.auth.changePassword(u, b.currentPassword, b.newPassword)
  }
}
