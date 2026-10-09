import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { checkBody, controlBody, linkBody, linePatch, projectBody } from './budget.schemas'
import { BudgetService } from './budget.service'
import { IceService, iceFields, previewFields } from './ice.service'
import { NATURES } from './natures'

@Controller('projects')
export class BudgetController {
  constructor(
    private readonly budget: BudgetService,
    private readonly ice: IceService,
  ) {}

  /** Reads a donor budget file and says what it would create. Nothing is saved. */
  @Perm('projects', 'manage')
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  importPreview(@UploadedFile() file: { buffer: Buffer } | undefined, @Body(new Zod(previewFields)) b: z.infer<typeof previewFields>) {
    return this.ice.preview(file, b.donorId)
  }

  /** Creates the project, its activities and budget lines from a donor budget file, and keeps the file with the project. */
  @Perm('projects', 'manage')
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  importFile(@CurrentUser() u: AuthUser, @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined, @Body(new Zod(iceFields)) b: z.infer<typeof iceFields>) {
    return this.ice.import(u, file, b)
  }

  @Perm('projects', 'view')
  @Get('natures')
  natures() {
    return NATURES
  }

  @Perm('projects', 'view')
  @Get()
  list() {
    return this.budget.list()
  }

  @Perm('projects', 'view')
  @Get('tree')
  trees() {
    return this.budget.trees()
  }

  @Perm('projects', 'view')
  @Get('expenses')
  expenses(@CurrentUser() u: AuthUser) {
    return this.budget.expenses(u)
  }

  /** Declared before `:id` routes so "expenses" is not read as a project id. */
  @Perm('activities', 'edit')
  @Post('expenses/:lineId/link')
  link(@CurrentUser() u: AuthUser, @Param('lineId', new ParseIntPipe()) lineId: number, @Body(new Zod(linkBody)) b: z.infer<typeof linkBody>) {
    return this.budget.linkExpense(u, lineId, b.activityId)
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
