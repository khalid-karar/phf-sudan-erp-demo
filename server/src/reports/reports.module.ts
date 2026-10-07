import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ExpenditureService } from './expenditure.service'
import { StatementService } from './statement.service'
import { ReportsService } from './reports.service'

@Module({ controllers: [ReportsController], providers: [ReportsService, ExpenditureService, StatementService] })
export class ReportsModule {}
