import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, DonorOk, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { donorBody, donorPatch, donorUserBody, DonorsService, linkDonorBody, portalExpQuery, portalQuery } from './donors.service'
import { ProgrammeService } from './programme.service'
import { ProjectReportsService } from './project-reports.service'
import * as s from './programme.schemas'

type B<T extends z.ZodType> = z.infer<T>

/** Project plan: sectors, objectives and indicators, team, milestones and the reporting calendar. */
@Controller('programme')
export class ProgrammeController {
  constructor(private readonly svc: ProgrammeService) {}

  @Perm('projects', 'view') @Get('sectors')
  sectors() { return this.svc.sectorList() }
  @Perm('projects', 'manage') @Post('sectors')
  addSector(@CurrentUser() u: AuthUser, @Body(new Zod(s.sectorBody)) b: B<typeof s.sectorBody>) { return this.svc.createSector(u, b) }

  @Perm('projects', 'view') @Get('projects/:id/plan')
  plan(@Param('id') id: string) { return this.svc.plan(id) }
  @Perm('projects', 'edit') @Put('projects/:id/sectors')
  setSectors(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.sectorsBody)) b: B<typeof s.sectorsBody>) { return this.svc.setSectors(u, id, b) }
  @Perm('projects', 'edit') @Put('projects/:id/team')
  setTeam(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.teamBody)) b: B<typeof s.teamBody>) { return this.svc.setTeam(u, id, b) }
  @Perm('projects', 'edit') @Put('projects/:id/schedule')
  setSchedule(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.scheduleBody)) b: B<typeof s.scheduleBody>) { return this.svc.setSchedule(u, id, b) }
  @Perm('projects', 'edit') @Post('projects/:id/schedule/generate')
  generate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.generate(u, id) }

  @Perm('projects', 'edit') @Post('projects/:id/objectives')
  addObjective(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.objectiveBody)) b: B<typeof s.objectiveBody>) { return this.svc.createObjective(u, id, b) }
  @Perm('projects', 'edit') @Patch('objectives/:id')
  editObjective(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.objectivePatch)) b: B<typeof s.objectivePatch>) { return this.svc.updateObjective(u, id, b) }
  @Perm('projects', 'edit') @Delete('objectives/:id')
  removeObjective(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteObjective(u, id) }
  @Perm('projects', 'edit') @Post('objectives/:id/indicators')
  addIndicator(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.indicatorBody)) b: B<typeof s.indicatorBody>) { return this.svc.createIndicator(u, id, b) }
  @Perm('projects', 'edit') @Patch('indicators/:id')
  editIndicator(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.indicatorPatch)) b: B<typeof s.indicatorPatch>) { return this.svc.updateIndicator(u, id, b) }
  @Perm('projects', 'edit') @Delete('indicators/:id')
  removeIndicator(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteIndicator(u, id) }
  @Perm('activities', 'edit') @Put('activities/:id/objective')
  activityObjective(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.activityObjectiveBody)) b: B<typeof s.activityObjectiveBody>) { return this.svc.setActivityObjective(u, id, b.objectiveId) }

  @Perm('projects', 'view') @Get('milestones')
  milestones(@CurrentUser() u: AuthUser, @Query(new Zod(s.milestoneQuery)) q: B<typeof s.milestoneQuery>) { return this.svc.listMilestones(u, q) }
  @Perm('projects', 'edit') @Post('projects/:id/milestones')
  addMilestone(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.milestoneBody)) b: B<typeof s.milestoneBody>) { return this.svc.createMilestone(u, id, b) }
  @Perm('projects', 'view') @Patch('milestones/:id')
  editMilestone(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.milestonePatch)) b: B<typeof s.milestonePatch>) { return this.svc.updateMilestone(u, id, b) }
  @Perm('projects', 'edit') @Delete('milestones/:id')
  removeMilestone(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteMilestone(u, id) }
}

/** Monthly statistics / narrative / custom reports and the quarterly report, through PMO review. */
@Controller('programme/reports')
export class ProjectReportsController {
  constructor(private readonly svc: ProjectReportsService) {}

  @Perm('reports', 'view') @Get()
  list(@CurrentUser() u: AuthUser, @Query(new Zod(s.reportQuery)) q: B<typeof s.reportQuery>) { return this.svc.list(u, q) }
  @Perm('reports', 'view') @Get('templates')
  templates() { return this.svc.listTemplates() }
  @Perm('reports', 'manage') @Post('templates')
  addTemplate(@CurrentUser() u: AuthUser, @Body(new Zod(s.templateBody)) b: B<typeof s.templateBody>) { return this.svc.createTemplate(u, b) }
  @Perm('reports', 'manage') @Put('templates/:id')
  editTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.templateBody)) b: B<typeof s.templateBody>) { return this.svc.updateTemplate(u, id, b) }

  @Perm('reports', 'view') @Get(':id')
  one(@Param('id') id: string) { return this.svc.get(id) }
  @Perm('reports', 'edit') @Put(':id/content')
  save(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.contentBody)) b: B<typeof s.contentBody>) { return this.svc.saveContent(u, id, b.content) }
  @Perm('reports', 'edit') @Post(':id/submit')
  submit(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.submit(u, id) }
  @Perm('reports', 'manage') @Post(':id/review')
  review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.reviewBody)) b: B<typeof s.reviewBody>) { return this.svc.review(u, id, b) }
  @Perm('reports', 'manage') @Post(':id/release')
  release(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.release(u, id) }
  @Perm('reports', 'manage') @Post(':id/reopen')
  reopen(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.reviewBody.pick({ note: true }))) b: { note?: string }) { return this.svc.reopen(u, id, b.note) }
}

@Controller('donors')
export class DonorsController {
  constructor(private readonly svc: DonorsService) {}

  @Perm('projects', 'view') @Get()
  list() { return this.svc.list() }
  @Perm('settings', 'manage') @Post()
  create(@CurrentUser() u: AuthUser, @Body(new Zod(donorBody)) b: B<typeof donorBody>) { return this.svc.create(u, b) }
  @Perm('settings', 'manage') @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(donorPatch)) b: B<typeof donorPatch>) { return this.svc.update(u, id, b) }
  @Perm('settings', 'manage') @Get(':id/users')
  users(@Param('id') id: string) { return this.svc.listUsers(id) }
  @Perm('settings', 'manage') @Post(':id/users')
  addUser(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(donorUserBody)) b: B<typeof donorUserBody>) { return this.svc.createUser(u, id, b) }
  @Perm('projects', 'edit') @Put('link/:projectId')
  link(@CurrentUser() u: AuthUser, @Param('projectId') projectId: string, @Body(new Zod(linkDonorBody)) b: B<typeof linkDonorBody>) { return this.svc.linkProject(u, projectId, b.donorId) }
}

/** What a donor representative sees: their own projects' released reports, read-only. */
@Controller('donor')
export class DonorPortalController {
  constructor(private readonly svc: DonorsService) {}

  @DonorOk() @Get('me')
  me(@CurrentUser() u: AuthUser) { return this.svc.me(u) }
  @DonorOk() @Get('reports')
  reports(@CurrentUser() u: AuthUser, @Query(new Zod(portalQuery)) q: B<typeof portalQuery>) { return this.svc.reportList(u, q) }
  @DonorOk() @Get('reports/:id')
  report(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.report(u, id) }
  @DonorOk() @Get('reports/:id/expenditure.xlsx')
  async expenditure(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query(new Zod(portalExpQuery)) q: B<typeof portalExpQuery>, @Res() res: Response) {
    const x = await this.svc.expenditure(u, id, q.currency)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${x.fileName}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(x.buf)
  }
}
