import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { z } from 'zod'
import type { AuthUser } from '../auth/auth-user'
import { CurrentUser, Perm } from '../auth/decorators'
import { Zod } from '../common/zod'
import * as s from './supply.schemas'
import { SupplyService } from './supply.service'

@Controller('supply')
export class SupplyController {
  constructor(private readonly svc: SupplyService) {}

  @Perm('supply', 'view') @Get('items')
  items() { return this.svc.listItems() }
  @Perm('supply', 'manage') @Post('items')
  createItem(@CurrentUser() u: AuthUser, @Body(new Zod(s.itemBody)) b: z.infer<typeof s.itemBody>) { return this.svc.createItem(u, b) }
  @Perm('supply', 'manage') @Patch('items/:id')
  updateItem(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.itemPatch)) b: z.infer<typeof s.itemPatch>) { return this.svc.updateItem(u, id, b) }

  @Perm('supply', 'view') @Get('stock')
  stock(@CurrentUser() u: AuthUser, @Query(new Zod(s.stockQuery)) q: z.infer<typeof s.stockQuery>) { return this.svc.stock(u, q) }
  @Perm('supply', 'view') @Get('moves')
  moves(@CurrentUser() u: AuthUser, @Query(new Zod(s.moveQuery)) q: z.infer<typeof s.moveQuery>) { return this.svc.moves(u, q) }
  @Perm('supply', 'view') @Get('alerts')
  alerts(@CurrentUser() u: AuthUser, @Query(new Zod(s.alertQuery)) q: z.infer<typeof s.alertQuery>) { return this.svc.alerts(u, q) }

  @Perm('supply', 'edit') @Post('receipts')
  receive(@CurrentUser() u: AuthUser, @Body(new Zod(s.receiptBody)) b: z.infer<typeof s.receiptBody>) { return this.svc.receive(u, b) }
  @Perm('supply', 'edit') @Post('issues')
  issue(@CurrentUser() u: AuthUser, @Body(new Zod(s.issueBody)) b: z.infer<typeof s.issueBody>) { return this.svc.issue(u, b) }
  @Perm('supply', 'edit') @Post('write-offs')
  writeOff(@CurrentUser() u: AuthUser, @Body(new Zod(s.writeOffBody)) b: z.infer<typeof s.writeOffBody>) { return this.svc.writeOff(u, b) }

  @Perm('supply', 'view') @Get('shipments')
  shipments(@CurrentUser() u: AuthUser, @Query(new Zod(s.shipmentQuery)) q: z.infer<typeof s.shipmentQuery>) { return this.svc.listShipments(u, q) }
  @Perm('supply', 'view') @Get('shipments/:id')
  shipment(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.getShipment(u, id) }
  @Perm('supply', 'edit') @Post('shipments')
  createShipment(@CurrentUser() u: AuthUser, @Body(new Zod(s.shipmentBody)) b: z.infer<typeof s.shipmentBody>) { return this.svc.createShipment(u, b) }
  @Perm('supply', 'edit') @Post('shipments/:id/dispatch')
  dispatch(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.dispatchBody)) b: z.infer<typeof s.dispatchBody>) { return this.svc.dispatch(u, id, b) }
  @Perm('supply', 'edit') @Post('shipments/:id/receive')
  receiveShipment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new Zod(s.receiveBody)) b: z.infer<typeof s.receiveBody>) { return this.svc.receiveShipment(u, id, b) }
}
