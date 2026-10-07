import { Global, Module } from '@nestjs/common'
import { NotificationEngine } from './engine.service'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { TRANSPORT, transportProvider } from './transports'

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [{ provide: TRANSPORT, useFactory: transportProvider }, NotificationEngine, NotificationsService],
  exports: [NotificationEngine, TRANSPORT],
})
export class NotificationsModule {}
