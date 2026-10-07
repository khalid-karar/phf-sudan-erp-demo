import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import { officeBody, officePatch, roleBody, rolePatch, settingsBody, userBody, userPatch } from './org.schemas'
import { OrgService } from './org.service'

@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('org/settings')
  settings() {
    return this.org.settings()
  }

  @Perm('settings', 'manage')
  @Put('org/settings')
  saveSettings(@CurrentUser() u: AuthUser, @Body(new Zod(settingsBody)) b: z.infer<typeof settingsBody>) {
    return this.org.saveSettings(u, b)
  }

  // Every signed-in user needs the office list for forms and maps.
  @Get('offices')
  offices() {
    return this.org.listOffices()
  }

  @Perm('settings', 'manage')
  @Post('offices')
  createOffice(@CurrentUser() u: AuthUser, @Body(new Zod(officeBody)) b: z.infer<typeof officeBody>) {
    return this.org.createOffice(u, b)
  }

  @Perm('settings', 'manage')
  @Patch('offices/:id')
  updateOffice(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(officePatch)) b: z.infer<typeof officePatch>) {
    return this.org.updateOffice(u, id, b)
  }

  // Role names are needed to show approval chains; permission details are harmless to read.
  @Get('roles')
  roles() {
    return this.org.listRoles()
  }

  @Perm('settings', 'manage')
  @Post('roles')
  createRole(@CurrentUser() u: AuthUser, @Body(new Zod(roleBody)) b: z.infer<typeof roleBody>) {
    return this.org.createRole(u, b)
  }

  @Perm('settings', 'manage')
  @Patch('roles/:id')
  updateRole(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(rolePatch)) b: z.infer<typeof rolePatch>) {
    return this.org.updateRole(u, id, b)
  }

  @Perm('settings', 'manage')
  @Delete('roles/:id')
  @HttpCode(204)
  async deleteRole(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.org.deleteRole(u, id)
  }

  // Names for showing who asked, approved or reported; no phone numbers or sign-in details.
  @Get('users/directory')
  directory() {
    return this.org.directory()
  }

  @Perm('settings', 'manage')
  @Get('users')
  users() {
    return this.org.listUsers()
  }

  @Perm('settings', 'manage')
  @Post('users')
  createUser(@CurrentUser() u: AuthUser, @Body(new Zod(userBody)) b: z.infer<typeof userBody>) {
    return this.org.createUser(u, b)
  }

  @Perm('settings', 'manage')
  @Patch('users/:id')
  updateUser(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(userPatch)) b: z.infer<typeof userPatch>) {
    return this.org.updateUser(u, id, b)
  }

  @Perm('settings', 'manage')
  @Post('users/:id/reset-password')
  resetPassword(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.org.resetPassword(u, id)
  }
}
