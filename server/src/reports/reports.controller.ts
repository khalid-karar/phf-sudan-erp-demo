import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { period as periodSchema } from '../common/zod'
import { Zod } from '../common/zod'
import * as s from './reports.schemas'
import { ReportsService } from './reports.service'

const P = new Zod(periodSchema)

@Controller()
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Perm('reports', 'view') @Get('reports/monthly')
  monthly(@CurrentUser() u: AuthUser, @Query(new Zod(s.periodQuery)) q: z.infer<typeof s.periodQuery>) { return this.svc.monthly(u, q.period) }

  @Perm('reports', 'edit') @Put('reports/hq/:period/draft')
  saveDraft(@CurrentUser() u: AuthUser, @Param('period', P) period: string, @Body(new Zod(s.draftBody)) b: z.infer<typeof s.draftBody>) { return this.svc.saveDraft(u, period, b) }
  @Perm('reports', 'edit') @Post('reports/hq/:period/approve')
  approve(@CurrentUser() u: AuthUser, @Param('period', P) period: string) { return this.svc.approve(u, period) }

  @Perm('reports', 'view') @Get('reports/delivery')
  delivery(@CurrentUser() u: AuthUser, @Query(new Zod(s.deliveryQuery)) q: z.infer<typeof s.deliveryQuery>) { return this.svc.delivery(u, q) }
  @Perm('reports', 'edit') @Post('reports/send')
  send(@CurrentUser() u: AuthUser, @Body(new Zod(s.sendBody)) b: z.infer<typeof s.sendBody>) { return this.svc.send(u, b) }
  @Perm('reports', 'view') @Get('reports/sent')
  sent(@CurrentUser() u: AuthUser, @Query(new Zod(s.sentQuery)) q: z.infer<typeof s.sentQuery>) { return this.svc.sent(u, q) }

  @Perm('reports', 'view') @Get('report-settings')
  settings() { return this.svc.settings() }
  @Perm('settings', 'edit') @Put('report-settings')
  save(@CurrentUser() u: AuthUser, @Body(new Zod(s.settingsBody)) b: z.infer<typeof s.settingsBody>) { return this.svc.saveSettings(u, b) }
}
