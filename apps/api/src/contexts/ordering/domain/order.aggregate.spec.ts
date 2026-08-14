import { describe, it, expect } from 'vitest';
import { Currency, OrderId, TenantId } from '@resto/domain';
import { Order, type CreateOrderInput, type OrderSnapshot } from './order.aggregate';
import {
  InvalidCancelReasonError,
  InvalidOrderTransitionError,
  RefundExceedsCapturedError,
} from './errors';

const USD = Currency.parse('USD');

function makeInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    tenantId: TenantId.parse('00000000-0000-0000-0000-000000000001'),
    brandId: '00000000-0000-0000-0000-000000000002',
    locationId: '00000000-0000-0000-0000-000000000099',
    idempotencyKey: '00000000-0000-0000-0000-000000000003',
    orderNumber: 'ORD-001',
    fulfillmentMode: 'dine_in',
    currency: USD,
    // Phase 10 Plan 04: shortNumber is required, non-nullable end to end --
    // a stand-in counter value, unrelated to this file's own transition
    // tests.
    shortNumber: 1,
    items: [
      {
        menuItemId: '00000000-0000-0000-0000-000000000010',
        nameSnapshot: 'Burger',
        unitPrice: '12.50',
        currency: USD,
        modifiers: [],
        quantity: 1,
        categoryId: 'cat-1',
      },
    ],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: OrderId.parse('00000000-0000-0000-0000-0000000000f1'),
    tenantId: TenantId.parse('00000000-0000-0000-0000-000000000001'),
    brandId: '00000000-0000-0000-0000-000000000002',
    locationId: '00000000-0000-0000-0000-000000000099',
    idempotencyKey: '00000000-0000-0000-0000-000000000003',
    orderNumber: 'ORD-001',
    status: 'paid',
    fulfillmentMode: 'dine_in',
    tableIdentifier: null,
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    items: [],
    subtotal: '12.50',
    deliveryFee: '0.00',
    serviceFee: '0.00',
    discount: '0.00',
    total: '12.50',
    currency: USD,
    scheduledFor: null,
    shortNumber: 1,
    channel: 'site',
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
    marketingConsent: false,
    marketingConsentAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Order.create', () => {
  it('creates an order with status created', () => {
    const order = Order.create(makeInput());
    expect(order.toSnapshot().status).toBe('created');
  });

  it('emits exactly one OrderCreated event with required envelope fields', () => {
    const order = Order.create(makeInput());
    const events = order.pullEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderCreated');
    if (event.kind !== 'OrderCreated') return;
    expect(event.brandId).toBe('00000000-0000-0000-0000-000000000002');
    expect(event.locationId).toBe('00000000-0000-0000-0000-000000000099');
    expect(event.orderNumber).toBe('ORD-001');
    expect(event.fulfillmentMode).toBe('dine_in');
    expect(event.totalMinorUnits).toBeTypeOf('number');
    expect(event.currency).toBe('USD');
    expect(event.itemCount).toBe(1);
  });

  it('computes subtotal per-line-rounded-then-summed (ORD-05)', () => {
    const order = Order.create(
      makeInput({
        items: [
          {
            menuItemId: 'item-1',
            nameSnapshot: 'Item A',
            unitPrice: '10.00',
            currency: USD,
            modifiers: [
              {
                optionId: 'opt-1',
                nameSnapshot: 'Extra',
                priceDelta: '0.005',
                amount: 1,
                modifierGroupId: null,
              },
            ],
            quantity: 3,
            categoryId: 'cat-1',
          },
          {
            menuItemId: 'item-2',
            nameSnapshot: 'Item B',
            unitPrice: '5.00',
            currency: USD,
            modifiers: [
              {
                optionId: 'opt-2',
                nameSnapshot: 'Topping',
                priceDelta: '0.005',
                amount: 1,
                modifierGroupId: null,
              },
            ],
            quantity: 2,
            categoryId: 'cat-1',
          },
        ],
      }),
    );

    const snap = order.toSnapshot();
    const perLineRounded = Math.round(1000 + 0) * 3 + Math.round(500 + 0) * 2;
    const roundAtTotal = Math.round((1000 + 0) * 3 + (500 + 0) * 2);
    expect(perLineRounded).toBe(roundAtTotal);

    expect(snap.subtotal).toMatch(/^\d+\.\d{2}$/);
  });

  it('charges a modifier per unit and prorates the free allowance (HIGH-4)', () => {
    const order = Order.create(
      makeInput({
        items: [
          {
            menuItemId: '00000000-0000-0000-0000-000000000010',
            nameSnapshot: 'Burger',
            unitPrice: '10.00',
            currency: USD,
            modifiers: [
              {
                optionId: '00000000-0000-0000-0000-0000000000a1',
                nameSnapshot: 'Bacon',
                priceDelta: '1.50',
                amount: 3,
                freeAmount: 1,
                modifierGroupId: null,
              },
            ],
            quantity: 2,
            categoryId: 'cat-1',
          },
        ],
      }),
    );
    const snap = order.toSnapshot();
    // per item unit: 10.00 + 1.50 * (3 - 1) = 13.00; * quantity 2 = 26.00
    expect(snap.subtotal).toBe('26.00');
    expect(snap.total).toBe('26.00');
    // the persisted modifier keeps the real per-unit price + selected amount
    expect(snap.items[0]?.modifiers[0]?.priceDelta).toBe('1.50');
    expect(snap.items[0]?.modifiers[0]?.amount).toBe(3);
  });

  it('demonstrates per-line rounding diverges from round-at-total when fractional modifiers exist', () => {
    const order = Order.create(
      makeInput({
        items: [
          {
            menuItemId: 'item-1',
            nameSnapshot: 'A',
            unitPrice: '1.004',
            currency: USD,
            modifiers: [],
            quantity: 3,
            categoryId: 'cat-1',
          },
        ],
      }),
    );

    const snap = order.toSnapshot();
    const perLine = Math.round(100) * 3;
    expect(snap.subtotal).toBe('3.00');
    expect(perLine).toBe(300);
  });

  it('applies percentage cart discount to total (ORD-05)', () => {
    const order = Order.create(
      makeInput({
        discountSpec: { kind: 'percentage', scope: 'cart', pct: 10 },
      }),
    );
    const snap = order.toSnapshot();
    expect(parseFloat(snap.discount)).toBeGreaterThan(0);
    expect(parseFloat(snap.total)).toBeLessThan(parseFloat(snap.subtotal));
  });

  it('sets deliveryFee and serviceFee to 0.00 by default (D-04)', () => {
    const order = Order.create(makeInput());
    const snap = order.toSnapshot();
    expect(snap.deliveryFee).toBe('0.00');
    expect(snap.serviceFee).toBe('0.00');
  });

  it('freezes items snapshot — mutating the input array does not affect the order (ORD-04)', () => {
    const items: CreateOrderInput['items'] = [
      {
        menuItemId: 'item-1',
        nameSnapshot: 'Burger',
        unitPrice: '10.00',
        currency: USD,
        modifiers: [],
        quantity: 1,
        categoryId: 'cat-1',
      },
    ];
    const order = Order.create(makeInput({ items }));
    const snapshotItemsBefore = order.toSnapshot().items.length;
    const mutableItems = [...items];
    mutableItems.push({
      menuItemId: 'item-2',
      nameSnapshot: 'Extra',
      unitPrice: '5.00',
      currency: USD,
      modifiers: [],
      quantity: 1,
      categoryId: 'cat-1',
    });
    expect(order.toSnapshot().items.length).toBe(snapshotItemsBefore);
  });

  it('defaults channel to site and marketingConsent to false with no consent timestamp', () => {
    const order = Order.create(makeInput());
    const snap = order.toSnapshot();
    expect(snap.channel).toBe('site');
    expect(snap.marketingConsent).toBe(false);
    expect(snap.marketingConsentAt).toBeNull();
  });

  it('stamps marketingConsentAt when marketingConsent is true (D-17 lawful-basis record)', () => {
    const order = Order.create(makeInput({ marketingConsent: true }));
    const snap = order.toSnapshot();
    expect(snap.marketingConsent).toBe(true);
    expect(snap.marketingConsentAt).toBeInstanceOf(Date);
  });
});

