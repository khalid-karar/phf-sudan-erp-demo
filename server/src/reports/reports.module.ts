import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ExpenditureService } from './expenditure.service'
import { ReportsService } from './reports.service'

@Module({ controllers: [ReportsController], providers: [ReportsService, ExpenditureService] })
export class ReportsModule {}
