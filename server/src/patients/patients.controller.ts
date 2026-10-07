import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import * as s from './patients.schemas'
import { PatientsService } from './patients.service'

@Controller('patients')
export class PatientsController {
  constructor(private readonly svc: PatientsService) {}

  @Perm('patients', 'view') @Get('stats')
  stats(@CurrentUser() u: AuthUser, @Query(new Zod(s.statsQuery)) q: z.infer<typeof s.statsQuery>) { return this.svc.stats(u, q) }
  @Perm('patients', 'edit') @Get('duplicates')
  duplicates(@Query(new Zod(s.duplicateQuery)) q: z.infer<typeof s.duplicateQuery>) { return this.svc.duplicates(q) }
  @Perm('patients', 'view') @Get()
  list(@CurrentUser() u: AuthUser, @Query(new Zod(s.beneficiaryQuery)) q: z.infer<typeof s.beneficiaryQuery>) { return this.svc.list(u, q) }
  @Perm('patients', 'view') @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id) }
  @Perm('patients', 'edit') @Post()
  register(@CurrentUser() u: AuthUser, @Body(new Zod(s.beneficiaryBody)) b: z.infer<typeof s.beneficiaryBody>) { return this.svc.register(u, b) }
  @Perm('patients', 'edit') @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.beneficiaryPatch)) b: z.infer<typeof s.beneficiaryPatch>) { return this.svc.update(u, id, b) }
  @Perm('patients', 'edit') @Post(':id/services')
  addService(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.serviceBody)) b: z.infer<typeof s.serviceBody>) { return this.svc.addService(u, id, b) }
  @Perm('patients', 'manage') @Post(':id/merge')
  merge(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.mergeBody)) b: z.infer<typeof s.mergeBody>) { return this.svc.merge(u, id, b) }
}
