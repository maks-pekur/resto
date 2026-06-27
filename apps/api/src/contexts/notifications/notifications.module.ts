import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { IdentityCoreModule } from '../identity/identity-core.module';
import { SendGuestNotificationService } from './application/send-guest-notification.service';
import { NatsGuestNotificationSubscriber } from './infrastructure/nats-guest-notification.subscriber';
import {
  NOTIFICATION_ORDER_REPOSITORY,
  NotificationOrderDrizzleRepository,
} from './infrastructure/notification-order-drizzle.repository';

@Module({
  imports: [TenancyModule, IdentityCoreModule],
  providers: [
    { provide: NOTIFICATION_ORDER_REPOSITORY, useClass: NotificationOrderDrizzleRepository },
    SendGuestNotificationService,
    NatsGuestNotificationSubscriber,
  ],
})
export class NotificationsModule {}
