import { Inject, Injectable } from '@nestjs/common';
import type { OrderId, TenantId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../domain/ports';
import { OrderNotFoundError } from '../domain/errors';
import type { OrderSnapshot } from '../domain/order.aggregate';

export type AdvanceOrderTargetStatus = 'preparing' | 'ready' | 'completed';

export interface AdvanceOrderStatusInput {
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly targetStatus: AdvanceOrderTargetStatus;
  readonly actorUserId: string | null;
}

@Injectable()
export class AdvanceOrderStatusService {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orderRepo: OrderRepository) {}

  async execute(input: AdvanceOrderStatusInput): Promise<OrderSnapshot> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    const snap = order.toSnapshot();
    if (snap.status === input.targetStatus) {
      return snap;
    }

    const now = new Date();
    switch (input.targetStatus) {
      case 'preparing':
        order.startPreparing(input.actorUserId, now);
        break;
      case 'ready':
        order.markReady(input.actorUserId, now);
        break;
      case 'completed':
        order.complete(input.actorUserId, now);
        break;
    }

    await this.orderRepo.update(order);
    return order.toSnapshot();
  }
}
