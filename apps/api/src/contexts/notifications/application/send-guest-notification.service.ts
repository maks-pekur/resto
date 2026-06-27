import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import { BrandQueriesService } from '../../tenancy/application/brand-queries.service';
import { BrandId } from '@resto/domain';
import {
  NOTIFICATION_ORDER_REPOSITORY,
  type NotificationOrderRepository,
} from '../infrastructure/notification-order-drizzle.repository';
import { EMAIL_ADAPTER_PORT, type EmailAdapterPort } from '../domain/ports';

export type GuestNotificationTransition =
  | 'order_confirmation'
  | 'order_refunded'
  | 'order_accepted'
  | 'order_ready';

export interface SendGuestNotificationInput {
  readonly orderId: string;
  readonly tenantId: string;
  readonly transition: GuestNotificationTransition;
  readonly refundAmountMinor?: number | undefined;
}

@Injectable()
export class SendGuestNotificationService {
  private readonly logger = new Logger(SendGuestNotificationService.name);

  constructor(
    @Inject(EMAIL_ADAPTER_PORT) private readonly emailAdapter: EmailAdapterPort,
    @Inject(BrandQueriesService) private readonly brandQueries: BrandQueriesService,
    @Inject(NOTIFICATION_ORDER_REPOSITORY)
    private readonly orderRepo: NotificationOrderRepository,
  ) {}

  async execute(input: SendGuestNotificationInput): Promise<void> {
    const tenantId = TenantId.parse(input.tenantId);

    const order = await this.orderRepo.findOrder(tenantId, input.orderId);

    if (!order) {
      this.logger.warn(
        { orderId: input.orderId, tenantId },
        'Order not found for guest notification — skipping',
      );
      return;
    }

    if (!order.customerEmail) {
      this.logger.warn(
        { orderId: input.orderId, tenantId },
        'No customer email on order — skipping guest notification',
      );
      return;
    }

    const brands = await this.brandQueries.listForTenant(tenantId, [BrandId.parse(order.brandId)]);
    const brand = brands[0] ?? null;

    const locale = 'ru';
    const brandName = brand?.displayName ?? 'RestOS';
    const brandTheme = brand?.theme ?? null;

    const itemsRows = await this.orderRepo.findOrderItems(tenantId, input.orderId);
    const itemsSummary = itemsRows
      .map((r) => `${String(r.quantity)}x ${r.nameSnapshot}`)
      .join(', ');

    const refundAmount =
      input.refundAmountMinor !== undefined
        ? (input.refundAmountMinor / 100).toFixed(2)
        : undefined;

    const idempotencyKey = `gnotif:${input.orderId}:${input.transition}`;

    await this.emailAdapter.sendGuestNotification({
      to: order.customerEmail,
      locale,
      kind: input.transition,
      brandTheme,
      brandName,
      vars: {
        orderNumber: order.orderNumber,
        itemsSummary,
        total: order.total,
        currency: order.currency,
        ...(refundAmount !== undefined ? { refundAmount } : {}),
      },
      tenantId,
      idempotencyKey,
    });

    this.logger.log(
      { orderId: input.orderId, tenantId, transition: input.transition },
      'Guest notification sent',
    );
  }
}
