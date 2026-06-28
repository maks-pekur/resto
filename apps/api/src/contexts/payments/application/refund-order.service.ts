import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { type OrderId, type TenantId } from '@resto/domain';
import { appendToOutbox, buildEnvelope, PaymentOrderRefundedV1 } from '@resto/events';
import { toMinorUnits, fromMinorUnits } from '../../ordering/domain/money-utils';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { OrderNotFoundError } from '../../ordering/domain/errors';
import { type Order } from '../../ordering/domain/order.aggregate';
import { STRIPE_CONNECT_PORT, type StripeConnectPort } from '../../tenancy/domain/ports';
import { PAYMENT_REPOSITORY, type PaymentRepository } from '../domain/ports';
import { RefundReasonRequiredError, PaymentNotRefundableError } from '../domain/errors';

export interface RefundOrderInput {
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly amountMinor?: number;
  readonly reason: string;
}

export interface RefundOrderResult {
  readonly stripeRefundId: string;
  readonly amountMinor: number;
  readonly fullyRefunded: boolean;
}

@Injectable()
export class RefundOrderService {
  private readonly logger: Logger;

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: PaymentRepository,
    @Inject(STRIPE_CONNECT_PORT) private readonly stripePort: StripeConnectPort,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    logger?: Logger,
  ) {
    this.logger = logger ?? new Logger(RefundOrderService.name);
  }

  async execute(input: RefundOrderInput): Promise<RefundOrderResult> {
    const trimmedReason = input.reason.trim();
    if (!trimmedReason) {
      throw new RefundReasonRequiredError(input.orderId);
    }

    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    return this.executeWithOrder(input, order);
  }

  async executeWithOrder(input: RefundOrderInput, order: Order): Promise<RefundOrderResult> {
    const trimmedReason = input.reason.trim();
    if (!trimmedReason) {
      throw new RefundReasonRequiredError(input.orderId);
    }

    return this.db.withTenant(async (tx) => {
      const payment = await this.paymentRepo.findByOrderId(input.tenantId, input.orderId, tx);
      if (!payment?.paymentIntentId || !payment.stripeAccountId) {
        throw new PaymentNotRefundableError(input.orderId);
      }

      const capturedMinor = toMinorUnits(payment.amount);
      const alreadyRefundedMinor = toMinorUnits(payment.refundedAmount);
      const remainingMinor = capturedMinor - alreadyRefundedMinor;
      const amountMinor = input.amountMinor ?? remainingMinor;

      order.refund(amountMinor, alreadyRefundedMinor);

      const refundRequestId = `refund:${input.orderId}:${alreadyRefundedMinor}:${amountMinor}`;

      const { stripeRefundId, status } = await this.stripePort.createRefund({
        paymentIntentId: payment.paymentIntentId,
        connectedAccountId: payment.stripeAccountId,
        amountMinor,
        reason: trimmedReason,
        refundRequestId,
      });

      await this.paymentRepo.upsertRefund(
        {
          tenantId: input.tenantId,
          paymentId: payment.id,
          stripeRefundId,
          amount: fromMinorUnits(amountMinor),
          reason: trimmedReason,
          status,
        },
        tx,
      );

      const newRefundedMinor = alreadyRefundedMinor + amountMinor;
      const newPaymentStatus =
        newRefundedMinor >= capturedMinor ? 'refunded' : 'partially_refunded';
      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId: input.tenantId,
          orderId: input.orderId,
          status: newPaymentStatus,
          amount: payment.amount,
          currency: payment.currency,
          paymentIntentId: payment.paymentIntentId,
          latestChargeId: payment.latestChargeId,
          refundedAmount: fromMinorUnits(newRefundedMinor),
          stripeAccountId: payment.stripeAccountId,
          applicationFeeAmount: payment.applicationFeeAmount,
        },
        tx,
      );

      await this.orderRepo.save(order);

      const snap = order.toSnapshot();
      const fullyRefunded = snap.status === 'refunded';

      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          PaymentOrderRefundedV1,
          {
            orderId: input.orderId,
            tenantId: input.tenantId,
            refundId: stripeRefundId,
            amountMinor,
            fullyRefunded,
          },
          { tenantId: input.tenantId },
        ),
        aggregateId: input.orderId,
      });

      this.logger.log(
        { orderId: input.orderId, amountMinor, stripeRefundId, fullyRefunded },
        'Refund executed.',
      );

      return { stripeRefundId, amountMinor, fullyRefunded };
    });
  }
}
