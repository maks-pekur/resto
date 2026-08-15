import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getLocationId, requireBrandContext, requireTenantContext } from '@resto/db';
import { BrandId, OrderId, TenantId } from '@resto/domain';
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
    const brandId = BrandId.parse(requireBrandContext());
    const requestedLocationId = getLocationId();

    const order = await this.orderRepo.findById(OrderId.parse(input.orderId));
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }
    const snap = order.toSnapshot();

    const activeLocations = (await this.locations.listForBrand(brandId, tenantId)).filter(
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

    return { order: snap, hasFailedRefund: failedRefunds.length > 0 };
  }
}
