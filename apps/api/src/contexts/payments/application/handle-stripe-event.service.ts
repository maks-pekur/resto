import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  appendToOutbox,
  buildEnvelope,
  PaymentDisputeOpenedV1,
  PaymentOrderFailedV1,
  PaymentOrderRefundedV1,
  PaymentOrderSucceededV1,
  runDeduped,
  type RunDedupedResult,
} from '@resto/events';
import type { RestoTx } from '@resto/db';
import { toMinorUnits, fromMinorUnits } from '../../ordering/domain/money-utils';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { InvalidOrderTransitionError } from '../../ordering/domain/errors';
import type { OrderId } from '@resto/domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../../tenancy/domain/ports';
import { StripeAccountId, Tenant } from '../../tenancy/domain/tenant.aggregate';
import type { StripeOnboardingStatus } from '../../tenancy/domain/tenant.aggregate';
import {
  PAYMENT_PROVIDER_PORT,
  PAYMENT_REPOSITORY,
  type PaymentProviderPort,
  type PaymentRepository,
  type WebhookEvent,
} from '../domain/ports';

const CONSUMER_NAME = 'payments-webhook';

// payment_refunds_status_chk allows only these three; Stripe also emits requires_action/canceled.
const toLedgerRefundStatus = (stripeStatus: string | null | undefined): string | null => {
  switch (stripeStatus) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'canceled':
      return 'failed';
    case 'pending':
    case 'requires_action':
      return 'pending';
    default:
      return null;
  }
};

type RunDedupedFn = (
  db: TenantAwareDb,
  envelope: { id: string; tenantId: string },
  consumer: string,
  handler: (tx: RestoTx) => Promise<void>,
) => Promise<RunDedupedResult>;

@Injectable()
export class HandleStripeEventService {
  private readonly logger: Logger;
  private readonly runDedupedFn: RunDedupedFn;

  constructor(
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: TenantRepository,
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: PaymentRepository,
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
    logger?: Logger,
    runDedupedOverride?: RunDedupedFn,
  ) {
    this.logger = logger ?? new Logger(HandleStripeEventService.name);
    this.runDedupedFn = runDedupedOverride ?? (runDeduped as unknown as RunDedupedFn);
  }

