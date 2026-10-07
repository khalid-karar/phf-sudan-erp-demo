import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import * as s from './procurement.schemas'
import { ProcurementService } from './procurement.service'

@Controller('procurement')
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  @Perm('supply', 'view') @Get()
  list(@CurrentUser() u: AuthUser, @Query(new Zod(s.listQuery)) q: z.infer<typeof s.listQuery>) { return this.svc.list(u, q) }
  @Perm('supply', 'view') @Get(':id')
  one(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.one(u, id) }
  @Perm('supply', 'edit') @Post()
  create(@CurrentUser() u: AuthUser, @Body(new Zod(s.createBody)) b: z.infer<typeof s.createBody>) { return this.svc.create(u, b) }
  @Perm('supply', 'edit') @Put(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.updateBody)) b: z.infer<typeof s.updateBody>) { return this.svc.update(u, id, b) }
  @Perm('supply', 'edit') @Post(':id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.cancel(u, id) }
}
