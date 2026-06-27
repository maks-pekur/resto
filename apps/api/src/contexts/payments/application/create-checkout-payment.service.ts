import { Inject, Injectable } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import {
  STRIPE_CONNECT_PORT,
  TENANT_REPOSITORY,
  type StripeConnectPort,
  type TenantRepository,
} from '../../tenancy/domain/ports';
import { PAYMENT_REPOSITORY, type PaymentRepository } from '../domain/ports';
import {
  CurrencyMismatchError,
  OrderNotCheckoutableError,
  PaymentsNotEnabledError,
} from '../domain/errors';
import { fromMinorUnits, toMinorUnits } from '../../ordering/domain/money-utils';
import type { CreatePaymentIntentResponse } from './dto';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';

export interface CheckoutInput {
  readonly orderId: string;
  readonly tenantId: TenantId;
}

@Injectable()
export class CreateCheckoutPaymentService {
  readonly #applicationFeeMinor: number;

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: TenantRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: PaymentRepository,
    @Inject(STRIPE_CONNECT_PORT) private readonly stripePort: StripeConnectPort,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
    @Inject(ENV_TOKEN) envOrFeeOverride: Env | number,
  ) {
    this.#applicationFeeMinor =
      typeof envOrFeeOverride === 'number'
        ? envOrFeeOverride
        : envOrFeeOverride.STRIPE_APPLICATION_FEE_AMOUNT;
  }

  async execute(input: CheckoutInput): Promise<CreatePaymentIntentResponse> {
    const orderId = OrderId.parse(input.orderId);

    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      const { OrderNotFoundError } = await import('../../ordering/domain/errors');
      throw new OrderNotFoundError(input.orderId);
    }

    const snap = order.toSnapshot();

    if (snap.status !== 'created' && snap.status !== 'requires_action') {
      throw new OrderNotCheckoutableError(input.orderId, snap.status);
    }

    const tenant = await this.tenantRepo.findById(input.tenantId);
    if (!tenant) {
      const { OrderNotFoundError } = await import('../../ordering/domain/errors');
      throw new OrderNotFoundError(input.orderId);
    }

    if (!tenant.canAcceptPayments()) {
      throw new PaymentsNotEnabledError(input.tenantId);
    }

    const tenantSnap = tenant.toSnapshot();
    const tenantCurrency: string = tenantSnap.defaultCurrency;
    const orderCurrency: string = snap.currency;

    if (orderCurrency.toUpperCase() !== tenantCurrency.toUpperCase()) {
      throw new CurrencyMismatchError(orderCurrency, tenantCurrency);
    }

    const connectedAccountId = tenantSnap.stripeAccountId ?? '';
    if (!connectedAccountId) {
      throw new PaymentsNotEnabledError(input.tenantId);
    }

    const result = await this.db.withTenant(async (tx) => {
      const existingPayment = await this.paymentRepo.findByOrderId(input.tenantId, snap.id, tx);

      let attempt = 0;

      if (existingPayment?.paymentIntentId) {
        const isTerminal =
          existingPayment.status === 'succeeded' ||
          existingPayment.status === 'canceled' ||
          existingPayment.status === 'orphan';

        if (!isTerminal) {
          await this.stripePort.cancelPaymentIntent({
            paymentIntentId: existingPayment.paymentIntentId,
            connectedAccountId,
            reason: 'abandoned',
          });
          attempt = 1;
        }
      }

      const amountMinor = toMinorUnits(snap.total);

      const piResult = await this.stripePort.createPaymentIntent({
        orderId: snap.id,
        connectedAccountId,
        amountMinor,
        currency: tenantCurrency,
        applicationFeeMinor: this.#applicationFeeMinor,
        attempt,
        metadata: {
          orderId: snap.id,
          tenantId: input.tenantId,
        },
      });

      if (snap.status === 'created') {
        order.requireAction(piResult.paymentIntentId);
        await this.orderRepo.save(order);
      }

      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId: input.tenantId,
          orderId: snap.id,
          status: 'requires_action',
          amount: fromMinorUnits(amountMinor),
          currency: tenantCurrency.toUpperCase(),
          paymentIntentId: piResult.paymentIntentId,
          stripeAccountId: connectedAccountId,
          applicationFeeAmount: fromMinorUnits(this.#applicationFeeMinor),
        },
        tx,
      );

      return {
        clientSecret: piResult.clientSecret,
        connectedAccountId,
        orderId: snap.id,
      };
    });

    return result;
  }
}
