import { ShoppingBag, Truck, UtensilsCrossed, type LucideIcon } from 'lucide-react';

export type OrderTypeKey = 'dine_in' | 'pickup' | 'delivery';

export interface OrderTypePresentation {
  readonly icon: LucideIcon;
  /** Key under `orders.card`, so a new type needs one line here and one per catalogue. */
  readonly labelKey: string;
  /** Each type keeps one colour everywhere it appears, so an operator reads the row by shape. */
  readonly tone: string;
}

export const ORDER_TYPES: Readonly<Record<OrderTypeKey, OrderTypePresentation>> = {
  dine_in: { icon: UtensilsCrossed, labelKey: 'orderTypeDineIn', tone: 'text-info' },
  pickup: { icon: ShoppingBag, labelKey: 'orderTypePickup', tone: 'text-warning' },
  delivery: { icon: Truck, labelKey: 'orderTypeDelivery', tone: 'text-success' },
};

export const orderTypePresentation = (orderType: string): OrderTypePresentation =>
  (ORDER_TYPES as Partial<Record<string, OrderTypePresentation>>)[orderType] ?? {
    icon: ShoppingBag,
    labelKey: 'orderTypePickup',
    tone: 'text-muted-foreground',
  };
