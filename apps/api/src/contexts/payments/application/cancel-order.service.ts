import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OrderId, type TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { OrderNotFoundError } from '../../ordering/domain/errors';
import { RefundOrderService } from './refund-order.service';
import { PaymentNotRefundableError, RefundProviderFailedError } from '../domain/errors';

export interface CancelOrderInput {
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly reasonCode: string;
  readonly cancelNote?: string | null;
  readonly actorUserId: string | null;
}

export interface CancelOrderResult {
  readonly canceled: true;
  readonly refund: {
    readonly attempted: boolean;
    readonly outcome: 'succeeded' | 'failed' | 'none';
    readonly amountMinor: number | null;
  };
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

  async execute(input: CancelOrderInput): Promise<CancelOrderResult> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    // TX1: cancel commits on its own, before anything downstream ever
    // touches Stripe. orderRepo.update() with no explicit tx opens and
    // commits its own short transaction (order-drizzle.repository.ts) --
    // this is what makes D-11's "the order still cancels even if Stripe is
    // down" true. order.cancel() also validates reasonCode against the
    // canonical seven codes before this write (InvalidCancelReasonError).
    order.cancel(input.reasonCode, input.cancelNote ?? null, input.actorUserId);
    await this.orderRepo.update(order);

    // CTO HIGH-7: refundability is derived solely from the captured payment
    // via RefundOrderService's own PaymentNotRefundableError check -- never
    // from orders.status. The deleted `wasPaid` predicate used to read
    // false for a fully-paid order sitting in accepted/preparing/ready,
    // silently skipping the refund. There is deliberately no order-status
    // gate here. The refund is always for the full remaining captured
    // amount (D-10) -- CancelOrderService never accepts an amountMinor; a
    // cashier cancelling makes no financial judgement.
    try {
      const result = await this.refundService.executeWithOrder(
        {
          orderId: input.orderId,
          tenantId: input.tenantId,
          reason: `cancel:${input.reasonCode}`,
        },
        order,
      );
      return {
        canceled: true,
        refund: { attempted: true, outcome: 'succeeded', amountMinor: result.amountMinor },
      };
    } catch (err) {
      if (err instanceof PaymentNotRefundableError) {
        this.logger.log(
          { orderId: input.orderId, tenantId: input.tenantId },
          'Cancel of an order with no captured payment — nothing to refund.',
        );
        return { canceled: true, refund: { attempted: false, outcome: 'none', amountMinor: null } };
      }
      if (err instanceof RefundProviderFailedError) {
        this.logger.warn(
          {
            orderId: input.orderId,
            tenantId: input.tenantId,
            refundRequestId: err.refundRequestId,
          },
          'Cancel committed but the refund provider call failed — order stays canceled (D-11); a retry is available.',
        );
        return {
          canceled: true,
          refund: { attempted: true, outcome: 'failed', amountMinor: err.amountMinor },
        };
      }
      throw err;
    }
  }
}
