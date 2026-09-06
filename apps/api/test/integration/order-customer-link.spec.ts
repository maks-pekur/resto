import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext, schema } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { eq } from 'drizzle-orm';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from '../e2e/helpers/with-db-stack';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { Order } from '../../src/contexts/ordering/domain/order.aggregate';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[order-customer-link] Docker not available — skipping.');
}

suite('an order remembers who placed it, through every write path', () => {
  let stack: DbStack;
  let repo: OrderDrizzleRepository;
  const tenantId = randomUUID();
  const locationId = randomUUID();
  const guestUserId = `guest-${randomUUID().slice(0, 8)}`;
  let shortNumberCounter = 1;

  const readOwner = async (orderId: string): Promise<string | null | undefined> => {
    const [row] = await stack.db.withoutTenant('read the order owner', async (tx) =>
      tx
        .select({ customerUserId: schema.orders.customerUserId })
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId)),
    );
    return row?.customerUserId;
  };

  const placeOrder = (owner: string | null): Order => placeOrderIn(tenantId, locationId, owner);

  const placeOrderIn = (tid: string, lid: string, owner: string | null): Order =>
    Order.create({
      tenantId: TenantId.parse(tid),
      locationId: lid,
      idempotencyKey: randomUUID(),
      orderNumber: `ORD-LINK-${randomUUID().slice(0, 8)}`,
      shortNumber: shortNumberCounter++,
      orderType: 'dine_in',
      customerUserId: owner,
      items: [
        {
          menuItemId: randomUUID(),
          nameSnapshot: 'Pizza',
          unitPrice: '10.00',
          currency: 'EUR',
          quantity: 1,
          modifiers: [],
        },
      ],
      currency: 'EUR',
      discountSpec: null,
    } as never);

  beforeAll(async () => {
    stack = await startDbStack();
    repo = new OrderDrizzleRepository(stack.db);
    await stack.db.withoutTenant('seed order-customer-link fixtures', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `link-${tenantId.slice(0, 8)}`,
        displayName: 'Link Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'EUR',
      });
      await tx
        .insert(schema.locations)
        .values({ id: locationId, tenantId, name: 'Main', slug: 'main' });
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it('writes the owner when a signed-in guest places it', async () => {
    const order = placeOrder(guestUserId);
    await runInTenantContext({ tenantId }, () => repo.save(order));
    expect(await readOwner(order.toSnapshot().id)).toBe(guestUserId);
  });

  it('leaves it null when nobody was signed in', async () => {
    const order = placeOrder(null);
    await runInTenantContext({ tenantId }, () => repo.save(order));
    expect(await readOwner(order.toSnapshot().id)).toBeNull();
  });

  it('carries the owner through the update path, so an insert-only column cannot happen here', async () => {
    // Nothing in production changes the owner after placement, so an ordinary
    // load-mutate-update cannot detect the column missing from the UPDATE — the row simply keeps
    // its inserted value and the test passes either way. Measured: with the column removed from
    // #runUpdate, that version of this test still passed. So the snapshot is rebuilt with a
    // different owner and the write is asserted to follow, which does exercise the path.
    const order = placeOrder(guestUserId);
    await runInTenantContext({ tenantId }, () => repo.save(order));
    const orderId = order.toSnapshot().id;

    const reowned = Order.fromSnapshot({
      ...order.toSnapshot(),
      customerUserId: `${guestUserId}-moved`,
    });
    await runInTenantContext({ tenantId }, () => repo.update(reowned));

    expect(await readOwner(orderId)).toBe(`${guestUserId}-moved`);
  });

  it('shows a guest only their own orders, and only in the restaurant they are standing in', async () => {
    const otherTenantId = randomUUID();
    const otherLocationId = randomUUID();
    const otherGuest = `guest-${randomUUID().slice(0, 8)}`;
    // Its own guest: the tests above already placed orders for `guestUserId` in this tenant, and
    // an exact list comparison is the point — loosening it to "contains mine" would pass while
    // leaking someone else's order.
    const isolatedGuest = `guest-${randomUUID().slice(0, 8)}`;

    await stack.db.withoutTenant('seed the second restaurant', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: otherTenantId,
        slug: `other-${otherTenantId.slice(0, 8)}`,
        displayName: 'Other Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'EUR',
      });
      await tx
        .insert(schema.locations)
        .values({ id: otherLocationId, tenantId: otherTenantId, name: 'Other', slug: 'other' });
    });

    const mine = placeOrder(isolatedGuest);
    await runInTenantContext({ tenantId }, () => repo.save(mine));

    const theirs = placeOrder(otherGuest);
    await runInTenantContext({ tenantId }, () => repo.save(theirs));

    // The SAME guest ordering at the other restaurant: one identity, two tenants.
    const elsewhere = placeOrderIn(otherTenantId, otherLocationId, isolatedGuest);
    await runInTenantContext({ tenantId: otherTenantId }, () => repo.save(elsewhere));

    const here = await runInTenantContext({ tenantId }, () =>
      repo.listForCustomer(isolatedGuest, 50),
    );
    expect(here.map((r) => r.id)).toEqual([mine.toSnapshot().id]);

    const there = await runInTenantContext({ tenantId: otherTenantId }, () =>
      repo.listForCustomer(isolatedGuest, 50),
    );
    expect(there.map((r) => r.id)).toEqual([elsewhere.toSnapshot().id]);
  });

  it('reads the owner back onto the aggregate, not only into the row', async () => {
    const order = placeOrder(guestUserId);
    await runInTenantContext({ tenantId }, () => repo.save(order));
    const loaded = await runInTenantContext({ tenantId }, () =>
      repo.findById(OrderId.parse(order.toSnapshot().id)),
    );
    expect(loaded?.toSnapshot().customerUserId).toBe(guestUserId);
  });
});
