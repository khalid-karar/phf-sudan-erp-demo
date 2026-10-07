import { Module } from '@nestjs/common'
import { LogisticsController } from './logistics.controller'
import { LogisticsService } from './logistics.service'
import { SupplyController } from './supply.controller'
import { SupplyService } from './supply.service'

@Module({ controllers: [SupplyController, LogisticsController], providers: [SupplyService, LogisticsService] })
export class SupplyModule {}
