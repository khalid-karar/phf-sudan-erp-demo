import { Module } from '@nestjs/common'
import { ReportsModule } from '../reports/reports.module'
import { DonorsService } from './donors.service'
import { DonorPortalController, DonorsController, ProgrammeController, ProjectReportsController } from './programme.controller'
import { ProgrammeService } from './programme.service'
import { ProjectReportsService } from './project-reports.service'

@Module({
  imports: [ReportsModule],
  controllers: [ProjectReportsController, ProgrammeController, DonorsController, DonorPortalController],
  providers: [ProgrammeService, ProjectReportsService, DonorsService],
})
export class ProgrammeModule {}
