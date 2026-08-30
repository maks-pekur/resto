import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext, type TenantAwareDb } from '@resto/db';
import type { TenantId } from '@resto/domain';
import { CreateOrderService } from '../../src/contexts/ordering/application/create-order.service';
import type { DefaultLocationResolverService } from '../../src/contexts/catalog/application/default-location-resolver.service';
import type { CreateOrderInput } from '../../src/contexts/ordering/application/dto';
import type {
  MenuPricingPort,
  OrderingMenuSnapshot,
  OrderRepository,
  OrderSequencePort,
  OrderTableLookupPort,
  ResolvedOrderTable,
} from '../../src/contexts/ordering/domain/ports';
import {
  OrderItemNotOrderableError,
  OrderItemUnavailableError,
  OrderModifierNotAvailableError,
  OrderModifierSelectionInvalidError,
  OrderTableNotResolvedError,
} from '../../src/contexts/ordering/domain/errors';
import type { Order } from '../../src/contexts/ordering/domain/order.aggregate';

const tenantId = randomUUID();
const locationId = randomUUID();
const tableLocationId = randomUUID();
const resolvableTableId = randomUUID();
const tableZoneName = 'Terrace';
const tableNumber = 'A1';

const pizzaId = randomUUID();
const categoryId = randomUUID();
const largeSizeId = randomUUID();
const cheeseGroupId = randomUUID();
const cheeseOptionId = randomUUID();
const cheeseOptionId2 = randomUUID();
const sauceGroupId = randomUUID();
const freeSauceOptionId = randomUUID();
const stoppedItemId = randomUUID();
const requiredItemId = randomUUID();
const reqGroupId = randomUUID();
const reqOptionId = randomUUID();

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
    {
      itemId: requiredItemId,
      categoryId,
      basePrice: '8.00',
      sizes: [],
      modifierGroupIds: [reqGroupId],
    },
  ],
  modifierGroups: [
    { groupId: cheeseGroupId, minSelectable: 0, maxSelectable: 1, isRequired: false },
    { groupId: sauceGroupId, minSelectable: 0, maxSelectable: 1, isRequired: false },
    { groupId: reqGroupId, minSelectable: 1, maxSelectable: 1, isRequired: true },
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
      optionId: cheeseOptionId2,
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
    {
      optionId: reqOptionId,
      groupId: reqGroupId,
      priceDelta: '2.00',
      freeAmount: 0,
      minAmount: 2,
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
  update(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<Order | null> {
    return Promise.resolve(null);
  }
  findByIdInTx(): Promise<Order | null> {
    return Promise.resolve(null);
  }
  findByIdempotencyKey(): Promise<Order | null> {
    return Promise.resolve(this.saved.at(-1) ?? null);
  }
}

const defaultLocation = {
  resolveForTenant: () => Promise.resolve(locationId),
} as unknown as DefaultLocationResolverService;

const orderSequence: OrderSequencePort = { nextShortNumber: () => Promise.resolve(1) };

const fakeDb = {
  withTenant: (op: (tx: unknown, scoped: unknown) => Promise<unknown>) =>
    op(undefined, {
      selectFrom: () => ({ limit: () => Promise.resolve([{ timezone: null }]) }),
    }),
} as unknown as TenantAwareDb;

interface PricingCall {
  readonly tenantId: string;
  readonly locationId: string;
}

// This spec mocks MenuPricingPort/OrderTableLookupPort, so it can only prove the
// SHAPE of the calls (which tenantId/locationId is passed) — it CANNOT catch a real
// location-mismatch defect (pricing/stop-list answering for the wrong location).
// The real proof is the two-location e2e in plan 10.3-12.
const createPricing = (): { port: MenuPricingPort; calls: PricingCall[] } => {
  const calls: PricingCall[] = [];
  return {
    calls,
    port: {
      loadSnapshot: (tid: TenantId, locId: string) => {
        calls.push({ tenantId: tid, locationId: locId });
        return Promise.resolve(snapshot);
      },
    },
  };
};

const createTableLookup = (): { port: OrderTableLookupPort; calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    port: {
      findActiveTable: (tableId: string): Promise<ResolvedOrderTable | null> => {
        calls.push(tableId);
        if (tableId === resolvableTableId) {
          return Promise.resolve({
            tableId: resolvableTableId,
            zoneName: tableZoneName,
            number: tableNumber,
            locationId: tableLocationId,
          });
        }
        return Promise.resolve(null);
      },
    },
  };
};

const makeService = (): {
  service: CreateOrderService;
  repo: FakeOrderRepository;
  pricingCalls: PricingCall[];
  tableLookupCalls: string[];
} => {
  const repo = new FakeOrderRepository();
  const pricing = createPricing();
  const tableLookup = createTableLookup();
  return {
    service: new CreateOrderService(
      repo,
      pricing.port,
      orderSequence,
      tableLookup.port,
      defaultLocation,
      fakeDb,
    ),
    repo,
    pricingCalls: pricing.calls,
    tableLookupCalls: tableLookup.calls,
  };
};

const run = <T>(op: () => Promise<T>): Promise<T> => runInTenantContext({ tenantId }, op);

const baseInput = (overrides: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  items: [{ itemId: pizzaId, sizeId: null, name: 'Pizza', modifiers: [], quantity: 1 }],
  orderType: 'pickup',
  customerName: 'Alice',
  customerPhone: '+15555550123',
  idempotencyKey: randomUUID(),
  channel: 'site',
  marketingConsent: false,
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

  it('rejects an unknown / cross-tenant item with 422 and persists nothing', async () => {
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

  it('rejects when a required modifier group has no selection (HIGH-5)', async () => {
    const { service, repo } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            items: [
              { itemId: requiredItemId, sizeId: null, name: 'Combo', modifiers: [], quantity: 1 },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderModifierSelectionInvalidError);
    expect(repo.saved).toHaveLength(0);
  });

  it('rejects when a group exceeds its maxSelectable (HIGH-5)', async () => {
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
                modifiers: [
                  { optionId: cheeseOptionId, name: 'Cheese', amount: 1 },
                  { optionId: cheeseOptionId2, name: 'Cheese 2', amount: 1 },
                ],
                quantity: 1,
              },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderModifierSelectionInvalidError);
  });

  it('rejects an option whose amount is below its minAmount (HIGH-5)', async () => {
    const { service } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            items: [
              {
                itemId: requiredItemId,
                sizeId: null,
                name: 'Combo',
                modifiers: [{ optionId: reqOptionId, name: 'Req', amount: 1 }],
                quantity: 1,
              },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderModifierNotAvailableError);
  });

  it('accepts a valid required selection that satisfies group + amount rules (HIGH-5)', async () => {
    const { service, repo } = makeService();
    await run(() =>
      service.execute(
        baseInput({
          items: [
            {
              itemId: requiredItemId,
              sizeId: null,
              name: 'Combo',
              modifiers: [{ optionId: reqOptionId, name: 'Req', amount: 2 }],
              quantity: 1,
            },
          ],
        }),
      ),
    );
    // base 8.00 + req 2.00 * 2 = 12.00
    expect(repo.saved[0]?.toSnapshot().total).toBe('12.00');
  });
});

