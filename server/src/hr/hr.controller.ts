import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import * as s from './hr.schemas'
import { HrService } from './hr.service'

@Controller('hr')
export class HrController {
  constructor(private readonly svc: HrService) {}

  /** Any signed-in user: their own employee record (balance, office, position). */
  @Get('me')
  me(@CurrentUser() u: AuthUser) { return this.svc.me(u) }

  @Perm('hr', 'view') @Get('employees')
  list(@CurrentUser() u: AuthUser, @Query(new Zod(s.employeeQuery)) q: z.infer<typeof s.employeeQuery>) { return this.svc.list(u, q) }
  @Perm('hr', 'view') @Get('employees/:id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id) }
  @Perm('hr', 'edit') @Post('employees')
  create(@CurrentUser() u: AuthUser, @Body(new Zod(s.employeeBody)) b: z.infer<typeof s.employeeBody>) { return this.svc.create(u, b) }
  @Perm('hr', 'edit') @Patch('employees/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.employeePatch)) b: z.infer<typeof s.employeePatch>) { return this.svc.update(u, id, b) }

  // Leave: listing and requesting work for anyone with a linked employee record (their own leave).
  @Get('leave')
  leave(@CurrentUser() u: AuthUser, @Query(new Zod(s.leaveQuery)) q: z.infer<typeof s.leaveQuery>) { return this.svc.listLeave(u, q) }
  @Post('leave')
  request(@CurrentUser() u: AuthUser, @Body(new Zod(s.leaveBody)) b: z.infer<typeof s.leaveBody>) { return this.svc.requestLeave(u, b) }
  @Perm('hr', 'edit') @Post('leave/:id/decision')
  decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.leaveDecision)) b: z.infer<typeof s.leaveDecision>) { return this.svc.decideLeave(u, id, b) }
  @Post('leave/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.cancelLeave(u, id) }

  @Perm('hr', 'view') @Get('payroll')
  payroll(@CurrentUser() u: AuthUser) { return this.svc.listPayroll(u) }
  @Perm('hr', 'view') @Get('payroll/preview')
  preview(@CurrentUser() u: AuthUser, @Query(new Zod(s.payrollPreviewQuery)) q: z.infer<typeof s.payrollPreviewQuery>) { return this.svc.previewPayroll(u, q.period) }
  @Perm('hr', 'manage') @Post('payroll')
  post(@CurrentUser() u: AuthUser, @Body(new Zod(s.payrollBody)) b: z.infer<typeof s.payrollBody>) { return this.svc.postPayroll(u, b) }
  @Perm('hr', 'manage') @Post('payroll/:id/void')
  voidRun(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.voidBody)) b: z.infer<typeof s.voidBody>) { return this.svc.voidPayroll(u, id, b) }
}
