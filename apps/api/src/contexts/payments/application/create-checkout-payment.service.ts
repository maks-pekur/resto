import { Inject, Injectable } from '@nestjs/common';
import { OrderId, TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../../ordering/domain/ports';
import { TENANT_REPOSITORY, type TenantRepository } from '../../tenancy/domain/ports';
import { OrderNotCheckoutableError, PaymentsNotEnabledError } from '../domain/errors';

export interface CheckoutInput {
  readonly orderId: string;
  readonly tenantId: TenantId;
}

// D-06/D-07: checkout is disabled until Plan 03 wires brand-level Stripe connected account.
// Full implementation lives in git history; re-enabled when BrandRepository.findByStripeAccountId
// and brand payment columns are wired into this service.
@Injectable()
export class CreateCheckoutPaymentService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: TenantRepository,
  ) {}

  async execute(input: CheckoutInput): Promise<never> {
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

    throw new PaymentsNotEnabledError(input.tenantId);
  }
}
