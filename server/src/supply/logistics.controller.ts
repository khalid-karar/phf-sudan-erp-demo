import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { LogisticsService } from './logistics.service'
import * as s from './supply.schemas'

@Controller('logistics')
export class LogisticsController {
  constructor(private readonly svc: LogisticsService) {}

  @Perm('logistics', 'view') @Get('vehicles')
  list(@CurrentUser() u: AuthUser) { return this.svc.list(u) }
  @Perm('logistics', 'view') @Get('consumption')
  consumption(@CurrentUser() u: AuthUser) { return this.svc.consumption(u) }
  @Perm('logistics', 'view') @Get('vehicles/:id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id) }
  @Perm('logistics', 'manage') @Post('vehicles')
  create(@CurrentUser() u: AuthUser, @Body(new Zod(s.vehicleBody)) b: z.infer<typeof s.vehicleBody>) { return this.svc.create(u, b) }
  @Perm('logistics', 'edit') @Patch('vehicles/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.vehiclePatch)) b: z.infer<typeof s.vehiclePatch>) { return this.svc.update(u, id, b) }
  @Perm('logistics', 'edit') @Post('vehicles/:id/fuel')
  fuel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.fuelBody)) b: z.infer<typeof s.fuelBody>) { return this.svc.addFuel(u, id, b) }
}
