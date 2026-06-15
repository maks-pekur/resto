import type { OrderId, TenantId } from '@resto/domain';
import type { Order } from './order.aggregate';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  findByIdempotencyKey(tenantId: TenantId, key: string): Promise<Order | null>;
}

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
