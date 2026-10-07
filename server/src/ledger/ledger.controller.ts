import { KickNotifications } from '../notifications/kick.interceptor'
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseInterceptors } from '@nestjs/common'
import { z } from 'zod'
import { scopeOffice, type AuthUser } from '../auth/auth-user'
import { forbidden } from '../common/errors'
import { CurrentUser, Perm } from '../auth/decorators'
import { isoDate, period, Zod } from '../common/zod'
import { AccountsService } from './accounts.service'
import { CloseService } from './close.service'
import {
  accountBody,
  accountPatch,
  journalQuery,
  ledgerAccountsBody,
  manualEntryBody,
  payBody,
  rateBody,
  receiptBody,
  reportQuery,
  revalueBody,
  reverseBody,
  settleBody,
} from './ledger.schemas'
import { PaymentsService } from './payments.service'

const asOf = z.object({ asOf: isoDate.optional() })
const voucherQuery = z.object({ kind: z.enum(['payment', 'receipt']).optional(), officeId: z.string().optional() })
const advanceQuery = z.object({ status: z.enum(['open', 'settled']).optional() })
const cashBody = z.object({ counted: z.boolean() })
const reopenBody = z.object({ reason: z.string().trim().min(3).max(500) })

/** Office-scoped finance users act only on their own office. */
function ownOffice(u: AuthUser, officeId: string) {
  const limited = scopeOffice(u)
  if (limited && limited !== officeId) throw forbidden({ ar: 'هذا المكتب ليس مكتبك', en: 'That is not your office' })
}

