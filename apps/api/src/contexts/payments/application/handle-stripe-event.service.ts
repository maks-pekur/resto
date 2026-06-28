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
import type Stripe from 'stripe';
import { toMinorUnits, fromMinorUnits } from '../../ordering/domain/money-utils';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { InvalidOrderTransitionError } from '../../ordering/domain/errors';
import type { OrderId } from '@resto/domain';
import {
  STRIPE_CONNECT_PORT,
  TENANT_REPOSITORY,
  type StripeConnectPort,
  type TenantRepository,
} from '../../tenancy/domain/ports';
import type {
  ApplyStripeCapabilitiesInput,
  StripeOnboardingStatus,
} from '../../tenancy/domain/tenant.aggregate';
import { StripeAccountId } from '../../tenancy/domain/tenant.aggregate';
import { PAYMENT_REPOSITORY, type PaymentRepository } from '../domain/ports';

const CONSUMER_NAME = 'payments-webhook';

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
    @Inject(STRIPE_CONNECT_PORT) private readonly stripePort: StripeConnectPort,
    logger?: Logger,
    runDedupedOverride?: RunDedupedFn,
  ) {
    this.logger = logger ?? new Logger(HandleStripeEventService.name);
    this.runDedupedFn = runDedupedOverride ?? (runDeduped as unknown as RunDedupedFn);
  }

  async handle(event: Stripe.Event): Promise<void> {
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
      case 'refund.updated':
        await this.handleRefund(event);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event);
        break;
      default:
        this.logger.log({ type: event.type }, 'Unhandled Stripe event type — ignoring.');
    }
  }

  private async handleAccountUpdated(event: Stripe.Event): Promise<void> {
    const rawAccountId = event.account;
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

    const tenant = await this.tenantRepo.findByStripeAccountId(accountId);
    if (!tenant) {
      this.logger.warn(
        { accountId, eventId: event.id },
        'account.updated for unregistered Stripe account — ignoring (W3).',
      );
      return;
    }

    const tenantId = tenant.toSnapshot().id;
    const acct = event.data.object as {
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

    const capabilities: ApplyStripeCapabilitiesInput = {
      chargesEnabled,
      payoutsEnabled,
      onboardingStatus,
      requirementsDue: acct.requirements?.currently_due ?? null,
    };

    const pseudoEnvelope = { id: event.id, tenantId };
    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (_tx) => {
      tenant.applyStripeCapabilities(capabilities);
      await this.tenantRepo.save(tenant);
    });
  }

  private async handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
    const pi = event.data.object as {
      id: string;
      latest_charge?: string | null;
      amount: number;
      currency: string;
      metadata?: { orderId?: string; tenantId?: string };
    };

    const orderId = pi.metadata?.orderId;
    const tenantId = pi.metadata?.tenantId;

    if (!orderId || !tenantId) {
      this.logger.warn(
        { paymentIntentId: pi.id, eventId: event.id },
        'payment_intent.succeeded missing orderId or tenantId in metadata — ignoring.',
      );
      return;
    }

    const parsedTenantId = TenantId.parse(tenantId);
    const chargeId = pi.latest_charge ?? '';
    const pseudoEnvelope = { id: event.id, tenantId };

    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (tx) => {
      // ADR-0020 I-6: no ALS tenant in webhook path — use system tx + explicit tenantId.
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
        if (existingPayment && existingPayment.paymentIntentId !== pi.id) {
          this.logger.warn(
            { orderId, paymentIntentId: pi.id, existingPiId: existingPayment.paymentIntentId },
            'Orphan PaymentIntent succeeded on already-paid order — auto-refunding (D-06).',
          );
          await this.stripePort.createRefund({
            paymentIntentId: pi.id,
            connectedAccountId: existingPayment.stripeAccountId ?? '',
            refundRequestId: `orphan:${pi.id}`,
            reason: 'duplicate',
          });
        }
        return;
      }

      try {
        order.markPaid(pi.id);
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
          amount: fromMinorUnits(pi.amount),
          currency: pi.currency.toUpperCase(),
          paymentIntentId: pi.id,
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
            paymentIntentId: pi.id,
            chargeId,
            amountMinor: pi.amount,
            currency: pi.currency.toUpperCase(),
          },
          { tenantId },
        ),
        aggregateId: orderId,
      });
    });
  }

  private async handlePaymentIntentFailed(event: Stripe.Event): Promise<void> {
    const pi = event.data.object as {
      id: string;
      last_payment_error?: { code?: string | null } | null;
      metadata?: { orderId?: string; tenantId?: string };
    };

    const orderId = pi.metadata?.orderId;
    const tenantId = pi.metadata?.tenantId;

    if (!orderId || !tenantId) {
      this.logger.warn(
        { paymentIntentId: pi.id, eventId: event.id },
        'payment_intent.payment_failed missing orderId/tenantId — ignoring.',
      );
      return;
    }

    const parsedTenantId = TenantId.parse(tenantId);
    const failureCode = pi.last_payment_error?.code ?? 'unknown';
    const pseudoEnvelope = { id: event.id, tenantId };

    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (tx) => {
      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId: parsedTenantId,
          orderId,
          status: 'failed',
          amount: '0.00',
          currency: 'unknown',
          paymentIntentId: pi.id,
        },
        tx,
      );

      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          PaymentOrderFailedV1,
          {
            orderId,
            tenantId: parsedTenantId,
            paymentIntentId: pi.id,
            failureCode,
          },
          { tenantId },
        ),
        aggregateId: orderId,
      });
    });
  }

  private async handleRefund(event: Stripe.Event): Promise<void> {
    const charge = event.data.object as {
      id?: string;
      payment_intent?: string | null;
      refunds?: {
        data?: {
          id: string;
          amount: number;
          status: string | null;
        }[];
      } | null;
    };

    const piId = charge.payment_intent;
    if (!piId) {
      this.logger.warn({ eventId: event.id }, 'charge.refunded missing payment_intent — ignoring.');
      return;
    }

    const refundData = charge.refunds?.data?.[0];
    if (!refundData) {
      this.logger.warn({ eventId: event.id }, 'charge.refunded: no refund data — ignoring.');
      return;
    }

    const accountId = event.account;
    if (!accountId) {
      this.logger.warn(
        { eventId: event.id },
        'charge.refunded missing event.account — cannot resolve tenant, ignoring.',
      );
      return;
    }

    const tenant = await this.tenantRepo.findByStripeAccountId(accountId);
    if (!tenant) {
      this.logger.warn(
        { accountId, eventId: event.id },
        'charge.refunded for unregistered account — ignoring (W3).',
      );
      return;
    }

    const tenantId = tenant.toSnapshot().id;
    const pseudoEnvelope = { id: event.id, tenantId };

    await this.runDedupedFn(this.db, pseudoEnvelope, CONSUMER_NAME, async (tx) => {
      const payment = await this.paymentRepo.findByPaymentIntentId(tenantId, piId, tx);
      if (!payment) {
        this.logger.warn({ piId, tenantId }, 'charge.refunded: payment row not found — ignoring.');
        return;
      }

      const existingRefund = await this.paymentRepo.findRefundByStripeId(
        tenantId,
        refundData.id,
        tx,
      );
      if (existingRefund) {
        await this.paymentRepo.updateRefundStatus(
          tenantId,
          refundData.id,
          refundData.status ?? 'succeeded',
          tx,
        );
      } else {
        await this.paymentRepo.upsertRefund(
          {
            tenantId,
            paymentId: payment.id,
            stripeRefundId: refundData.id,
            amount: fromMinorUnits(refundData.amount),
            reason: 'webhook_reconcile',
            status: refundData.status ?? 'succeeded',
          },
          tx,
        );
      }

      const capturedMinor = toMinorUnits(payment.amount);
      const refundedMinor = refundData.amount;
      const fullyRefunded = refundedMinor >= capturedMinor;

      await appendToOutbox(tx, {
        envelope: buildEnvelope(
          PaymentOrderRefundedV1,
          {
            orderId: payment.orderId,
            tenantId,
            refundId: refundData.id,
            amountMinor: refundedMinor,
            fullyRefunded,
          },
          { tenantId },
        ),
        aggregateId: payment.orderId,
      });
    });
  }

  private async handleDisputeCreated(event: Stripe.Event): Promise<void> {
    const dispute = event.data.object as {
      id: string;
      payment_intent?: string | null;
      amount: number;
      reason?: string | null;
    };

    const piId = dispute.payment_intent;
    if (!piId) {
      this.logger.warn(
        { eventId: event.id },
        'charge.dispute.created missing payment_intent — ignoring.',
      );
      return;
    }

    const accountId = event.account;
    if (!accountId) {
      this.logger.warn(
        { eventId: event.id },
        'charge.dispute.created missing event.account — ignoring.',
      );
      return;
    }

    const tenant = await this.tenantRepo.findByStripeAccountId(accountId);
    if (!tenant) {
      this.logger.warn(
        { accountId, eventId: event.id },
        'charge.dispute.created for unregistered account — ignoring (W3).',
      );
      return;
    }

    const tenantId = tenant.toSnapshot().id;
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
            disputeId: dispute.id,
            amountMinor: dispute.amount,
            reason: dispute.reason ?? 'unknown',
          },
          { tenantId },
        ),
        aggregateId: payment.orderId,
      });

      this.logger.warn(
        { disputeId: dispute.id, piId, tenantId },
        'Dispute opened — recorded (D-11).',
      );
    });
  }
}