describe('CreateOrderService — table resolution decides the order location (TBL-07/08/09)', () => {
  it("a dine_in order with a resolvable tableId carries the table snapshot and prices against the table's own location, not the default", async () => {
    const { service, repo, pricingCalls, tableLookupCalls } = makeService();
    await run(() =>
      service.execute(
        baseInput({
          orderType: 'dine_in',
          tableId: resolvableTableId,
          customerName: undefined,
          customerPhone: undefined,
        }),
      ),
    );
    const snap = repo.saved[0]?.toSnapshot();
    expect(snap?.tableId).toBe(resolvableTableId);
    expect(snap?.tableZoneName).toBe(tableZoneName);
    expect(snap?.tableNumber).toBe(tableNumber);
    expect(snap?.locationId).toBe(tableLocationId);
    expect(tableLookupCalls).toEqual([resolvableTableId]);
    expect(pricingCalls).toEqual([{ tenantId, locationId: tableLocationId }]);
  });

  it('rejects a dine_in order whose tableId does not resolve with OrderTableNotResolvedError and persists nothing', async () => {
    const { service, repo } = makeService();
    await expect(
      run(() =>
        service.execute(
          baseInput({
            orderType: 'dine_in',
            tableId: randomUUID(),
            customerName: undefined,
            customerPhone: undefined,
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(OrderTableNotResolvedError);
    expect(repo.saved).toHaveLength(0);
  });

  it('a pickup order with no tableId stores null table columns and prices against the default location', async () => {
    const { service, repo, pricingCalls, tableLookupCalls } = makeService();
    await run(() => service.execute(baseInput({ orderType: 'pickup' })));
    const snap = repo.saved[0]?.toSnapshot();
    expect(snap?.tableId).toBeNull();
    expect(snap?.tableZoneName).toBeNull();
    expect(snap?.tableNumber).toBeNull();
    expect(snap?.locationId).toBe(locationId);
    expect(tableLookupCalls).toHaveLength(0);
    expect(pricingCalls).toEqual([{ tenantId, locationId }]);
  });

  it('an idempotent retry of a dine_in order returns the existing order without calling the table lookup again — proof the retry survives the table being archived mid-flight', async () => {
    const { service, repo, tableLookupCalls } = makeService();
    const input = baseInput({
      orderType: 'dine_in',
      tableId: resolvableTableId,
      customerName: undefined,
      customerPhone: undefined,
    });

    await run(() => service.execute(input));
    expect(tableLookupCalls).toHaveLength(1);
    tableLookupCalls.length = 0;

    const savedCountBefore = repo.saved.length;
    const retryResponse = await run(() => service.execute(input));

    expect(repo.saved).toHaveLength(savedCountBefore);
    expect(tableLookupCalls).toHaveLength(0);
    expect(retryResponse.orderId).toBe(repo.saved[0]?.toSnapshot().id);
  });
});