@UseInterceptors(KickNotifications)
@Controller('finance')
export class LedgerController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly payments: PaymentsService,
    private readonly close: CloseService,
  ) {}

  // Chart of accounts
  @Perm('finance', 'view')
  @Get('accounts')
  chart(@Query(new Zod(asOf)) q: z.infer<typeof asOf>) {
    return this.accounts.chart(q.asOf)
  }

  @Perm('finance', 'edit')
  @Get('accounts/suggest-code/:parent')
  suggest(@Param('parent') parent: string) {
    return this.accounts.suggestCode(parent)
  }

  @Perm('finance', 'manage')
  @Post('accounts')
  createAccount(@CurrentUser() u: AuthUser, @Body(new Zod(accountBody)) b: z.infer<typeof accountBody>) {
    return this.accounts.createAccount(u, b)
  }

  @Perm('finance', 'manage')
  @Patch('accounts/:code')
  updateAccount(@CurrentUser() u: AuthUser, @Param('code') code: string, @Body(new Zod(accountPatch)) b: z.infer<typeof accountPatch>) {
    return this.accounts.updateAccount(u, code, b)
  }

  @Perm('finance', 'manage')
  @Put('system-accounts')
  systemAccounts(@CurrentUser() u: AuthUser, @Body(new Zod(ledgerAccountsBody)) b: z.infer<typeof ledgerAccountsBody>) {
    return this.accounts.setLedgerAccounts(u, b)
  }

  // Exchange rates: every signed-in person needs the rate to see a spend request in dollars, and it is not confidential.
  @Get('rates')
  rates() {
    return this.accounts.rates()
  }

  @Perm('finance', 'edit')
  @Post('rates')
  addRate(@CurrentUser() u: AuthUser, @Body(new Zod(rateBody)) b: z.infer<typeof rateBody>) {
    return this.accounts.addRate(u, b)
  }

  // Journal
  @Perm('finance', 'view')
  @Get('journal')
  journal(@CurrentUser() u: AuthUser, @Query(new Zod(journalQuery)) q: z.infer<typeof journalQuery>) {
    return this.accounts.journal({ ...q, officeId: scopeOffice(u) ?? q.officeId })
  }

  @Perm('finance', 'view')
  @Get('journal/:id')
  entry(@Param('id') id: string) {
    return this.accounts.entry(id)
  }

  @Perm('finance', 'edit')
  @Post('journal')
  manual(@CurrentUser() u: AuthUser, @Body(new Zod(manualEntryBody)) b: z.infer<typeof manualEntryBody>) {
    return this.accounts.manualEntry(u, b)
  }

  @Perm('finance', 'manage')
  @Post('journal/:id/reverse')
  reverse(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(reverseBody)) b: z.infer<typeof reverseBody>) {
    return this.accounts.reverse(u, id, b)
  }

  // Vouchers
  @Perm('finance', 'view')
  @Get('vouchers')
  vouchers(@CurrentUser() u: AuthUser, @Query(new Zod(voucherQuery)) q: z.infer<typeof voucherQuery>) {
    return this.payments.listVouchers(u, q)
  }

  @Perm('finance', 'view')
  @Get('awaiting-payment')
  awaiting(@CurrentUser() u: AuthUser) {
    return this.payments.awaitingPayment(u)
  }

  @Perm('finance', 'edit')
  @Post('requests/:id/pay')
  pay(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(payBody)) b: z.infer<typeof payBody>) {
    return this.payments.pay(u, id, b)
  }

  @Perm('finance', 'edit')
  @Post('receipts')
  receipt(@CurrentUser() u: AuthUser, @Body(new Zod(receiptBody)) b: z.infer<typeof receiptBody>) {
    return this.payments.receipt(u, b)
  }

  @Perm('finance', 'view')
  @Get('cash-position')
  cash(@CurrentUser() u: AuthUser) {
    return this.payments.cashPosition(u)
  }

  // Advances
  @Perm('finance', 'view')
  @Get('advances')
  advances(@CurrentUser() u: AuthUser, @Query(new Zod(advanceQuery)) q: z.infer<typeof advanceQuery>) {
    return this.payments.listAdvances(u, q.status)
  }

  @Perm('finance', 'view')
  @Get('advances/:id')
  advance(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.payments.getAdvance(u, id)
  }

  @Perm('finance', 'edit')
  @Post('advances/:id/settle')
  settle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(settleBody)) b: z.infer<typeof settleBody>) {
    return this.payments.settle(u, id, b)
  }

  // FX revaluation and month close
  @Perm('finance', 'view')
  @Get('revaluation')
  revaluationPreview(@Query(new Zod(revalueBody)) q: z.infer<typeof revalueBody>) {
    return this.close.revaluationPreview(q.date)
  }

  @Perm('finance', 'manage')
  @Post('revaluation')
  revalue(@CurrentUser() u: AuthUser, @Body(new Zod(revalueBody)) b: z.infer<typeof revalueBody>) {
    return this.close.revalue(u, b.date)
  }

  @Perm('finance', 'view')
  @Get('close/:period')
  async closeStatus(@CurrentUser() u: AuthUser, @Param('period', new Zod(period)) p: string) {
    const limited = scopeOffice(u)
    return (await this.close.status(p)).filter((s) => !limited || s.officeId === limited)
  }

  @Perm('finance', 'edit')
  @Put('close/:period/:officeId/cash-counted')
  cashCounted(@CurrentUser() u: AuthUser, @Param('period', new Zod(period)) p: string, @Param('officeId') o: string, @Body(new Zod(cashBody)) b: z.infer<typeof cashBody>) {
    ownOffice(u, o)
    return this.close.setCashCounted(u, p, o, b.counted)
  }

  @Perm('finance', 'manage')
  @Post('close/:period/:officeId')
  @HttpCode(200)
  closeMonth(@CurrentUser() u: AuthUser, @Param('period', new Zod(period)) p: string, @Param('officeId') o: string) {
    ownOffice(u, o)
    return this.close.close(u, p, o)
  }

  @Perm('finance', 'manage')
  @Post('close/:period/:officeId/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() u: AuthUser, @Param('period', new Zod(period)) p: string, @Param('officeId') o: string, @Body(new Zod(reopenBody)) b: z.infer<typeof reopenBody>) {
    ownOffice(u, o)
    return this.close.reopen(u, p, o, b.reason)
  }

  // Reports
  @Perm('finance', 'view')
  @Get('reports/trial-balance')
  tb(@CurrentUser() u: AuthUser, @Query(new Zod(reportQuery)) q: z.infer<typeof reportQuery>) {
    return this.close.trialBalance({ ...q, officeId: scopeOffice(u) ?? q.officeId })
  }

  @Perm('finance', 'view')
  @Get('reports/activities')
  activities(@Query(new Zod(reportQuery)) q: z.infer<typeof reportQuery>) {
    return this.close.activities(q)
  }

  @Perm('finance', 'view')
  @Get('reports/budget-vs-actual/:projectId')
  bva(@Param('projectId') id: string) {
    return this.close.budgetVsActual(id)
  }
}
