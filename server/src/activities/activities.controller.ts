import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { ExcelService } from './excel.service'
import { ActivitiesService, activityBody, activityQuery, reportBody } from './activities.service'

@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly svc: ActivitiesService,
    private readonly excel: ExcelService,
  ) {}

  /** The office's offline template (.xlsx). `sample=1` fills in example rows, for training. */
  @Perm('activities', 'view')
  @Get('excel/template')
  async template(@CurrentUser() u: AuthUser, @Query('officeId') officeId: string | undefined, @Query('sample') sample: string | undefined, @Res() res: Response) {
    const t = await this.excel.template(u, officeId, sample === '1')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${t.fileName}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(t.buf)
  }

  /** Reads a filled-in template. `dryRun=1` only checks it; without it the good rows are filed as reports. */
  @Perm('activities', 'edit')
  @Post('excel/import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  import(@CurrentUser() u: AuthUser, @UploadedFile() file: { buffer: Buffer } | undefined, @Query('dryRun') dryRun: string | undefined) {
    return this.excel.import(u, file, dryRun === '1')
  }

  @Perm('activities', 'view')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new Zod(activityQuery)) q: z.infer<typeof activityQuery>) {
    return this.svc.list(u, q)
  }

  @Perm('activities', 'view')
  @Get('matching')
  matching(@CurrentUser() u: AuthUser) {
    return this.svc.matching(u)
  }

  @Perm('activities', 'view')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id)
  }

  @Perm('activities', 'edit')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new Zod(activityBody)) b: z.infer<typeof activityBody>) {
    return this.svc.create(u, b)
  }

  @Perm('activities', 'edit')
  @Post(':id/report')
  report(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(reportBody)) b: z.infer<typeof reportBody>) {
    return this.svc.submitReport(u, id, b)
  }
}
