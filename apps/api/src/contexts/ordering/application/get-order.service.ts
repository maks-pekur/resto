import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { OrderId } from '@resto/domain';
import { ORDER_REPOSITORY, type OrderRepository } from '../domain/ports';
import { OrderNotFoundError } from '../domain/errors';
import type { OrderSnapshot } from '../domain/order.aggregate';

@Injectable()
export class GetOrderService {
  constructor(@Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository) {}

  async execute(input: { orderId: string }): Promise<OrderSnapshot> {
    requireTenantContext();
    const order = await this.repo.findById(OrderId.parse(input.orderId));
    if (!order) throw new OrderNotFoundError(input.orderId);
    return order.toSnapshot();
  }
}
