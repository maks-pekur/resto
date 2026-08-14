import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { type OrderId, type TenantId } from '@resto/domain';
import { appendToOutbox, buildEnvelope, PaymentOrderRefundedV1 } from '@resto/events';
import { toMinorUnits, fromMinorUnits } from '../../ordering/domain/money-utils';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../domain/ports';
import { PAYMENT_REPOSITORY, type PaymentRepository, type PaymentRow } from '../domain/ports';
import { RefundNotRetryableError, RefundProviderFailedError } from '../domain/errors';

export interface RetryRefundInput {
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly refundRequestId: string;
  readonly actorUserId: string | null;
}

export interface RetryRefundResult {
  readonly stripeRefundId: string;
  readonly amountMinor: number;
  readonly fullyRefunded: boolean;
}

const truncateFailureReason = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 500);
};

// D-11: re-runs ONLY the provider call + outcome-recording for an existing
// failed payment_refunds row. Never calls order.cancel() again (the order
// is already canceled from the first attempt) and never calls
// order.refund() again (the ledger row already records the intended
// amount) -- retry touches payments/payment_refunds only, never the order
// aggregate.
@Injectable()
export class RetryRefundService {
  private readonly logger: Logger;

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: PaymentRepository,
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    logger?: Logger,
  ) {
    this.logger = logger ?? new Logger(RetryRefundService.name);
  }

  async execute(input: RetryRefundInput): Promise<RetryRefundResult> {
    const prep = await this.db.withTenant(async (tx) => {
      const refundRow = await this.paymentRepo.findRefundByRequestId(
        input.tenantId,
        input.refundRequestId,
        tx,
      );
      if (refundRow?.status !== 'failed') {
        throw new RefundNotRetryableError(
          input.orderId,
          input.refundRequestId,
          refundRow?.status ?? 'not_found',
        );
      }

      const payment = await this.paymentRepo.findByOrderId(input.tenantId, input.orderId, tx);
      if (!payment?.paymentIntentId || !payment.stripeAccountId) {
        throw new RefundNotRetryableError(input.orderId, input.refundRequestId, 'payment_missing');
      }
      // Narrowed here so no `!`/`as` assertion is needed at the provider
      // call site below.
      const paymentIntentId = payment.paymentIntentId;
      const stripeAccountId = payment.stripeAccountId;

      return {
        reason: refundRow.reason,
        payment,
        paymentIntentId,
        stripeAccountId,
        capturedMinor: toMinorUnits(payment.amount),
        amountMinor: toMinorUnits(refundRow.amount),
      };
    });

    const { reason, payment, paymentIntentId, stripeAccountId, capturedMinor, amountMinor } = prep;

    let providerResult: { stripeRefundId: string; status: string };
    try {
      providerResult = await this.provider.createRefund({
        paymentIntentId,
        connectedAccountId: stripeAccountId,
        amountMinor,
        reason,
        // Reuse the ORIGINAL refundRequestId -- both our ledger key and
        // Stripe's idempotency key must stay unchanged across a retry so a
        // duplicate attempt can never double-refund the connected account.
        refundRequestId: input.refundRequestId,
      });
    } catch (err) {
      const failureReason = truncateFailureReason(err);
      await this.db.withTenant(async (tx) => {
        await this.paymentRepo.updateRefundOutcome(
          input.tenantId,
          input.refundRequestId,
          { status: 'failed', failureReason },
          tx,
        );
      });
      this.logger.warn(
        {
          orderId: input.orderId,
          refundRequestId: input.refundRequestId,
          actorUserId: input.actorUserId,
          error: failureReason,
        },
        'Refund retry failed again — ledger row stays failed for another retry.',
      );
      throw new RefundProviderFailedError(
        input.orderId,
        input.refundRequestId,
        amountMinor,
        failureReason,
      );
    }

    const { stripeRefundId } = providerResult;

    return this.db.withTenant(async (tx) => {
      // Re-read refundedAmount fresh inside this transaction -- a webhook
      // may have already reconciled part of this refund between TX prep
      // above and now; re-reading here (instead of trusting the value
      // captured before the provider call) avoids a stale double-count.
      const freshPayment: PaymentRow | null = await this.paymentRepo.findByOrderId(
        input.tenantId,
        input.orderId,
        tx,
      );
      const basePayment = freshPayment ?? payment;
      const freshAlreadyRefundedMinor = toMinorUnits(basePayment.refundedAmount);

      await this.paymentRepo.updateRefundOutcome(
        input.tenantId,
        input.refundRequestId,
        { status: 'succeeded', stripeRefundId },
        tx,
      );

      const newRefundedMinor = freshAlreadyRefundedMinor + amountMinor;
      const newPaymentStatus =
        newRefundedMinor >= capturedMinor ? 'refunded' : 'partially_refunded';

      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId: input.tenantId,
          orderId: input.orderId,
          status: newPaymentStatus,
          amount: basePayment.amount,
          currency: basePayment.currency,
          paymentIntentId: basePayment.paymentIntentId,
          latestChargeId: basePayment.latestChargeId,
          refundedAmount: fromMinorUnits(newRefundedMinor),
          stripeAccountId: basePayment.stripeAccountId,
          applicationFeeAmount: basePayment.applicationFeeAmount,
        },
        tx,
      );

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
        {
          orderId: input.orderId,
          refundRequestId: input.refundRequestId,
          actorUserId: input.actorUserId,
          stripeRefundId,
          fullyRefunded,
        },
        'Refund retry succeeded.',
      );

      return { stripeRefundId, amountMinor, fullyRefunded };
    });
  }
}
