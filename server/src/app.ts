import 'reflect-metadata'
import { type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { env } from './config/env'

/** Builds the HTTP app (shared by main.ts and the tests). */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const e = env()
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: opts.logger === false ? false : ['error', 'warn', 'log'] })
  if (e.TRUST_PROXY) app.set('trust proxy', 1)
  app.use(helmet())
  app.useBodyParser('json', { limit: '2mb' })
  app.enableCors({ origin: e.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: false })
  app.setGlobalPrefix('api/v1', { exclude: ['health'] })
  app.enableShutdownHooks()
  return app
}