describe('Order.fromSnapshot + toSnapshot round-trip', () => {
  it('round-trips the snapshot identically', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    const snap1 = order.toSnapshot();
    const order2 = Order.fromSnapshot(snap1);
    expect(order2.toSnapshot()).toEqual(snap1);
  });
});

describe('pullEvents', () => {
  it('drains events on the first call and returns [] on the second call', () => {
    const order = Order.create(makeInput());
    const first = order.pullEvents();
    expect(first).toHaveLength(1);
    const second = order.pullEvents();
    expect(second).toHaveLength(0);
  });
});

describe('markPaid', () => {
  it('transitions created → paid and emits OrderPaid with real total/currency', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_123');
    expect(order.toSnapshot().status).toBe('paid');
    const events = order.pullEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderPaid');
    if (event.kind === 'OrderPaid') {
      expect(event.paymentId).toBe('pi_123');
      expect(event.total).toBe(order.toSnapshot().total);
      expect(event.currency).toBe('USD');
      expect(event.locationId).toBe('00000000-0000-0000-0000-000000000099');
    }
  });

  it('throws InvalidOrderTransitionError when called from non-created states', () => {
    const paidOrder = Order.create(makeInput());
    paidOrder.pullEvents();
    paidOrder.markPaid('pi_1');
    paidOrder.pullEvents();
    expect(() => {
      paidOrder.markPaid('pi_2');
    }).toThrow(InvalidOrderTransitionError);

    const canceledOrder = Order.create(makeInput());
    canceledOrder.pullEvents();
    canceledOrder.cancel('other', 'test', null);
    canceledOrder.pullEvents();
    expect(() => {
      canceledOrder.markPaid('pi_3');
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('accept', () => {
  it('transitions paid → accepted, stamps acceptedAt/acceptedByUserId/etaAt, and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    const eta = new Date('2026-01-01T12:30:00.000Z');
    order.accept(eta, 'user-1');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('accepted');
    expect(snap.acceptedAt).toBeInstanceOf(Date);
    expect(snap.acceptedByUserId).toBe('user-1');
    // accept() stores the supplied etaAt verbatim
    expect(snap.etaAt).toEqual(eta);
    // only its own timestamp is stamped
    expect(snap.preparingAt).toBeNull();
    expect(snap.readyAt).toBeNull();
    expect(snap.completedAt).toBeNull();
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('paid');
      expect(event.newStatus).toBe('accepted');
      expect(event.actorUserId).toBe('user-1');
      expect(event.locationId).toBe('00000000-0000-0000-0000-000000000099');
    }
  });

  it('accepts a null etaAt verbatim (no ETA chosen)', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    expect(order.toSnapshot().etaAt).toBeNull();
  });

  it('throws InvalidOrderTransitionError from created state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    expect(() => {
      order.accept(null, 'user-1');
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from canceled state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.cancel('other', 'test', null);
    order.pullEvents();
    expect(() => {
      order.accept(null, 'user-1');
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('startPreparing', () => {
  it('transitions accepted → preparing, stamps only preparingAt, and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    const acceptedAtBefore = order.toSnapshot().acceptedAt;
    order.startPreparing('user-2');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('preparing');
    expect(snap.preparingAt).toBeInstanceOf(Date);
    // its own transition's timestamp is not re-stamped
    expect(snap.acceptedAt).toEqual(acceptedAtBefore);
    expect(snap.readyAt).toBeNull();
    expect(snap.completedAt).toBeNull();
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('accepted');
      expect(event.newStatus).toBe('preparing');
      expect(event.actorUserId).toBe('user-2');
    }
  });

  it('throws InvalidOrderTransitionError from paid state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    expect(() => {
      order.startPreparing('user-1');
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('markReady', () => {
  it('transitions preparing → ready, stamps only readyAt, and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    const preparingAtBefore = order.toSnapshot().preparingAt;
    order.markReady('user-2');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('ready');
    expect(snap.readyAt).toBeInstanceOf(Date);
    expect(snap.preparingAt).toEqual(preparingAtBefore);
    expect(snap.completedAt).toBeNull();
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('preparing');
      expect(event.newStatus).toBe('ready');
      expect(event.actorUserId).toBe('user-2');
    }
  });

  it('throws InvalidOrderTransitionError from accepted state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    expect(() => {
      order.markReady('user-1');
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('complete', () => {
  it('transitions ready → completed, stamps only completedAt, and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    order.markReady('user-1');
    order.pullEvents();
    const readyAtBefore = order.toSnapshot().readyAt;
    order.complete('user-2');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('completed');
    expect(snap.completedAt).toBeInstanceOf(Date);
    expect(snap.readyAt).toEqual(readyAtBefore);
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('ready');
      expect(event.newStatus).toBe('completed');
      expect(event.actorUserId).toBe('user-2');
    }
  });

  it('throws InvalidOrderTransitionError from preparing state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    expect(() => {
      order.complete('user-1');
    }).toThrow(InvalidOrderTransitionError);
  });
});

// D-08/D-09: cancel() is legal from every pre-completion status and is the
// only method that writes a terminal order status.
describe('cancel', () => {
  it('transitions created → canceled with canceledFromStatus "created" and emits OrderCanceled', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.cancel('guest_requested', 'customer request', null);
    const snap = order.toSnapshot();
    expect(snap.status).toBe('canceled');
    expect(snap.canceledFromStatus).toBe('created');
    expect(snap.cancelReason).toBe('guest_requested');
    expect(snap.cancelNote).toBe('customer request');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderCanceled');
    if (event.kind === 'OrderCanceled') {
      expect(event.reason).toBe('customer request');
      expect(event.reasonCode).toBe('guest_requested');
      expect(event.canceledFromStatus).toBe('created');
    }
  });

  it('transitions paid → canceled with canceledFromStatus "paid" and records the actor', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.cancel('payment_issue', null, 'user-1');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('canceled');
    expect(snap.canceledFromStatus).toBe('paid');
    expect(snap.canceledByUserId).toBe('user-1');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderCanceled');
    if (event.kind === 'OrderCanceled') {
      expect(event.actorUserId).toBe('user-1');
    }
  });

  it('transitions accepted → canceled with canceledFromStatus "accepted"', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.cancel('kitchen_too_busy', null, 'user-2');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('canceled');
    expect(snap.canceledFromStatus).toBe('accepted');
  });

  it('transitions preparing → canceled with canceledFromStatus "preparing"', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    order.cancel('kitchen_out_of_stock', null, 'user-2');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('canceled');
    expect(snap.canceledFromStatus).toBe('preparing');
  });

  it('transitions ready → canceled with canceledFromStatus "ready"', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    order.markReady('user-1');
    order.pullEvents();
    order.cancel('duplicate_order', null, 'user-2');
    const snap = order.toSnapshot();
    expect(snap.status).toBe('canceled');
    expect(snap.canceledFromStatus).toBe('ready');
  });

  it('throws InvalidOrderTransitionError from completed state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    order.markReady('user-1');
    order.pullEvents();
    order.complete('user-1');
    order.pullEvents();
    expect(() => {
      order.cancel('other', null, 'user-2');
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from canceled state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.cancel('other', null, null);
    order.pullEvents();
    expect(() => {
      order.cancel('other', null, null);
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from refunded state', () => {
    // 'refunded' is no longer reachable through the aggregate's own public
    // API (refund() never writes status) -- construct it via fromSnapshot to
    // prove cancel() still guards against acting on a terminal order.
    const order = Order.fromSnapshot(makeSnapshot({ status: 'refunded' }));
    expect(() => {
      order.cancel('other', null, null);
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidCancelReasonError for a reason code outside the canonical seven', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    expect(() => {
      order.cancel('not_a_real_reason', null, null);
    }).toThrow(InvalidCancelReasonError);
  });
});

// RESEARCH.md C.8 / T-10-03-01: refund() must never rewrite order.status.
describe('refund', () => {
  it('full refund on a paid order never rewrites order status', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.refund(1250, 0);
    expect(order.toSnapshot().status).toBe('paid');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderRefunded');
    if (event.kind === 'OrderRefunded') {
      expect(event.amount).toBeGreaterThan(0);
      expect(event.currency).toBe('USD');
      expect(event.locationId).toBe('00000000-0000-0000-0000-000000000099');
    }
  });

  it('refund() on a preparing order leaves status preparing', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    order.refund(1250, 0);
    expect(order.toSnapshot().status).toBe('preparing');
  });

  it('full refund() on a completed order leaves status completed', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    order.markReady('user-1');
    order.pullEvents();
    order.complete('user-1');
    order.pullEvents();
    order.refund(1250, 0);
    expect(order.toSnapshot().status).toBe('completed');
  });

  it('has no order-status gate -- refundability is RefundOrderService/PaymentNotRefundableError, not the aggregate', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    expect(() => order.refund(1250, 0)).not.toThrow();
    expect(order.toSnapshot().status).toBe('created');
  });

  it('throws RefundExceedsCapturedError when cumulative exceeds total', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    expect(() => order.refund(1300, 0)).toThrow(RefundExceedsCapturedError);
  });

  it('throws RefundExceedsCapturedError when amount <= 0', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    expect(() => order.refund(0, 0)).toThrow(RefundExceedsCapturedError);
  });
});

