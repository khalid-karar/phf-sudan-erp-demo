/**
 * First-run setup for a real installation (no demo data): organisation settings, the HQ office
 * with its cash box, the standard roles, chart of accounts and approval rules, and one
 * administrator with a temporary password. Does nothing if the database already has roles.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=it@kphfs.org node dist/db/bootstrap.js
 */
import { sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../auth/passwords'
import { createDb, createPool, type DbOrTx } from './client'
import defaults from './defaults.json'
import * as t from './schema'
import { DEFAULT_RULES } from '../notifications/events'

export async function bootstrap(db: DbOrTx, o: { adminEmail: string; adminNameAr: string; adminNameEn: string; hqId: string }) {
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from roles`)).rows
  if (n > 0) return { skipped: true as const }

  await db.insert(t.orgSettings).values({
    nameAr: 'صندوق إعانة المرضى — السودان',
    nameEn: 'Patients Helping Fund — Sudan',
    shortNameAr: 'نظام إدارة الموارد',
    shortNameEn: 'Resource Management System',
    hqNameAr: 'المقر الرئيسي — دولة الكويت',
    hqNameEn: 'Headquarters — State of Kuwait',
  })
  await db.insert(t.offices).values({ id: o.hqId, nameAr: 'الرئاسة — الخرطوم', nameEn: 'HQ — Khartoum', stateAr: 'الخرطوم', stateEn: 'Khartoum', type: 'hq', lat: 15.5, lon: 32.56 })
  await db.insert(t.roles).values(defaults.roles as (typeof t.roles.$inferInsert)[])
  await db.insert(t.accounts).values(defaults.accounts as (typeof t.accounts.$inferInsert)[])
  await db.insert(t.accounts).values({ code: '1101-01', parentCode: '1101', nameAr: 'صندوق الرئاسة', nameEn: 'HQ cash box', type: 'asset', currency: 'SDG', officeId: o.hqId })
  await db.insert(t.ledgerAccounts).values(Object.entries(defaults.systemAccounts).map(([key, accountCode]) => ({ key, accountCode })))
  await db.insert(t.approvalRules).values(defaults.rules as (typeof t.approvalRules.$inferInsert)[])
  await db.insert(t.notifRules).values(DEFAULT_RULES)

  const temporaryPassword = `Phf-${randomBytes(4).toString('hex')}9`
  await db.insert(t.users).values({
    email: o.adminEmail.toLowerCase(),
    nameAr: o.adminNameAr,
    nameEn: o.adminNameEn,
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
    roleId: 'admin',
    officeId: o.hqId,
  })
  return { skipped: false as const, adminEmail: o.adminEmail, temporaryPassword }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL
  if (!url || !adminEmail) throw new Error('Set DATABASE_URL and BOOTSTRAP_ADMIN_EMAIL')
  const pool = createPool(url)
  createDb(pool)
    .transaction((tx) =>
      bootstrap(tx, {
        adminEmail,
        adminNameAr: process.env.BOOTSTRAP_ADMIN_NAME_AR ?? 'مدير النظام',
        adminNameEn: process.env.BOOTSTRAP_ADMIN_NAME_EN ?? 'System administrator',
        hqId: process.env.BOOTSTRAP_HQ_ID ?? 'khr',
      }),
    )
    .then((r) => {
      if (r.skipped) console.log('Database already set up — nothing to do.')
      else console.log(`Set up done. Sign in as ${r.adminEmail} with the temporary password: ${r.temporaryPassword}\nYou will be asked to change it.`)
    })
    .catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
