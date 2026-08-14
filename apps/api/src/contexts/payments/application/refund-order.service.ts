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

// D-11 TX2 preparation result: either a short-circuit (an already-succeeded
// refund for this exact request was found -- no Stripe call, no new write)
// or the data TX2 wrote/validated that the provider call and TX3 need.
type RefundPrep =
  | { readonly shortCircuit: true; readonly result: RefundOrderResult }
  | {
      readonly shortCircuit: false;
      readonly payment: PaymentRow;
      // Narrowed at the TX2 guard below -- carried as plain strings rather
      // than re-derived from `payment.paymentIntentId` after the fact, so
      // no `!`/`as` assertion is needed at the provider call site.
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

  // D-11: three short transactions with the Stripe call outside all of
  // them. TX2 durably records the attempt (a 'pending' payment_refunds row)
  // BEFORE Stripe is ever called; a Stripe failure applies its outcome in
  // its own TX3 without touching TX2's commit or the order at all.
  async executeWithOrder(input: RefundOrderInput, order: Order): Promise<RefundOrderResult> {
    const trimmedReason = input.reason.trim();
    if (!trimmedReason) {
      throw new RefundReasonRequiredError(input.orderId);
    }

    // TX2 -- close reached here; the block below never touches Stripe.
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

      // Idempotent replay: a refund already completed for this exact
      // request short-circuits before any write or Stripe call.
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

      // Amount validation only -- post-10-03, order.refund() no longer
      // writes order.status. Throws RefundExceedsCapturedError if invalid.
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
    // <- TX2 commits here.

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

    // Provider call -- deliberately outside any open database transaction
    // (D-11): a Stripe outage must never roll back TX1's cancel or TX2's
    // pending ledger row.
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
      // TX3 (failure branch): record the failure in the ledger row TX2
      // already wrote. The order itself is never touched here.
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

    // TX3 (success branch).
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

      // Flushes the OrderRefunded domain event that order.refund() queued
      // back in TX2 -- only now, because the refund only actually happened
      // once Stripe confirmed it.
      await this.orderRepo.update(order, tx);

      // 10-03 (T-10-03-01): order.refund() no longer writes order.status --
      // fulfillment status and refund completeness are separate facts.
      // Derive fullyRefunded from the payment ledger amounts, not the order
      // snapshot (order.toSnapshot().status === 'refunded' is never true now).
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