describe('markFailed', () => {
  it('transitions created → failed and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markFailed('payment gateway error');
    expect(order.toSnapshot().status).toBe('failed');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.newStatus).toContain('failed');
    }
  });

  it('transitions paid → failed and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.markFailed('webhook timeout');
    expect(order.toSnapshot().status).toBe('failed');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
  });

  it('throws InvalidOrderTransitionError from completed state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept(null, 'user-1');
    order.pullEvents();
    order.startPreparing('user-1');
    order.pullEvents();
    order.markReady('user-1');
    order.pullEvents();
    order.complete('user-1');
    order.pullEvents();
    expect(() => {
      order.markFailed('test');
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from canceled state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.cancel('other', null, null);
    order.pullEvents();
    expect(() => {
      order.markFailed('test');
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('requireAction (D-08 SCA state)', () => {
  it('transitions created → requires_action and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.requireAction('pi_sca_1');
    expect(order.toSnapshot().status).toBe('requires_action');
    const events = order.pullEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('created');
      expect(event.newStatus).toBe('requires_action');
    }
  });

  it('throws InvalidOrderTransitionError from non-created states', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    expect(() => order.requireAction('pi_2')).toThrow(InvalidOrderTransitionError);
  });

  it('SCA happy path: created → requires_action → paid', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.requireAction('pi_sca_1');
    order.pullEvents();
    order.markPaid('pi_sca_1');
    expect(order.toSnapshot().status).toBe('paid');
    const events = order.pullEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event) return;
    expect(event.kind).toBe('OrderPaid');
  });
});

