import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { checkBody, controlBody, linePatch, projectBody } from './budget.schemas'
import { BudgetService } from './budget.service'

@Controller('projects')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Perm('projects', 'view')
  @Get()
  list() {
    return this.budget.list()
  }

  @Perm('projects', 'view')
  @Get(':id')
  tree(@Param('id') id: string) {
    return this.budget.tree(id)
  }

  @Perm('projects', 'view')
  @Post('check')
  check(@Body(new Zod(checkBody)) b: z.infer<typeof checkBody>) {
    return this.budget.check(b.lineId, b.amountUsd)
  }

  @Perm('projects', 'manage')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new Zod(projectBody)) b: z.infer<typeof projectBody>) {
    return this.budget.create(u, b)
  }

  @Perm('projects', 'manage')
  @Patch(':id/control')
  control(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(controlBody)) b: z.infer<typeof controlBody>) {
    return this.budget.setControl(u, id, b)
  }

  @Perm('projects', 'manage')
  @Patch('lines/:lineId')
  line(@CurrentUser() u: AuthUser, @Param('lineId') id: string, @Body(new Zod(linePatch)) b: z.infer<typeof linePatch>) {
    return this.budget.updateLine(u, id, b)
  }
}
