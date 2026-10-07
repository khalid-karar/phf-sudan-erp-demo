import { Module } from '@nestjs/common'
import { AccountsService } from './accounts.service'
import { CloseService } from './close.service'
import { LedgerController } from './ledger.controller'
import { PaymentsService } from './payments.service'

@Module({ controllers: [LedgerController], providers: [AccountsService, PaymentsService, CloseService], exports: [PaymentsService] })
export class LedgerModule {}
