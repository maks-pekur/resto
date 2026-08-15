import { Inject, Injectable } from '@nestjs/common';
import type { OrderId, TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../domain/ports';
import { InvalidPrepMinutesError, OrderNotFoundError } from '../domain/errors';
import type { OrderSnapshot } from '../domain/order.aggregate';

const MIN_PREP_MINUTES = 5;
const MAX_PREP_MINUTES = 180;

export interface AcceptOrderInput {
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly prepMinutes: number;
  readonly actorUserId: string | null;
}

@Injectable()
export class AcceptOrderService {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository) {}

  async execute(input: AcceptOrderInput): Promise<OrderSnapshot> {
    if (
      !Number.isInteger(input.prepMinutes) ||
      input.prepMinutes < MIN_PREP_MINUTES ||
      input.prepMinutes > MAX_PREP_MINUTES
    ) {
      throw new InvalidPrepMinutesError(input.prepMinutes);
    }

    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    const snap = order.toSnapshot();
    if (snap.status === 'accepted') {
      return snap;
    }

    const now = new Date();
    const etaAt = new Date(now.getTime() + input.prepMinutes * 60_000);
    order.accept(etaAt, input.actorUserId, now);
    await this.orderRepo.update(order);
    return order.toSnapshot();
  }
}
