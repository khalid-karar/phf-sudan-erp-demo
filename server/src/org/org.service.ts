import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { hashPassword } from '../auth/passwords'
import { audit } from '../common/audit'
import { conflict, notFound, unprocessable } from '../common/errors'
import type { Db, DbOrTx } from '../db/client'
import { DB } from '../db/db.module'
import { accounts, ledgerAccounts, offices, orgSettings, refreshTokens, roles, users } from '../db/schema'
import type { officeBody, officePatch, roleBody, rolePatch, settingsBody, userBody, userPatch } from './org.schemas'

const publicUser = {
  id: users.id,
  email: users.email,
  nameAr: users.nameAr,
  nameEn: users.nameEn,
  phone: users.phone,
  roleId: users.roleId,
  officeId: users.officeId,
  active: users.active,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
}

/** Serialises changes that could remove the last settings manager (two admins demoting each other at once). */
const lockAdminGuard = (tx: DbOrTx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('admin-guard'))`)

/** A readable temporary password, e.g. "Phf-7k2m-9qxa". */
const tempPassword = () => `Phf-${randomBytes(3).toString('hex').slice(0, 4)}-${randomBytes(3).toString('hex').slice(0, 4)}1`

@Injectable()
export class OrgService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ── Settings ──
  async settings() {
    const [s] = await this.db.select().from(orgSettings).where(eq(orgSettings.id, 1))
    return s ?? null
  }

  async saveSettings(user: AuthUser, b: z.infer<typeof settingsBody>) {
    return this.db.transaction(async (tx) => {
      const [s] = await tx
        .insert(orgSettings)
        .values({ id: 1, ...b })
        .onConflictDoUpdate({ target: orgSettings.id, set: { ...b, updatedAt: new Date() } })
        .returning()
      await audit(tx, user, 'settings.update', 'org_settings', '1', b)
      return s
    })
  }

  // ── Offices ──
  listOffices() {
    return this.db.select().from(offices).orderBy(asc(offices.type), asc(offices.nameEn))
  }

  private async checkManager(tx: DbOrTx, managerId: string | null | undefined) {
    if (!managerId) return
    const [u] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, managerId), eq(users.active, true)))
    if (!u) throw unprocessable('UNKNOWN_USER', { ar: 'مدير المكتب غير موجود أو غير نشط', en: 'The office manager does not exist or is not active' })
  }

  async createOffice(user: AuthUser, b: z.infer<typeof officeBody>) {
    return this.db.transaction(async (tx) => {
      await this.checkManager(tx, b.managerId)
      const [o] = await tx.insert(offices).values(b).returning()
      // Every office gets its own SDG cash box in the chart of accounts.
      const [key] = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.key, 'cash_boxes'))
      if (key && o.type !== 'warehouse') {
        const kids = await tx.select({ code: accounts.code }).from(accounts).where(eq(accounts.parentCode, key.accountCode))
        const next = Math.max(0, ...kids.map((k) => Number(k.code.split('-').pop()) || 0)) + 1
        await tx.insert(accounts).values({ code: `${key.accountCode}-${String(next).padStart(2, '0')}`, parentCode: key.accountCode, nameAr: `صندوق مكتب ${o.nameAr}`, nameEn: `${o.nameEn} cash box`, type: 'asset', currency: 'SDG', officeId: o.id })
      }
      await audit(tx, user, 'office.create', 'office', o.id, b)
      return o
    })
  }

  async updateOffice(user: AuthUser, id: string, b: z.infer<typeof officePatch>) {
    return this.db.transaction(async (tx) => {
      if (b.active === false) {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.officeId, id), eq(users.active, true)))
        if (n > 0) throw conflict('OFFICE_HAS_USERS', { ar: `لا يمكن إيقاف المكتب: عليه ${n} مستخدمين نشطين`, en: `Cannot deactivate: ${n} active users belong to this office` })
      }
      await this.checkManager(tx, b.managerId)
      const [o] = await tx.update(offices).set(b).where(eq(offices.id, id)).returning()
      if (!o) throw notFound({ ar: 'المكتب', en: 'Office' })
      await audit(tx, user, 'office.update', 'office', id, b)
      return o
    })
  }

  // ── Roles ──
  async listRoles() {
    const rows = await this.db
      .select({ role: roles, users: sql<number>`(select count(*)::int from users u where u.role_id = ${roles.id} and u.active)` })
      .from(roles)
      .orderBy(asc(roles.nameEn))
    return rows.map((r) => ({ ...r.role, activeUsers: r.users }))
  }

  async createRole(user: AuthUser, b: z.infer<typeof roleBody>) {
    return this.db.transaction(async (tx) => {
      const [r] = await tx.insert(roles).values({ ...b, system: false }).returning()
      await audit(tx, user, 'role.create', 'role', r.id, b)
      return r
    })
  }

  async updateRole(user: AuthUser, id: string, b: z.infer<typeof rolePatch>) {
    return this.db.transaction(async (tx) => {
      await lockAdminGuard(tx)
      const [r] = await tx.update(roles).set({ ...b, updatedAt: new Date() }).where(eq(roles.id, id)).returning()
      if (!r) throw notFound({ ar: 'الدور', en: 'Role' })
      await this.assertAnAdminRemains(tx)
      await audit(tx, user, 'role.update', 'role', id, b)
      return r
    })
  }

  async deleteRole(user: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(roles).where(eq(roles.id, id))
      if (!r) throw notFound({ ar: 'الدور', en: 'Role' })
      if (r.system) throw conflict('SYSTEM_ROLE', { ar: 'لا يمكن حذف دور أساسي في النظام', en: 'Built-in roles cannot be deleted' })
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.roleId, id))
      if (n > 0) throw conflict('ROLE_IN_USE', { ar: `انقل المستخدمين (${n}) إلى دور آخر أولاً`, en: `Move its ${n} users to another role first` })
      await tx.delete(roles).where(eq(roles.id, id))
      await audit(tx, user, 'role.delete', 'role', id)
    })
  }

  // ── Users ──
  directory() {
    return this.db
      .select({ id: users.id, email: users.email, nameAr: users.nameAr, nameEn: users.nameEn, roleId: users.roleId, officeId: users.officeId, active: users.active })
      .from(users)
      .orderBy(asc(users.nameEn))
  }

  listUsers() {
    return this.db.select(publicUser).from(users).orderBy(asc(users.nameEn))
  }

  async createUser(user: AuthUser, b: z.infer<typeof userBody>) {
    const temp = b.password ? null : tempPassword()
    const passwordHash = await hashPassword(b.password ?? temp!)
    return this.db.transaction(async (tx) => {
      const { password: _p, ...rest } = b
      void _p
      const [u] = await tx
        .insert(users)
        .values({ ...rest, passwordHash, mustChangePassword: !b.password })
        .returning(publicUser)
      await audit(tx, user, 'user.create', 'user', u.id, { email: u.email, roleId: u.roleId, officeId: u.officeId })
      return { ...u, temporaryPassword: temp }
    })
  }

  async updateUser(user: AuthUser, id: string, b: z.infer<typeof userPatch>) {
    if (id === user.id && (b.active === false || (b.roleId && b.roleId !== user.roleId)))
      throw unprocessable('SELF_LOCKOUT', { ar: 'لا يمكنك إيقاف حسابك أو تغيير دورك بنفسك', en: 'You cannot deactivate yourself or change your own role' })
    return this.db.transaction(async (tx) => {
      await lockAdminGuard(tx)
      const [u] = await tx.update(users).set({ ...b, updatedAt: new Date() }).where(eq(users.id, id)).returning(publicUser)
      if (!u) throw notFound({ ar: 'المستخدم', en: 'User' })
      if (b.active === false) await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, id))
      await this.assertAnAdminRemains(tx)
      await audit(tx, user, 'user.update', 'user', id, b)
      return u
    })
  }

  async resetPassword(user: AuthUser, id: string) {
    const temp = tempPassword()
    const passwordHash = await hashPassword(temp)
    return this.db.transaction(async (tx) => {
      const [u] = await tx.update(users).set({ passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id })
      if (!u) throw notFound({ ar: 'المستخدم', en: 'User' })
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, id))
      await audit(tx, user, 'user.reset_password', 'user', id)
      return { temporaryPassword: temp }
    })
  }

  /** Someone must always be able to manage settings, or the organisation is locked out. */
  private async assertAnAdminRemains(tx: DbOrTx) {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(users.active, true), sql`${roles.permissions}->>'settings' = 'manage'`))
    if (n === 0) throw unprocessable('LAST_ADMIN', { ar: 'يجب أن يبقى مستخدم نشط واحد على الأقل يدير الإعدادات', en: 'At least one active user must keep settings management access' })
  }
}
