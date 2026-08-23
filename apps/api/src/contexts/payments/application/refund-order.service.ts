import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { type OrderId, type TenantId } from '@resto/domain';
import { appendToOutbox, buildEnvelope, PaymentOrderRefundedV1 } from '@resto/events';
import { toMinorUnits, fromMinorUnits } from '../../ordering/domain/money-utils';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { OrderNotFoundError } from '../../ordering/domain/errors';
import { type Order } from '../../ordering/domain/order.aggregate';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../domain/ports';
import { PAYMENT_REPOSITORY, type PaymentRepository, type PaymentRow } from '../domain/ports';
import {
  RefundReasonRequiredError,
  PaymentNotRefundableError,
  RefundProviderFailedError,
} from '../domain/errors';

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

type RefundPrep =
  | { readonly shortCircuit: true; readonly result: RefundOrderResult }
  | {
      readonly shortCircuit: false;
      readonly payment: PaymentRow;
      readonly paymentIntentId: string;
      readonly stripeAccountId: string;
      readonly capturedMinor: number;
      readonly alreadyRefundedMinor: number;
      readonly amountMinor: number;
      readonly refundRequestId: string;
    };

const truncateFailureReason = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 500);
};

@Injectable()
export class RefundOrderService {
  private readonly logger: Logger;

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: PaymentRepository,
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
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

    const prep: RefundPrep = await this.db.withTenant(async (tx) => {
      const payment = await this.paymentRepo.findByOrderId(input.tenantId, input.orderId, tx);
      if (!payment?.paymentIntentId || !payment.stripeAccountId) {
        throw new PaymentNotRefundableError(input.orderId);
      }
      const paymentIntentId = payment.paymentIntentId;
      const stripeAccountId = payment.stripeAccountId;

      const capturedMinor = toMinorUnits(payment.amount);
      const alreadyRefundedMinor = toMinorUnits(payment.refundedAmount);
      const remainingMinor = capturedMinor - alreadyRefundedMinor;
      const amountMinor = input.amountMinor ?? remainingMinor;
      const refundRequestId = `refund:${input.orderId}:${alreadyRefundedMinor}:${amountMinor}`;

      const existing = await this.paymentRepo.findRefundByRequestId(
        input.tenantId,
        refundRequestId,
        tx,
      );
      if (existing?.status === 'succeeded') {
        const existingAmountMinor = toMinorUnits(existing.amount);
        return {
          shortCircuit: true,
          result: {
            stripeRefundId: existing.stripeRefundId ?? '',
            amountMinor: existingAmountMinor,
            fullyRefunded: alreadyRefundedMinor + existingAmountMinor >= capturedMinor,
          },
        };
      }

      order.refund(amountMinor, alreadyRefundedMinor);

      await this.paymentRepo.upsertRefund(
        {
          tenantId: input.tenantId,
          paymentId: payment.id,
          stripeRefundId: null,
          refundRequestId,
          amount: fromMinorUnits(amountMinor),
          reason: trimmedReason,
          status: 'pending',
        },
        tx,
      );

      return {
        shortCircuit: false,
        payment,
        paymentIntentId,
        stripeAccountId,
        capturedMinor,
        alreadyRefundedMinor,
        amountMinor,
        refundRequestId,
      };
    });

    if (prep.shortCircuit) {
      this.logger.log(
        { orderId: input.orderId, amountMinor: prep.result.amountMinor },
        'Refund already succeeded for this exact request — short-circuiting (idempotent replay).',
      );
      return prep.result;
    }

    const {
      payment,
      paymentIntentId,
      stripeAccountId,
      capturedMinor,
      alreadyRefundedMinor,
      amountMinor,
      refundRequestId,
    } = prep;

    let providerResult: { stripeRefundId: string; status: string };
    try {
      providerResult = await this.provider.createRefund({
        paymentIntentId,
        connectedAccountId: stripeAccountId,
        amountMinor,
        reason: trimmedReason,
        refundRequestId,
      });
    } catch (err) {
      const failureReason = truncateFailureReason(err);
      await this.db.withTenant(async (tx) => {
        await this.paymentRepo.updateRefundOutcome(
          input.tenantId,
          refundRequestId,
          { status: 'failed', failureReason },
          tx,
        );
      });
      this.logger.warn(
        { orderId: input.orderId, refundRequestId, error: failureReason },
        'Refund provider call failed — ledger row marked failed (D-11); cancel/order state unaffected.',
      );
      throw new RefundProviderFailedError(
        input.orderId,
        refundRequestId,
        amountMinor,
        failureReason,
      );
    }

    const { stripeRefundId } = providerResult;

    return this.db.withTenant(async (tx) => {
      await this.paymentRepo.updateRefundOutcome(
        input.tenantId,
        refundRequestId,
        { status: 'succeeded', stripeRefundId },
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

      await this.orderRepo.update(order, tx);

      const fullyRefunded = newRefundedMinor >= capturedMinor;

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
