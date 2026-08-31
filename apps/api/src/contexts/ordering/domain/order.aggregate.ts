import { randomUUID } from 'node:crypto';
import { OrderId, type Currency, type TenantId } from '@resto/domain';
import type { OrderDomainEvent } from './events';
import {
  InvalidOrderTransitionError,
  InvalidCancelReasonError,
  RefundExceedsCapturedError,
} from './errors';
import { toMinorUnits, fromMinorUnits } from './money-utils';
import { applyDiscount, type DiscountSpec } from './discount';

/** How far the kitchen has taken the order. Money is `OrderPaymentState`'s business. */
export type OrderStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'canceled';

/** Whether the money arrived, which a guest may settle before or after staff confirm the order. */
export type OrderPaymentState = 'pending' | 'requires_action' | 'paid' | 'failed' | 'refunded';

const CANCEL_REASON_CODES = [
  'guest_no_show',
  'kitchen_out_of_stock',
  'kitchen_too_busy',
  'guest_requested',
  'payment_issue',
  'duplicate_order',
  'other',
] as const;
type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];

function isCancelReasonCode(value: string): value is CancelReasonCode {
  return (CANCEL_REASON_CODES as readonly string[]).includes(value);
}

const CANCELABLE_STATUSES: readonly OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];

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
  readonly locationId: string;
  readonly idempotencyKey: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly paymentState: OrderPaymentState;
  readonly paidAt: Date | null;
  readonly orderType: 'dine_in' | 'pickup' | 'delivery';
  readonly tableIdentifier: string | null;
  readonly tableId: string | null;
  readonly tableZoneName: string | null;
  readonly tableNumber: string | null;
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
  readonly shortNumber: number;
  readonly channel: 'site' | 'qr-menu';
  /** How the guest means to pay; whether they have is the payments table's business. */
  readonly paymentType: 'online' | 'cash' | 'card_on_delivery';
  readonly acceptedAt: Date | null;
  readonly preparingAt: Date | null;
  readonly readyAt: Date | null;
  readonly completedAt: Date | null;
  readonly canceledAt: Date | null;
  readonly acceptedByUserId: string | null;
  readonly canceledByUserId: string | null;
  readonly cancelReason: string | null;
  readonly cancelNote: string | null;
  readonly canceledFromStatus: OrderStatus | null;
  readonly etaAt: Date | null;
  readonly marketingConsent: boolean;
  readonly marketingConsentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateOrderInput {
  readonly tenantId: TenantId;
  readonly locationId: string;
  readonly idempotencyKey: string;
  readonly orderNumber: string;
  readonly orderType: 'dine_in' | 'pickup' | 'delivery';
  readonly tableIdentifier?: string | null;
  readonly tableId?: string | null;
  readonly tableZoneName?: string | null;
  readonly tableNumber?: string | null;
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
  readonly shortNumber: number;
  readonly channel?: 'site' | 'qr-menu';
  readonly paymentType?: 'online' | 'cash' | 'card_on_delivery';
  readonly marketingConsent?: boolean;
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

    const marketingConsent = input.marketingConsent ?? false;

    const snapshot: OrderSnapshot = {
      id,
      tenantId: input.tenantId,
      locationId: input.locationId,
      idempotencyKey: input.idempotencyKey,
      orderNumber: input.orderNumber,
      status: 'placed',
      paymentState: 'pending',
      paidAt: null,
      orderType: input.orderType,
      tableIdentifier: input.tableIdentifier ?? null,
      tableId: input.tableId ?? null,
      tableZoneName: input.tableZoneName ?? null,
      tableNumber: input.tableNumber ?? null,
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
      shortNumber: input.shortNumber,
      channel: input.channel ?? 'site',
      paymentType: input.paymentType ?? 'online',
      acceptedAt: null,
      preparingAt: null,
      readyAt: null,
      completedAt: null,
      canceledAt: null,
      acceptedByUserId: null,
      canceledByUserId: null,
      cancelReason: null,
      cancelNote: null,
      canceledFromStatus: null,
      etaAt: null,
      marketingConsent,
      marketingConsentAt: marketingConsent ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    const order = new Order(snapshot);
    order.#events.push({
      kind: 'OrderCreated',
      orderId: id,
      tenantId: input.tenantId,
      locationId: input.locationId,
      orderNumber: input.orderNumber,
      orderType: input.orderType,
      totalMinorUnits: totalMinor,
      currency: input.currency,
      itemCount: itemSnapshots.length,
      occurredAt: now,
    });
    return order;
  }

  markPaid(paymentId: string, now: Date = new Date()): void {
    // Money can arrive before staff confirm the order or long after: only a cancelled order
    // refuses it, and where the kitchen has got to is none of this method's business.
    if (this.snapshot.status === 'canceled') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'paid');
    }
    this.snapshot = { ...this.snapshot, paymentState: 'paid', paidAt: now, updatedAt: now };
    this.#events.push({
      kind: 'OrderPaid',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      paymentId,
      total: this.snapshot.total,
      currency: this.snapshot.currency,
      occurredAt: now,
    });
  }

  requireAction(paymentIntentId: string, now: Date = new Date()): void {
    if (this.snapshot.paymentState !== 'pending') {
      throw new InvalidOrderTransitionError(
        this.snapshot.id,
        this.snapshot.status,
        'requires_action',
      );
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, paymentState: 'requires_action', updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      previousStatus,
      newStatus: 'requires_action',
      actorUserId: null,
      occurredAt: now,
    });
    void paymentIntentId;
  }

  accept(etaAt: Date | null, actorUserId: string | null, now: Date = new Date()): void {
    // Confirmation is about the kitchen taking the order on, which a guest paying at the table
    // does after this point, not before.
    if (this.snapshot.status !== 'placed') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'accepted');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = {
      ...this.snapshot,
      status: 'accepted',
      acceptedAt: now,
      acceptedByUserId: actorUserId,
      etaAt,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      previousStatus,
      newStatus: 'accepted',
      actorUserId,
      occurredAt: now,
    });
  }

  startPreparing(actorUserId: string | null, now: Date = new Date()): void {
    if (this.snapshot.status !== 'accepted') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'preparing');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'preparing', preparingAt: now, updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      previousStatus,
      newStatus: 'preparing',
      actorUserId,
      occurredAt: now,
    });
  }

  markReady(actorUserId: string | null, now: Date = new Date()): void {
    if (this.snapshot.status !== 'preparing') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'ready');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'ready', readyAt: now, updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      previousStatus,
      newStatus: 'ready',
      actorUserId,
      occurredAt: now,
    });
  }

  complete(actorUserId: string | null, now: Date = new Date()): void {
    if (this.snapshot.status !== 'ready') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'completed');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, status: 'completed', completedAt: now, updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      previousStatus,
      newStatus: 'completed',
      actorUserId,
      occurredAt: now,
    });
  }

  cancel(
    reasonCode: string,
    cancelNote: string | null,
    actorUserId: string | null,
    now: Date = new Date(),
  ): void {
    if (!CANCELABLE_STATUSES.includes(this.snapshot.status)) {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'canceled');
    }
    if (!isCancelReasonCode(reasonCode)) {
      throw new InvalidCancelReasonError(reasonCode);
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = {
      ...this.snapshot,
      status: 'canceled',
      canceledAt: now,
      canceledByUserId: actorUserId,
      cancelReason: reasonCode,
      cancelNote,
      canceledFromStatus: previousStatus,
      updatedAt: now,
    };
    this.#events.push({
      kind: 'OrderCanceled',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      reason: cancelNote ?? reasonCode,
      reasonCode,
      canceledFromStatus: previousStatus,
      actorUserId,
      occurredAt: now,
    });
  }

  refund(amountMinor: number, alreadyRefundedMinor: number, now: Date = new Date()): void {
    const capturedMinor = toMinorUnits(this.snapshot.total);
    if (amountMinor <= 0 || amountMinor + alreadyRefundedMinor > capturedMinor) {
      throw new RefundExceedsCapturedError(
        this.snapshot.id,
        amountMinor,
        alreadyRefundedMinor,
        capturedMinor,
      );
    }
    const fullyRefunded = amountMinor + alreadyRefundedMinor >= capturedMinor;
    this.snapshot = {
      ...this.snapshot,
      ...(fullyRefunded ? { paymentState: 'refunded' as const, paidAt: null } : {}),
      updatedAt: now,
    };
    this.#events.push({
      kind: 'OrderRefunded',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      amount: amountMinor,
      currency: this.snapshot.currency,
      occurredAt: now,
    });
  }

  markFailed(reason: string, now: Date = new Date()): void {
    if (this.snapshot.paymentState === 'refunded') {
      throw new InvalidOrderTransitionError(this.snapshot.id, this.snapshot.status, 'failed');
    }
    const previousStatus = this.snapshot.status;
    this.snapshot = { ...this.snapshot, paymentState: 'failed', paidAt: null, updatedAt: now };
    this.#events.push({
      kind: 'OrderStatusChanged',
      orderId: this.snapshot.id,
      tenantId: this.snapshot.tenantId,
      locationId: this.snapshot.locationId,
      previousStatus,
      newStatus: `failed:${reason}`,
      actorUserId: null,
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
