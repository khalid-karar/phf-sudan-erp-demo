import { KickNotifications } from '../notifications/kick.interceptor'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseInterceptors } from '@nestjs/common'
import { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { positiveMoney, Zod } from '../common/zod'
import { decisionBody, listQuery, reallocationBody, requestBody, ruleBody } from './approvals.schemas'
import { ApprovalsService } from './approvals.service'

const previewQuery = z.object({ kind: z.enum(['spend', 'reallocation']).default('spend'), amountUsd: positiveMoney, officeId: z.string().optional() })
const reallocQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional(), projectId: z.string().optional() })

@UseInterceptors(KickNotifications)
@Controller()
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  // Rules
  @Perm('projects', 'view')
  @Get('approval-rules')
  rules() {
    return this.svc.rules()
  }

  @Perm('projects', 'view')
  @Get('approval-rules/preview')
  preview(@Query(new Zod(previewQuery)) q: z.infer<typeof previewQuery>) {
    return this.svc.preview(q.kind, q.amountUsd, q.officeId ?? null)
  }

  @Perm('settings', 'edit')
  @Post('approval-rules')
  createRule(@CurrentUser() u: AuthUser, @Body(new Zod(ruleBody)) b: z.infer<typeof ruleBody>) {
    return this.svc.saveRule(u, null, b)
  }

  @Perm('settings', 'edit')
  @Put('approval-rules/:id')
  updateRule(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(ruleBody)) b: z.infer<typeof ruleBody>) {
    return this.svc.saveRule(u, id, b)
  }

  @Perm('settings', 'edit')
  @Delete('approval-rules/:id')
  @HttpCode(204)
  async deleteRule(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.svc.deleteRule(u, id)
  }

  // Spend requests
  @Perm('projects', 'view')
  @Get('requests')
  list(@CurrentUser() u: AuthUser, @Query(new Zod(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.listRequests(u, q)
  }

  @Perm('projects', 'edit')
  @Post('requests')
  create(@CurrentUser() u: AuthUser, @Body(new Zod(requestBody)) b: z.infer<typeof requestBody>) {
    return this.svc.createRequest(u, b)
  }

  @Perm('projects', 'view')
  @Get('requests/:id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getRequest(u, id)
  }

  @Perm('projects', 'view')
  @Post('requests/:id/decision')
  @HttpCode(200)
  decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(decisionBody)) b: z.infer<typeof decisionBody>) {
    return this.svc.decideRequest(u, id, b.decision, b.note)
  }

  @Perm('projects', 'edit')
  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.cancelRequest(u, id)
  }

  // Reallocations
  @Perm('projects', 'view')
  @Get('reallocations')
  reallocations(@Query(new Zod(reallocQuery)) q: z.infer<typeof reallocQuery>) {
    return this.svc.listReallocations(q)
  }

  @Perm('projects', 'edit')
  @Post('reallocations')
  createReallocation(@CurrentUser() u: AuthUser, @Body(new Zod(reallocationBody)) b: z.infer<typeof reallocationBody>) {
    return this.svc.createReallocation(u, b)
  }

  @Perm('projects', 'view')
  @Post('reallocations/:id/decision')
  @HttpCode(200)
  decideReallocation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(decisionBody)) b: z.infer<typeof decisionBody>) {
    return this.svc.decideReallocation(u, id, b.decision, b.note)
  }

  // Inbox
  @Perm('projects', 'view')
  @Get('approvals/inbox')
  inbox(@CurrentUser() u: AuthUser) {
    return this.svc.inbox(u)
  }
}
