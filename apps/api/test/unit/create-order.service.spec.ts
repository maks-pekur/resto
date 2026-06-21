import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext } from '@resto/db';
import { CreateOrderService } from '../../src/contexts/ordering/application/create-order.service';
import type { CreateOrderInput } from '../../src/contexts/ordering/application/dto';
import type {
  MenuPricingPort,
  OrderingMenuSnapshot,
  OrderRepository,
} from '../../src/contexts/ordering/domain/ports';
import {
  OrderItemNotOrderableError,
  OrderItemUnavailableError,
  OrderModifierNotAvailableError,
} from '../../src/contexts/ordering/domain/errors';
import type { Order } from '../../src/contexts/ordering/domain/order.aggregate';

const tenantId = randomUUID();
const brandId = randomUUID();

const pizzaId = randomUUID();
const categoryId = randomUUID();
const largeSizeId = randomUUID();
const cheeseGroupId = randomUUID();
const cheeseOptionId = randomUUID();
const sauceGroupId = randomUUID();
const freeSauceOptionId = randomUUID();
const stoppedItemId = randomUUID();

const snapshot: OrderingMenuSnapshot = {
  currency: 'USD',
  items: [
    {
      itemId: pizzaId,
      categoryId,
      basePrice: '12.00',
      sizes: [{ sizeId: largeSizeId, price: '15.00' }],
      modifierGroupIds: [cheeseGroupId, sauceGroupId],
    },
    {
      itemId: stoppedItemId,
      categoryId,
      basePrice: '9.00',
      sizes: [],
      modifierGroupIds: [],
    },
  ],
  modifierOptions: [
    {
      optionId: cheeseOptionId,
      groupId: cheeseGroupId,
      priceDelta: '1.50',
      freeAmount: 0,
      minAmount: null,
      maxAmount: 3,
    },
    {
      optionId: freeSauceOptionId,
      groupId: sauceGroupId,
      priceDelta: '0.50',
      freeAmount: 1,
      minAmount: null,
      maxAmount: null,
    },
  ],
  stoppedItemIds: [stoppedItemId],
};

class FakeOrderRepository implements OrderRepository {
  readonly saved: Order[] = [];
  save(order: Order): Promise<void> {
    this.saved.push(order);
    return Promise.resolve();
  }
  findById(): Promise<Order | null> {
    return Promise.resolve(null);
  }
  findByIdempotencyKey(): Promise<Order | null> {
    return Promise.resolve(this.saved.at(-1) ?? null);
  }
}

const pricing: MenuPricingPort = { loadSnapshot: () => Promise.resolve(snapshot) };

const makeService = (): { service: CreateOrderService; repo: FakeOrderRepository } => {
  const repo = new FakeOrderRepository();
  return { service: new CreateOrderService(repo, pricing), repo };
};

const run = <T>(op: () => Promise<T>): Promise<T> => runInTenantContext({ tenantId, brandId }, op);

const baseInput = (overrides: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  items: [{ itemId: pizzaId, sizeId: null, name: 'Pizza', modifiers: [], quantity: 1 }],
  fulfillmentMode: 'pickup',
  customerName: 'Alice',
  customerPhone: '+15555550123',
  idempotencyKey: randomUUID(),
  ...overrides,
});

describe('CreateOrderService — server-authoritative pricing (BLOCK-1)', () => {
  it('ignores any client-supplied unitPrice/discountSpec and uses catalog prices', async () => {
    const { service, repo } = makeService();

    // Simulate a crafted payload carrying the fields the DTO used to accept.
    const malicious = {
      ...baseInput(),
      items: [
        {
          itemId: pizzaId,
          sizeId: null,
          name: 'Pizza',
          unitPrice: '0.01',
          currency: 'USD',
          modifiers: [{ optionId: cheeseOptionId, name: 'Cheese', priceDelta: '0.00', amount: 1 }],
          quantity: 2,
        },
      ],
      discountSpec: { kind: 'percentage', scope: 'cart', pct: 100 },
    } as unknown as CreateOrderInput;

    await run(() => service.execute(malicious));

    const snap = repo.saved[0]?.toSnapshot();
    // (12.00 + 1.50) * 2 = 27.00 — not the client's 0.01, and no 100% discount.
    expect(snap?.total).toBe('27.00');
    expect(snap?.discount).toBe('0.00');
    expect(snap?.items[0]?.unitPrice).toBe('12.00');
  });

  it('prices the selected size, not the base price', async () => {
    const { service, repo } = makeService();
    await run(() =>
      service.execute(
        baseInput({
          items: [
            { itemId: pizzaId, sizeId: largeSizeId, name: 'Pizza', modifiers: [], quantity: 1 },
          ],
        }),
      ),
    );
    expect(repo.saved[0]?.toSnapshot().total).toBe('15.00');
  });

  it('does not charge a modifier whose amount is within its free allowance', async () => {
    const { service, repo } = makeService();
    await run(() =>
      service.execute(
        baseInput({
          items: [
            {
              itemId: pizzaId,
              sizeId: null,
              name: 'Pizza',
              modifiers: [{ optionId: freeSauceOptionId, name: 'Sauce', amount: 1 }],
              quantity: 1,
            },
          ],
        }),
      ),
    );
    expect(repo.saved[0]?.toSnapshot().total).toBe('12.00');
  });

  it('charges a paid modifier per unit when amount > 1 (HIGH-4)', async () => {
    const { service, repo } = makeService();
    await run(() =>
      service.execute(
        baseInput({
          items: [
            {
              itemId: pizzaId,
              sizeId: null,
              name: 'Pizza',
              modifiers: [{ optionId: cheeseOptionId, name: 'Cheese', amount: 2 }],
              quantity: 1,
            },
          ],
        }),
      ),
    );
    // base 12.00 + cheese 1.50 * 2 = 15.00
    expect(repo.saved[0]?.toSnapshot().total).toBe('15.00');
  });

  it('rejects an unknown / cross-brand item with 422 and persists nothing', async () => {
    const { service, repo } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            items: [{ itemId: randomUUID(), sizeId: null, name: 'X', modifiers: [], quantity: 1 }],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderItemNotOrderableError);
    expect(repo.saved).toHaveLength(0);
  });

  it('rejects a stop-listed item with 422', async () => {
    const { service } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            items: [
              { itemId: stoppedItemId, sizeId: null, name: 'Stopped', modifiers: [], quantity: 1 },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderItemUnavailableError);
  });

  it('rejects an unknown size for a real item', async () => {
    const { service } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            items: [
              { itemId: pizzaId, sizeId: randomUUID(), name: 'Pizza', modifiers: [], quantity: 1 },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderItemNotOrderableError);
  });

  it('rejects a modifier option that does not belong to the item', async () => {
    const { service } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            items: [
              {
                itemId: pizzaId,
                sizeId: null,
                name: 'Pizza',
                modifiers: [{ optionId: randomUUID(), name: 'Ghost', amount: 1 }],
                quantity: 1,
              },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderModifierNotAvailableError);
  });

  it('rejects a modifier amount that exceeds its maxAmount', async () => {
    const { service } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            items: [
              {
                itemId: pizzaId,
                sizeId: null,
                name: 'Pizza',
                modifiers: [{ optionId: cheeseOptionId, name: 'Cheese', amount: 99 }],
                quantity: 1,
              },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderModifierNotAvailableError);
  });
});
