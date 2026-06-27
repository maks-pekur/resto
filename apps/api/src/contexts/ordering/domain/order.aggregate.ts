import { randomUUID } from 'node:crypto';
import { OrderId, type Currency, type TenantId } from '@resto/domain';
import type { OrderDomainEvent } from './events';
import { InvalidOrderTransitionError, RefundExceedsCapturedError } from './errors';
import { toMinorUnits, fromMinorUnits } from './money-utils';
import { applyDiscount, type DiscountSpec } from './discount';

export type OrderStatus =
  | 'created'
  | 'requires_action'
  | 'paid'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'canceled'
  | 'refunded'
  | 'failed';

export interface OrderModifierSnapshot {
  readonly optionId: string;
  readonly nameSnapshot: string;
  readonly priceDelta: string;
  readonly amount: number;
  readonly modifierGroupId: string | null;
}

export interface OrderItemSnapshot {
  readonly id: string;
  readonly menuItemId: string;
  readonly nameSnapshot: string;
  readonly unitPrice: string;
  readonly currency: Currency;
  readonly modifiers: readonly OrderModifierSnapshot[];
  readonly quantity: number;
  readonly lineTotal: string;
  readonly categoryId: string;
}

export interface OrderSnapshot {
  readonly id: OrderId;
  readonly tenantId: TenantId;
  readonly brandId: string;
  readonly idempotencyKey: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly fulfillmentMode: 'dine_in' | 'pickup' | 'delivery';
  readonly tableIdentifier: string | null;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly customerEmail: string | null;
  readonly items: readonly OrderItemSnapshot[];
  readonly subtotal: string;
  readonly deliveryFee: string;
  readonly serviceFee: string;
  readonly discount: string;
  readonly total: string;
  readonly currency: Currency;
  readonly scheduledFor: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateOrderInput {
  readonly tenantId: TenantId;
  readonly brandId: string;
  readonly idempotencyKey: string;
  readonly orderNumber: string;
  readonly fulfillmentMode: 'dine_in' | 'pickup' | 'delivery';
  readonly tableIdentifier?: string | null;
  readonly customerName?: string | null;
  readonly customerPhone?: string | null;
  readonly customerEmail?: string | null;
  readonly items: readonly {
    readonly menuItemId: string;
    readonly nameSnapshot: string;
    readonly unitPrice: string;
    readonly currency: Currency;
    readonly modifiers: readonly {
      readonly optionId: string;
      readonly nameSnapshot: string;
      readonly priceDelta: string;
      readonly amount: number;
      readonly freeAmount?: number;
      readonly modifierGroupId: string | null;
    }[];
    readonly quantity: number;
    readonly categoryId: string;
  }[];
  readonly currency: Currency;
  readonly discountSpec?: DiscountSpec | null;
  readonly scheduledFor?: Date | null;
}

function computeTotals(
  items: CreateOrderInput['items'],
  discountSpec: DiscountSpec | null | undefined,
): {
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  itemSnapshots: OrderItemSnapshot[];
} {
  const itemSnapshots: OrderItemSnapshot[] = [];
  let subtotalMinor = 0;

  for (const item of items) {
    const unitMinor = toMinorUnits(item.unitPrice);
    const modifierMinor = item.modifiers.reduce(
      (sum, m) => sum + toMinorUnits(m.priceDelta) * Math.max(0, m.amount - (m.freeAmount ?? 0)),
      0,
    );
    const lineCostMinor = Math.round(unitMinor + modifierMinor) * item.quantity;
    subtotalMinor += lineCostMinor;

    itemSnapshots.push({
      id: randomUUID(),
      menuItemId: item.menuItemId,
      nameSnapshot: item.nameSnapshot,
      unitPrice: item.unitPrice,
      currency: item.currency,
      modifiers: item.modifiers.map((m) => ({
        optionId: m.optionId,
        nameSnapshot: m.nameSnapshot,
        priceDelta: m.priceDelta,
        amount: m.amount,
        modifierGroupId: m.modifierGroupId,
      })),
      quantity: item.quantity,
      lineTotal: fromMinorUnits(lineCostMinor),
      categoryId: item.categoryId,
    });
  }

  const lineDrafts = itemSnapshots.map((s) => ({
    itemId: s.menuItemId,
    categoryId: s.categoryId,
    lineTotal: toMinorUnits(s.lineTotal),
  }));

  const discountMinor = applyDiscount(lineDrafts, discountSpec ?? null);
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);

  return { subtotalMinor, discountMinor, totalMinor, itemSnapshots };
}

export class Order {
  readonly #events: OrderDomainEvent[] = [];

  private constructor(private snapshot: OrderSnapshot) {}

  static fromSnapshot(snapshot: OrderSnapshot): Order {
    return new Order(snapshot);
  }

