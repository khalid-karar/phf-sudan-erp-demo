import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser } from '../auth/decorators'
import { Zod } from '../common/zod'
import { env } from '../config/env'
import { AttachmentsService, ownerQuery, uploadFields } from './attachments.service'

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  // Permission is checked inside, against the record the file belongs to (its module and its office).
  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new Zod(ownerQuery)) q: z.infer<typeof ownerQuery>) {
    return this.svc.list(u, q)
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: env().MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: { originalname: string; buffer: Buffer; size: number } | undefined, @Body(new Zod(uploadFields)) b: z.infer<typeof uploadFields>) {
    return this.svc.upload(u, b, file)
  }

  @Get(':id/file')
  async file(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('download') download: string | undefined, @Res() res: Response) {
    const { meta, stream } = await this.svc.open(u, id)
    const name = encodeURIComponent(meta.fileName)
    res.setHeader('Content-Type', meta.mime)
    res.setHeader('Content-Length', String(meta.size))
    res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Cache-Control', 'private, max-age=300')
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id)
  }
}