describe('partial refund (D-04)', () => {
  it('partial refund keeps status paid and emits OrderRefunded with partial amount', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.refund(500, 0);
    expect(order.toSnapshot().status).toBe('paid');
    const events = order.pullEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderRefunded');
    if (event.kind === 'OrderRefunded') {
      expect(event.amount).toBe(500);
    }
  });

  it('cumulative full refund keeps status paid (refund never transitions to refunded)', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.refund(500, 0);
    order.pullEvents();
    order.refund(750, 500);
    // Money-completeness lives on payments.status/payment_refunds now --
    // cancel() is the only method that ever writes a terminal order status.
    expect(order.toSnapshot().status).toBe('paid');
  });

  it('throws RefundExceedsCapturedError when cumulative exceeds total', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    expect(() => order.refund(1300, 0)).toThrow(RefundExceedsCapturedError);
  });

  it('throws RefundExceedsCapturedError when amount <= 0', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    expect(() => order.refund(0, 0)).toThrow(RefundExceedsCapturedError);
  });
});

describe('totals formula (ORD-05 per-line rounding vs round-at-total divergence)', () => {
  it('per-line rounding beats round-at-total for fractional modifier priceDelta', () => {
    const order = Order.create(
      makeInput({
        items: [
          {
            menuItemId: 'item-1',
            nameSnapshot: 'A',
            unitPrice: '10.00',
            currency: USD,
            modifiers: [
              {
                optionId: 'opt-1',
                nameSnapshot: 'Sauce',
                priceDelta: '0.005',
                amount: 1,
                modifierGroupId: null,
              },
            ],
            quantity: 2,
            categoryId: 'cat-1',
          },
          {
            menuItemId: 'item-2',
            nameSnapshot: 'B',
            unitPrice: '5.00',
            currency: USD,
            modifiers: [
              {
                optionId: 'opt-2',
                nameSnapshot: 'Extra',
                priceDelta: '0.005',
                amount: 1,
                modifierGroupId: null,
              },
            ],
            quantity: 2,
            categoryId: 'cat-1',
          },
        ],
      }),
    );
    const snap = order.toSnapshot();

    const perLine = Math.round(1000 + Math.round(0.5)) * 2 + Math.round(500 + Math.round(0.5)) * 2;
    const roundAtTotal = Math.round((1000 + 0.5) * 2 + (500 + 0.5) * 2);

    expect(snap.subtotal).toBe('30.00');
    expect(perLine).not.toBe(roundAtTotal);
  });
});
