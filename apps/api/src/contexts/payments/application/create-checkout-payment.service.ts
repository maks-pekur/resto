import { Inject, Injectable } from '@nestjs/common';
import { TenantAwareDb } from '@resto/db';
import { BrandId, OrderId, TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { BRAND_REPOSITORY, type BrandRepository } from '../../tenancy/domain/ports';
import { Brand } from '../../tenancy/domain/brand.aggregate';
import {
  PAYMENT_PROVIDER_PORT,
  PAYMENT_REPOSITORY,
  type PaymentProviderPort,
  type PaymentRepository,
} from '../domain/ports';
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
    @Inject(BRAND_REPOSITORY) private readonly brandRepo: BrandRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: PaymentRepository,
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
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

    const brandSnap = await this.brandRepo.findById(BrandId.parse(snap.brandId));
    if (!brandSnap?.defaultCurrency || !Brand.fromSnapshot(brandSnap).canAcceptPayments()) {
      throw new PaymentsNotEnabledError(snap.brandId);
    }

    const brandCurrency: string = brandSnap.defaultCurrency;
    const orderCurrency: string = snap.currency;

    if (orderCurrency.toUpperCase() !== brandCurrency.toUpperCase()) {
      throw new CurrencyMismatchError(orderCurrency, brandCurrency);
    }

    const connectedAccountId = brandSnap.stripeAccountId ?? '';
    if (!connectedAccountId) {
      throw new PaymentsNotEnabledError(snap.brandId);
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
          await this.provider.cancelPaymentIntent({
            paymentIntentId: existingPayment.paymentIntentId,
            connectedAccountId,
            reason: 'abandoned',
          });
          attempt = 1;
        }
      }

      const amountMinor = toMinorUnits(snap.total);

      const piResult = await this.provider.createPaymentIntent({
        orderId: snap.id,
        connectedAccountId,
        amountMinor,
        currency: brandCurrency,
        applicationFeeMinor: this.#applicationFeeMinor,
        attempt,
        metadata: {
          orderId: snap.id,
          tenantId: input.tenantId,
          brandId: snap.brandId,
        },
      });

      if (snap.status === 'created') {
        order.requireAction(piResult.paymentIntentId);
        await this.orderRepo.update(order, tx);
      }

      await this.paymentRepo.upsertByPaymentIntentId(
        {
          tenantId: input.tenantId,
          orderId: snap.id,
          status: 'requires_action',
          amount: fromMinorUnits(amountMinor),
          currency: brandCurrency.toUpperCase(),
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
