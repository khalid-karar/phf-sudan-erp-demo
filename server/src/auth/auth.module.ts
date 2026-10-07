import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { env } from '../config/env'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

@Module({
  imports: [JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: env().JWT_SECRET, signOptions: { algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } }) })],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
