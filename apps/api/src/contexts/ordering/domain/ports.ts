import type { RestoTx } from '@resto/db';
import type { OrderId, TenantId } from '@resto/domain';
import type { Order } from './order.aggregate';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  update(order: Order, tx?: RestoTx): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  // ADR-0020 I-6: background/webhook paths run under BYPASSRLS with no ALS tenant —
  // callers must supply tx + tenantId explicitly instead of using findById.
  findByIdInTx(tx: RestoTx, id: OrderId, tenantId: string): Promise<Order | null>;
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

export interface PricedModifierGroup {
  readonly groupId: string;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
}

export interface OrderingMenuSnapshot {
  readonly currency: string;
  readonly items: readonly PricedMenuItem[];
  readonly modifierGroups: readonly PricedModifierGroup[];
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
