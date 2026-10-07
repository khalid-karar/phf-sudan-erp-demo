import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { CHANNELS, type Channel } from './channels'
import * as s from './notifications.schemas'
import { NotificationsService } from './notifications.service'

const channel = (c: string): Channel => {
  if (!(CHANNELS as string[]).includes(c)) throw new BadRequestException({ code: 'VALIDATION', message: { ar: 'قناة غير معروفة', en: 'Unknown channel' } })
  return c as Channel
}

@Controller()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // A person's own alerts (no special permission: everyone has an inbox).
  @Get('notifications')
  inbox(@CurrentUser() u: AuthUser, @Query(new Zod(s.inboxQuery)) q: z.infer<typeof s.inboxQuery>) { return this.svc.inbox(u, q) }
  @Get('notifications/unread-count')
  unread(@CurrentUser() u: AuthUser) { return this.svc.unreadCount(u) }
  @Post('notifications/read-all')
  readAll(@CurrentUser() u: AuthUser) { return this.svc.markAllRead(u) }
  @Post('notifications/:id/read')
  read(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.markRead(u, id) }

  @Perm('alerts', 'view') @Get('notification-rules')
  rules() { return this.svc.listRules() }
  @Perm('settings', 'edit') @Post('notification-rules')
  createRule(@CurrentUser() u: AuthUser, @Body(new Zod(s.ruleBody)) b: z.infer<typeof s.ruleBody>) { return this.svc.createRule(u, b) }
  @Perm('settings', 'edit') @Patch('notification-rules/:id')
  updateRule(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.rulePatch)) b: z.infer<typeof s.rulePatch>) { return this.svc.updateRule(u, id, b) }
  @Perm('settings', 'edit') @Delete('notification-rules/:id')
  deleteRule(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteRule(u, id) }
  @Perm('settings', 'manage') @Post('notification-rules/run')
  run() { return this.svc.runNow() }
  @Perm('settings', 'view') @Get('deliveries')
  deliveries(@Query(new Zod(s.deliveryQuery)) q: z.infer<typeof s.deliveryQuery>) { return this.svc.deliveryLog(q) }

  @Perm('alerts', 'view') @Get('deadlines')
  deadlines(@Query(new Zod(s.deadlineQuery)) q: z.infer<typeof s.deadlineQuery>) { return this.svc.listDeadlines(q) }
  @Perm('alerts', 'edit') @Post('deadlines')
  createDeadline(@CurrentUser() u: AuthUser, @Body(new Zod(s.deadlineBody)) b: z.infer<typeof s.deadlineBody>) { return this.svc.createDeadline(u, b) }
  @Perm('alerts', 'edit') @Patch('deadlines/:id')
  updateDeadline(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.deadlinePatch)) b: z.infer<typeof s.deadlinePatch>) { return this.svc.updateDeadline(u, id, b) }
  @Perm('alerts', 'edit') @Post('deadlines/:id/done')
  done(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.completeDeadline(u, id) }
  @Perm('alerts', 'manage') @Delete('deadlines/:id')
  deleteDeadline(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteDeadline(u, id) }

  @Perm('settings', 'view') @Get('channels')
  channels() { return this.svc.channels() }
  @Perm('settings', 'manage') @Put('channels/:channel')
  save(@CurrentUser() u: AuthUser, @Param('channel') c: string, @Body() b: unknown) { return this.svc.saveChannel(u, channel(c), b) }
  @Perm('settings', 'manage') @Post('channels/:channel/test')
  test(@CurrentUser() u: AuthUser, @Param('channel') c: string, @Body(new Zod(s.channelTestBody)) b: z.infer<typeof s.channelTestBody>) { return this.svc.testChannel(u, channel(c), b) }
}
