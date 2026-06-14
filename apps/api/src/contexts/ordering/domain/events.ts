import type { OrderId, TenantId, Currency } from '@resto/domain';

export interface OrderCreatedDomainEvent {
  readonly kind: 'OrderCreated';
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly brandId: string;
  readonly orderNumber: string;
  readonly fulfillmentMode: 'dine_in' | 'pickup' | 'delivery';
  readonly totalMinorUnits: number;
  readonly currency: Currency;
  readonly itemCount: number;
  readonly occurredAt: Date;
}

export interface OrderPaidDomainEvent {
  readonly kind: 'OrderPaid';
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly paymentId: string;
  readonly occurredAt: Date;
}

export interface OrderCanceledDomainEvent {
  readonly kind: 'OrderCanceled';
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly reason: string;
  readonly occurredAt: Date;
}

export interface OrderRefundedDomainEvent {
  readonly kind: 'OrderRefunded';
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly amount: number;
  readonly occurredAt: Date;
}

export interface OrderStatusChangedDomainEvent {
  readonly kind: 'OrderStatusChanged';
  readonly orderId: OrderId;
  readonly tenantId: TenantId;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly occurredAt: Date;
}

export type OrderDomainEvent =
  | OrderCreatedDomainEvent
  | OrderPaidDomainEvent
  | OrderCanceledDomainEvent
  | OrderRefundedDomainEvent
  | OrderStatusChangedDomainEvent;
