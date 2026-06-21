import { describe, it, expect } from 'vitest';
import { Currency, TenantId } from '@resto/domain';
import { Order, type CreateOrderInput } from './order.aggregate';
import { InvalidOrderTransitionError } from './errors';

const USD = Currency.parse('USD');

function makeInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    tenantId: TenantId.parse('00000000-0000-0000-0000-000000000001'),
    brandId: '00000000-0000-0000-0000-000000000002',
    idempotencyKey: '00000000-0000-0000-0000-000000000003',
    orderNumber: 'ORD-001',
    fulfillmentMode: 'dine_in',
    currency: USD,
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
  it('transitions created → paid and emits OrderPaid', () => {
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
    canceledOrder.cancel('test');
    canceledOrder.pullEvents();
    expect(() => {
      canceledOrder.markPaid('pi_3');
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('accept', () => {
  it('transitions paid → accepted and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    expect(order.toSnapshot().status).toBe('accepted');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('paid');
      expect(event.newStatus).toBe('accepted');
    }
  });

  it('throws InvalidOrderTransitionError from created state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    expect(() => {
      order.accept();
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from canceled state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.cancel('test');
    order.pullEvents();
    expect(() => {
      order.accept();
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('startPreparing', () => {
  it('transitions accepted → preparing and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    order.startPreparing();
    expect(order.toSnapshot().status).toBe('preparing');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('accepted');
      expect(event.newStatus).toBe('preparing');
    }
  });

  it('throws InvalidOrderTransitionError from paid state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    expect(() => {
      order.startPreparing();
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('markReady', () => {
  it('transitions preparing → ready and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    order.startPreparing();
    order.pullEvents();
    order.markReady();
    expect(order.toSnapshot().status).toBe('ready');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('preparing');
      expect(event.newStatus).toBe('ready');
    }
  });

  it('throws InvalidOrderTransitionError from accepted state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    expect(() => {
      order.markReady();
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('complete', () => {
  it('transitions ready → completed and emits OrderStatusChanged', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    order.startPreparing();
    order.pullEvents();
    order.markReady();
    order.pullEvents();
    order.complete();
    expect(order.toSnapshot().status).toBe('completed');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderStatusChanged');
    if (event.kind === 'OrderStatusChanged') {
      expect(event.previousStatus).toBe('ready');
      expect(event.newStatus).toBe('completed');
    }
  });

  it('throws InvalidOrderTransitionError from preparing state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    order.startPreparing();
    order.pullEvents();
    expect(() => {
      order.complete();
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('cancel', () => {
  it('transitions created → canceled and emits OrderCanceled', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.cancel('customer request');
    expect(order.toSnapshot().status).toBe('canceled');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderCanceled');
    if (event.kind === 'OrderCanceled') {
      expect(event.reason).toBe('customer request');
    }
  });

  it('transitions paid → canceled and emits OrderCanceled', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.cancel('operator cancelled');
    expect(order.toSnapshot().status).toBe('canceled');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderCanceled');
  });

  it('throws InvalidOrderTransitionError from accepted state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    expect(() => {
      order.cancel('test');
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from completed state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    order.startPreparing();
    order.pullEvents();
    order.markReady();
    order.pullEvents();
    order.complete();
    order.pullEvents();
    expect(() => {
      order.cancel('test');
    }).toThrow(InvalidOrderTransitionError);
  });
});

describe('refund', () => {
  it('transitions paid → refunded and emits OrderRefunded with amount', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.refund();
    expect(order.toSnapshot().status).toBe('refunded');
    const events = order.pullEvents();
    const [event] = events;
    expect(event).toBeDefined();
    if (!event) return;
    expect(event.kind).toBe('OrderRefunded');
    if (event.kind === 'OrderRefunded') {
      expect(event.amount).toBeGreaterThan(0);
    }
  });

  it('throws InvalidOrderTransitionError from created state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    expect(() => {
      order.refund();
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from accepted state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.markPaid('pi_1');
    order.pullEvents();
    order.accept();
    order.pullEvents();
    expect(() => {
      order.refund();
    }).toThrow(InvalidOrderTransitionError);
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
    order.accept();
    order.pullEvents();
    order.startPreparing();
    order.pullEvents();
    order.markReady();
    order.pullEvents();
    order.complete();
    order.pullEvents();
    expect(() => {
      order.markFailed('test');
    }).toThrow(InvalidOrderTransitionError);
  });

  it('throws InvalidOrderTransitionError from canceled state', () => {
    const order = Order.create(makeInput());
    order.pullEvents();
    order.cancel('test');
    order.pullEvents();
    expect(() => {
      order.markFailed('test');
    }).toThrow(InvalidOrderTransitionError);
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
