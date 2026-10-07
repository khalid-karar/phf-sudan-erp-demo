import { Module } from '@nestjs/common'
import { ActivitiesController } from './activities.controller'
import { ExcelService } from './excel.service'
import { ActivitiesService } from './activities.service'

@Module({ controllers: [ActivitiesController], providers: [ActivitiesService, ExcelService] })
export class ActivitiesModule {}
