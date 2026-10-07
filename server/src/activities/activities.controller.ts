import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { ActivitiesService, activityBody, activityQuery, reportBody } from './activities.service'

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}

  @Perm('activities', 'view')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new Zod(activityQuery)) q: z.infer<typeof activityQuery>) {
    return this.svc.list(u, q)
  }

  @Perm('activities', 'view')
  @Get('matching')
  matching(@CurrentUser() u: AuthUser) {
    return this.svc.matching(u)
  }

  @Perm('activities', 'view')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id)
  }

  @Perm('activities', 'edit')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new Zod(activityBody)) b: z.infer<typeof activityBody>) {
    return this.svc.create(u, b)
  }

  @Perm('activities', 'edit')
  @Post(':id/report')
  report(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(reportBody)) b: z.infer<typeof reportBody>) {
    return this.svc.submitReport(u, id, b)
  }
}
