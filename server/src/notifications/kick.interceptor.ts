import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { NotificationEngine } from './engine.service'

/** After a successful change (not a read), asks the notification engine to take a look soon. */
@Injectable()
export class KickNotifications implements NestInterceptor {
  constructor(private readonly engine: NotificationEngine) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = ctx.switchToHttp().getRequest().method as string
    return next.handle().pipe(tap(() => method !== 'GET' && this.engine.kick()))
  }
}
