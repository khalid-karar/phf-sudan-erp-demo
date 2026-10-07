import { Module } from '@nestjs/common'
import { BudgetController } from './budget.controller'
import { IceService } from './ice.service'
import { BudgetService } from './budget.service'

@Module({ controllers: [BudgetController], providers: [BudgetService, IceService], exports: [BudgetService] })
export class BudgetModule {}
