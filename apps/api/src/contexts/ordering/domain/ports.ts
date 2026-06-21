import type { OrderId, TenantId } from '@resto/domain';
import type { Order } from './order.aggregate';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  findByIdempotencyKey(tenantId: TenantId, key: string): Promise<Order | null>;
}

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface PricedMenuItemSize {
  readonly sizeId: string;
  readonly price: string;
}

export interface PricedMenuItem {
  readonly itemId: string;
  readonly categoryId: string;
  readonly basePrice: string;
  readonly sizes: readonly PricedMenuItemSize[];
  readonly modifierGroupIds: readonly string[];
}

export interface PricedModifierOption {
  readonly optionId: string;
  readonly groupId: string;
  readonly priceDelta: string;
  readonly freeAmount: number;
  readonly minAmount: number | null;
  readonly maxAmount: number | null;
}

export interface OrderingMenuSnapshot {
  readonly currency: string;
  readonly items: readonly PricedMenuItem[];
  readonly modifierOptions: readonly PricedModifierOption[];
  readonly stoppedItemIds: readonly string[];
}

// Server-authoritative pricing for the order path: the create-order service must
// never trust client-supplied prices (API review 2026-06-15 BLOCK-1). The adapter
// sources this from the published catalog, scoped by tenant+brand via ScopedTx+RLS.
export interface MenuPricingPort {
  loadSnapshot(tenantId: TenantId, brandId: string): Promise<OrderingMenuSnapshot>;
}

export const MENU_PRICING_PORT = Symbol('MENU_PRICING_PORT');