  static create(input: CreateOrderInput): Order {
    const id = OrderId.parse(randomUUID());
    const now = new Date();

    const { subtotalMinor, discountMinor, totalMinor, itemSnapshots } = computeTotals(
      input.items,
      input.discountSpec,
    );

    const snapshot: OrderSnapshot = {
      id,
      tenantId: input.tenantId,
      brandId: input.brandId,
      idempotencyKey: input.idempotencyKey,
      orderNumber: input.orderNumber,
      status: 'created',
      fulfillmentMode: input.fulfillmentMode,
      tableIdentifier: input.tableIdentifier ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      customerEmail: input.customerEmail ?? null,
      items: Object.freeze(itemSnapshots),
      subtotal: fromMinorUnits(subtotalMinor),
      deliveryFee: '0.00',
      serviceFee: '0.00',
      discount: fromMinorUnits(discountMinor),
      total: fromMinorUnits(totalMinor),
      currency: input.currency,
      scheduledFor: input.scheduledFor ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const order = new Order(snapshot);
    order.#events.push({
      kind: 'OrderCreated',
      orderId: id,
      tenantId: input.tenantId,
      brandId: input.brandId,
      orderNumber: input.orderNumber,
      fulfillmentMode: input.fulfillmentMode,
      totalMinorUnits: totalMinor,
      currency: input.currency,
      itemCount: itemSnapshots.length,
      occurredAt: now,
    });
    return order;
  }

  markPaid(paymentId: string, now: Date = new Date()): void {
    if (this.snapshot.status !== 'created' && this.snapshot.status !== 'requires_action') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'paid');
    }
    this.snapshot = { ...this.snapshot, status: 'paid', updatedAt: now };
    this.#events.push({
      kind: 'OrderPaid',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      paymentId,
      occurredAt: now,
    });
  }

  requireAction(paymentIntentId: string, now: Date = new Date()): void {
    if (this.snapshot.status !== 'created') {
      throw new InvalidOrderTransitionError(
        this.snapshot.id,
        this.snapshot.status,
        'requires_action',
      );
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'requires_action', updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      previousStatus,
      newStatus: 'requires_action',
      occurredAt: now,
    });
    void paymentIntentId;
  }

  accept(now: Date = new Date()): void {
    if (this.snapshot.status !== 'paid') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'accepted');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'accepted', updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      previousStatus,
      newStatus: 'accepted',
      occurredAt: now,
    });
  }

  startPreparing(now: Date = new Date()): void {
    if (this.snapshot.status !== 'accepted') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'preparing');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'preparing', updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      previousStatus,
      newStatus: 'preparing',
      occurredAt: now,
    });
  }

  markReady(now: Date = new Date()): void {
    if (this.snapshot.status !== 'preparing') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'ready');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'ready', updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      previousStatus,
      newStatus: 'ready',
      occurredAt: now,
    });
  }

  complete(now: Date = new Date()): void {
    if (this.snapshot.status !== 'ready') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'completed');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'completed', updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      previousStatus,
      newStatus: 'completed',
      occurredAt: now,
    });
  }

  cancel(reason: string, now: Date = new Date()): void {
    if (this.snapshot.status !== 'created' && this.snapshot.status !== 'paid') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'canceled');
    }
    this.snapshot = { ...this.snapshot, status: 'canceled', updatedAt: now };
    this.#events.push({
      kind: 'OrderCanceled',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      reason,
      occurredAt: now,
    });
  }

  refund(amountMinor: number, alreadyRefundedMinor: number, now: Date = new Date()): void {
    if (this.snapshot.status !== 'paid') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'refunded');
    }
    const capturedMinor = toMinorUnits(this.snapshot.total);
    if (amountMinor <= 0 || amountMinor + alreadyRefundedMinor > capturedMinor) {
      throw new RefundExceedsCapturedError(
        this.snapshot.id,
        amountMinor,
        alreadyRefundedMinor,
        capturedMinor,
      );
    }
    const isFullRefund = amountMinor + alreadyRefundedMinor === capturedMinor;
    const newStatus: OrderStatus = isFullRefund ? 'refunded' : 'paid';
    this.snapshot = { ...this.snapshot, status: newStatus, updatedAt: now };
    this.#events.push({
      kind: 'OrderRefunded',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      amount: amountMinor,
      occurredAt: now,
    });
  }

  markFailed(reason: string, now: Date = new Date()): void {
    if (this.snapshot.status !== 'created' && this.snapshot.status !== 'paid') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'failed');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'failed', updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      previousStatus,
      newStatus: `failed:${reason}`,
      occurredAt: now,
    });
  }

  toSnapshot(): OrderSnapshot {
    return this.snapshot;
  }

  pullEvents(): OrderDomainEvent[] {
    const events = [...this.#events];
    this.#events.length = 0;
    return events;
  }
}
