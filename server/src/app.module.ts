import { Controller, Get, Inject, Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { sql } from 'drizzle-orm'
import { AuthModule } from './auth/auth.module'
import { Public } from './auth/decorators'
import { env } from './config/env'
import { AllExceptionsFilter } from './common/http-exception.filter'
import type { Db } from './db/client'
import { DB, DbModule } from './db/db.module'
import { OrgModule } from './org/org.module'
import { BudgetModule } from './budget/budget.module'
import { ApprovalsModule } from './approvals/approvals.module'
import { LedgerModule } from './ledger/ledger.module'
import { ActivitiesModule } from './activities/activities.module'
import { SupplyModule } from './supply/supply.module'

@Controller('health')
class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Public()
  @Get()
  async health() {
    await this.db.execute(sql`select 1`)
    return { ok: true, time: new Date().toISOString() }
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => env().NODE_ENV === 'test' }), DbModule, AuthModule, OrgModule, BudgetModule, ApprovalsModule, LedgerModule, ActivitiesModule, SupplyModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