  async handle(event: WebhookEvent): Promise<void> {
    this.logger.log({ type: event.type, eventId: event.id }, 'Stripe webhook received.');

    switch (event.type) {
      case 'account.updated':
        await this.handleAccountUpdated(event);
        break;
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event);
        break;
      case 'refund.updated':
        await this.handleRefundUpdated(event);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event);
        break;
      default:
        this.logger.log({ type: event.type }, 'Unhandled Stripe event type — ignoring.');
    }
  }

  private async handleAccountUpdated(event: WebhookEvent): Promise<void> {
    const rawEvent = event as { account?: string; data: { object: Record<string, unknown> } };
    const rawAccountId = rawEvent.account;
    if (!rawAccountId) {
      this.logger.warn({ eventId: event.id }, 'account.updated missing event.account — ignoring.');
      return;
    }
    const parsedId = StripeAccountId.safeParse(rawAccountId);
    if (!parsedId.success) {
      this.logger.warn(
        { eventId: event.id, rawAccountId },
        'account.updated: event.account fails StripeAccountId validation — ignoring (PAY-11).',
      );
      return;
    }
    const accountId = parsedId.data;

    const tenantSnap = await this.tenantRepo.findByStripeAccountId(accountId);
    if (!tenantSnap) {
      this.logger.warn(
        { accountId, eventId: event.id },
        'account.updated for unregistered Stripe account — ignoring (W3).',
      );
      return;
    }

    const tenantId = tenantSnap.id;
    const acct = rawEvent.data.object as {
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      details_submitted?: boolean;
      requirements?: { currently_due?: readonly string[] | null } | null;
    };

    const chargesEnabled = acct.charges_enabled ?? false;
    const payoutsEnabled = acct.payouts_enabled ?? false;
    const detailsSubmitted = acct.details_submitted ?? false;

    let onboardingStatus: StripeOnboardingStatus;
    if (chargesEnabled && detailsSubmitted) {
      onboardingStatus = 'complete';
    } else if (acct.requirements?.currently_due && acct.requirements.currently_due.length > 0) {
      onboardingStatus = 'restricted';
    } else {
      onboardingStatus = 'pending';
    }

    const pseudoEnvelope = { id: event.id, tenantId };
    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (_tx) => {
      const tenant = Tenant.fromSnapshot(tenantSnap);
      const currentlyDue = acct.requirements?.currently_due ?? null;
      tenant.applyStripeCapabilities({
        chargesEnabled,
        payoutsEnabled,
        onboardingStatus,
        requirementsDue: currentlyDue ? [...currentlyDue] : null,
      });
      await this.tenantRepo.save(tenant);
    });
  }

  private async handlePaymentIntentSucceeded(event: WebhookEvent): Promise<void> {
    interface PiObject {
      id: string;
      latest_charge?: string | null;
      amount: number;
      currency: string;
      metadata?: { orderId?: string; tenantId?: string };
    }

    const rawPi = (event as { data: { object: PiObject } }).data.object;

    const orderId = rawPi.metadata?.orderId;
    const tenantId = rawPi.metadata?.tenantId;

    if (!orderId || !tenantId) {
      this.logger.warn(
        { paymentIntentId: rawPi.id, eventId: event.id },
        'payment_intent.succeeded missing orderId or tenantId in metadata — ignoring.',
      );
      return;
    }

    const parsedTenantId = TenantId.parse(tenantId);
    const chargeId = rawPi.latest_charge ?? '';
    const pseudoEnvelope = { id: event.id, tenantId };

    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (tx) => {
      const order = await this.orderRepo.findByIdInTx(tx, orderId as OrderId, parsedTenantId);
      if (!order) {
        this.logger.warn(
          { orderId, eventId: event.id },
          'payment_intent.succeeded: order not found — ignoring.',
        );
        return;
      }

      const snap = order.toSnapshot();

      if (
        snap.status === 'paid' ||
        snap.status === 'accepted' ||
        snap.status === 'preparing' ||
        snap.status === 'ready' ||
        snap.status === 'completed'
      ) {
        const existingPayment = await this.paymentRepo.findByOrderId(parsedTenantId, orderId, tx);
        if (existingPayment && existingPayment.paymentIntentId !== rawPi.id) {
          this.logger.warn(
            { orderId, paymentIntentId: rawPi.id, existingPiId: existingPayment.paymentIntentId },
            'Orphan PaymentIntent succeeded on already-paid order — auto-refunding (D-06).',
          );
          await this.provider.createRefund({
            paymentIntentId: rawPi.id,
            connectedAccountId: existingPayment.stripeAccountId ?? '',
            refundRequestId: `orphan:${rawPi.id}`,
            reason: 'duplicate',
          });
        }
        return;
      }

      try {
        order.markPaid(rawPi.id);
      } catch (err) {
        if (err instanceof InvalidOrderTransitionError) {
          this.logger.warn(
            { orderId, status: snap.status },
            'markPaid rejected — treating as no-op.',
          );
          return;
        }
        throw err;
      }
      await this.orderRepo.update(order, tx);

      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId: parsedTenantId,
          orderId,
          status: 'succeeded',
          amount: fromMinorUnits(rawPi.amount),
          currency: rawPi.currency.toUpperCase(),
          paymentIntentId: rawPi.id,
          latestChargeId: chargeId || null,
        },
        tx,
      );

      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          PaymentOrderSucceededV1,
          {
            orderId,
            tenantId: parsedTenantId,
            paymentIntentId: rawPi.id,
            chargeId,
            amountMinor: rawPi.amount,
            currency: rawPi.currency.toUpperCase(),
          },
          { tenantId },
        ),
        aggregateId: orderId,
      });
    });
  }

  private async handlePaymentIntentFailed(event: WebhookEvent): Promise<void> {
    const rawPi = (
      event as {
        data: {
          object: {
            id: string;
            last_payment_error?: { code?: string | null } | null;
            metadata?: { orderId?: string; tenantId?: string };
          };
        };
      }
    ).data.object;

    const orderId = rawPi.metadata?.orderId;
    const tenantId = rawPi.metadata?.tenantId;

    if (!orderId || !tenantId) {
      this.logger.warn(
        { paymentIntentId: rawPi.id, eventId: event.id },
        'payment_intent.payment_failed missing orderId/tenantId — ignoring.',
      );
      return;
    }

    const parsedTenantId = TenantId.parse(tenantId);
    const failureCode = rawPi.last_payment_error?.code ?? 'unknown';
    const pseudoEnvelope = { id: event.id, tenantId };

    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (tx) => {
      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId: parsedTenantId,
          orderId,
          status: 'failed',
          amount: '0.00',
          currency: 'unknown',
          paymentIntentId: rawPi.id,
        },
        tx,
      );

      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          PaymentOrderFailedV1,
          {
            orderId,
            tenantId: parsedTenantId,
            paymentIntentId: rawPi.id,
            failureCode,
          },
          { tenantId },
        ),
        aggregateId: orderId,
      });
    });
  }

  // F-49: only the Charge carries cumulative refund totals. `refund.updated` delivers a Refund,
  // whose missing amount_refunded read as 0 and clobbered a completed full refund back to partial.
  private async handleChargeRefunded(event: WebhookEvent): Promise<void> {
    const rawCharge = (
      event as {
        account?: string;
        data: {
          object: {
            id?: string;
            payment_intent?: string | null;
            amount_refunded?: number;
            amount_captured?: number;
            amount?: number;
          };
        };
      }
    ).data.object;

    const piId = rawCharge.payment_intent;
    if (!piId) {
      this.logger.warn({ eventId: event.id }, 'charge.refunded missing payment_intent — ignoring.');
      return;
    }

    const rawEvent = event as { account?: string };
    const accountId = rawEvent.account;
    if (!accountId) {
      this.logger.warn(
        { eventId: event.id },
        'charge.refunded missing event.account — cannot resolve tenant, ignoring.',
      );
      return;
    }

    const tenantSnap = await this.tenantRepo.findByStripeAccountId(accountId);
    if (!tenantSnap) {
      this.logger.warn(
        { accountId, eventId: event.id },
        'charge.refunded for unregistered account — ignoring (W3).',
      );
      return;
    }

    const tenantId = tenantSnap.id;
    const pseudoEnvelope = { id: event.id, tenantId };

    const cumulativeRefundedMinor = rawCharge.amount_refunded ?? 0;
    const capturedMinorFromCharge = rawCharge.amount_captured ?? rawCharge.amount ?? 0;

    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (tx) => {
      const payment = await this.paymentRepo.findByPaymentIntentId(tenantId, piId, tx);
      if (!payment) {
        this.logger.warn({ piId, tenantId }, 'charge.refunded: payment row not found — ignoring.');
        return;
      }

      const capturedMinor =
        capturedMinorFromCharge > 0 ? capturedMinorFromCharge : toMinorUnits(payment.amount);
      const fullyRefunded = cumulativeRefundedMinor >= capturedMinor;
      const newPaymentStatus = fullyRefunded ? 'refunded' : 'partially_refunded';

      this.logger.log(
        { piId, tenantId, cumulativeRefundedMinor, fullyRefunded },
        'charge.refunded: updating payment status from webhook (refund-row gap logged — PAY-BUG6).',
      );

      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId,
          orderId: payment.orderId,
          status: newPaymentStatus,
          amount: payment.amount,
          currency: payment.currency,
          paymentIntentId: payment.paymentIntentId,
          latestChargeId: payment.latestChargeId,
          refundedAmount: fromMinorUnits(cumulativeRefundedMinor),
          stripeAccountId: payment.stripeAccountId,
          applicationFeeAmount: payment.applicationFeeAmount,
        },
        tx,
      );

      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          PaymentOrderRefundedV1,
          {
            orderId: payment.orderId,
            tenantId,
            refundId: event.id,
            amountMinor: cumulativeRefundedMinor,
            fullyRefunded,
          },
          { tenantId },
        ),
        aggregateId: payment.orderId,
      });
    });
  }

  private async handleRefundUpdated(event: WebhookEvent): Promise<void> {
    const rawRefund = (
      event as {
        account?: string;
        data: { object: { id?: string; status?: string | null } };
      }
    ).data.object;

    const refundId = rawRefund.id;
    if (!refundId) {
      this.logger.warn({ eventId: event.id }, 'refund.updated missing refund id — ignoring.');
      return;
    }

    const ledgerStatus = toLedgerRefundStatus(rawRefund.status);
    if (!ledgerStatus) {
      this.logger.warn(
        { eventId: event.id, refundId, status: rawRefund.status },
        'refund.updated with an unrecognized status — ignoring.',
      );
      return;
    }

    const accountId = (event as { account?: string }).account;
    if (!accountId) {
      this.logger.warn(
        { eventId: event.id },
        'refund.updated missing event.account — cannot resolve tenant, ignoring.',
      );
      return;
    }

    const tenantSnap = await this.tenantRepo.findByStripeAccountId(accountId);
    if (!tenantSnap) {
      this.logger.warn(
        { accountId, eventId: event.id },
        'refund.updated for unregistered account — ignoring (W3).',
      );
      return;
    }

    const tenantId = tenantSnap.id;

    await this.runDedupedFn(
      this.db,
      { id: event.id, tenantId },
      CONSUMER_NAME,
      async (tx: RestoTx) => {
        const existing = await this.paymentRepo.findRefundByStripeId(tenantId, refundId, tx);
        if (!existing) {
          this.logger.warn(
            { refundId, tenantId },
            'refund.updated for an unknown refund row — ignoring.',
          );
          return;
        }
        await this.paymentRepo.updateRefundStatusByStripeId(tenantId, refundId, ledgerStatus, tx);
        this.logger.log(
          { refundId, tenantId, status: ledgerStatus },
          'refund.updated: refund ledger status synced; payment totals untouched (F-49).',
        );
      },
    );
  }

  private async handleDisputeCreated(event: WebhookEvent): Promise<void> {
    const rawDispute = (
      event as {
        account?: string;
        data: {
          object: {
            id: string;
            payment_intent?: string | null;
            amount: number;
            reason?: string | null;
          };
        };
      }
    ).data.object;

    const piId = rawDispute.payment_intent;
    if (!piId) {
      this.logger.warn(
        { eventId: event.id },
        'charge.dispute.created missing payment_intent — ignoring.',
      );
      return;
    }

    const rawEvent = event as { account?: string };
    const accountId = rawEvent.account;
    if (!accountId) {
      this.logger.warn(
        { eventId: event.id },
        'charge.dispute.created missing event.account — ignoring.',
      );
      return;
    }

    const tenantSnap = await this.tenantRepo.findByStripeAccountId(accountId);
    if (!tenantSnap) {
      this.logger.warn(
        { accountId, eventId: event.id },
        'charge.dispute.created for unregistered account — ignoring (W3).',
      );
      return;
    }

    const tenantId = tenantSnap.id;
    const pseudoEnvelope = { id: event.id, tenantId };

    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (tx) => {
      const payment = await this.paymentRepo.findByPaymentIntentId(tenantId, piId, tx);
      if (!payment) {
        this.logger.warn(
          { piId, tenantId },
          'charge.dispute.created: payment row not found — ignoring.',
        );
        return;
      }

      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          PaymentDisputeOpenedV1,
          {
            orderId: payment.orderId,
            tenantId,
            disputeId: rawDispute.id,
            amountMinor: rawDispute.amount,
            reason: rawDispute.reason ?? 'unknown',
          },
          { tenantId },
        ),
        aggregateId: payment.orderId,
      });

      this.logger.warn(
        { disputeId: rawDispute.id, piId, tenantId },
        'Dispute opened — recorded (D-11).',
      );
    });
  }
}
