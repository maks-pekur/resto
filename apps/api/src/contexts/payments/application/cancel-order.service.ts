import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OrderId, type TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { OrderNotFoundError } from '../../ordering/domain/errors';
import { toMinorUnits } from '../../ordering/domain/money-utils';
import { RefundOrderService } from './refund-order.service';

export interface CancelOrderInput {
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly reason?: string;
}

@Injectable()
export class CancelOrderService {
  private readonly logger: Logger;

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(RefundOrderService) private readonly refundService: RefundOrderService,
    logger?: Logger,
  ) {
    this.logger = logger ?? new Logger(CancelOrderService.name);
  }

  async execute(input: CancelOrderInput): Promise<void> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    const snap = order.toSnapshot();
    const wasPaid = snap.status === 'paid';
    const capturedMinor = toMinorUnits(snap.total);
    const cancelReason = input.reason ?? 'order_canceled';

    if (wasPaid && capturedMinor > 0) {
      this.logger.log(
        { orderId: input.orderId, tenantId: input.tenantId },
        'Paid order canceled — issuing auto-refund before cancel transition.',
      );
      await this.refundService.executeWithOrder(
        {
          orderId: input.orderId,
          tenantId: input.tenantId,
          reason: cancelReason,
        },
        order,
      );
    }

    const currentStatus = order.toSnapshot().status;
    if (currentStatus === 'paid' || currentStatus === 'created') {
      // 10-03: order.cancel() now requires a canonical reasonCode (D-08/D-09)
      // plus an explicit cancelNote/actorUserId. This service has no real
      // reason-code selection or principal threading yet -- that lands with
      // 10-05's rewrite of the wasPaid predicate and this status gate.
      // 'other' + the free-text reason as the note is the minimal adaptation
      // to the new aggregate signature, not the final design.
      order.cancel('other', cancelReason, null);
      await this.orderRepo.update(order);
    }
  }
}
