import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getLocationId, requireTenantContext } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../tenancy/domain/ports';
import { PAYMENT_REPOSITORY, type PaymentRepository } from '../../payments/domain/ports';
import { ORDER_REPOSITORY, type OrderRepository } from '../domain/ports';
import { OrderNotFoundError } from '../domain/errors';
import type { OrderSnapshot } from '../domain/order.aggregate';

export interface GetOrderDetailInput {
  readonly orderId: string;
}

export interface OrderDetailResult {
  readonly order: OrderSnapshot;
  readonly hasFailedRefund: boolean;
  readonly failedRefundAmount: string | null;
  readonly failedRefundReason: string | null;
}

@Injectable()
export class GetOrderDetailService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
  ) {}

  async execute(input: GetOrderDetailInput): Promise<OrderDetailResult> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const requestedLocationId = getLocationId();

    const order = await this.orderRepo.findById(OrderId.parse(input.orderId));
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }
    const snap = order.toSnapshot();

    const activeLocations = (await this.locations.listForTenant(tenantId)).filter(
      (l) => l.status === 'active',
    );
    const inScope =
      requestedLocationId === undefined
        ? activeLocations.some((l) => l.id === snap.locationId)
        : requestedLocationId === snap.locationId &&
          activeLocations.some((l) => l.id === requestedLocationId);
    if (!inScope) {
      throw new NotFoundException();
    }

    const failedRefunds = await this.payments.findFailedRefundsForOrders(tenantId, [snap.id]);
    const failedRefund = failedRefunds[0];

    return {
      order: snap,
      hasFailedRefund: failedRefunds.length > 0,
      failedRefundAmount: failedRefund?.amount ?? null,
      failedRefundReason: failedRefund?.failureReason ?? null,
    };
  }
}
