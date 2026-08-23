import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OrderId, type TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { OrderNotFoundError, RefundExceedsCapturedError } from '../../ordering/domain/errors';
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

    order.cancel(input.reasonCode, input.cancelNote ?? null, input.actorUserId);
    await this.orderRepo.update(order);

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
      if (err instanceof RefundExceedsCapturedError) {
        this.logger.log(
          {
            orderId: input.orderId,
            tenantId: input.tenantId,
            alreadyRefundedMinor: err.alreadyRefundedMinor,
            capturedMinor: err.capturedMinor,
          },
          'Cancel of an already fully refunded order — nothing left to refund.',
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
