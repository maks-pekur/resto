import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { OrderStatus } from '../domain/order.aggregate';
import {
  type OrderFeedCounts,
  type OrderFeedCountsQuery,
  type OrderFeedQuery,
  type OrderFeedRepository,
  type OrderFeedRow,
} from '../domain/ports';

type OrderRow = typeof schema.orders.$inferSelect;

@Injectable()
export class OrderFeedDrizzleRepository implements OrderFeedRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async list(input: OrderFeedQuery): Promise<{ rows: OrderFeedRow[]; total: number }> {
    if (input.locationIds.length === 0) {
      return { rows: [], total: 0 };
    }
    if (input.locationIds.length === 1) {
      return this.#listSingleLocation(input);
    }
    return this.#listAcrossLocations(input);
  }

  async counts(input: OrderFeedCountsQuery): Promise<OrderFeedCounts> {
    if (input.locationIds.length === 0) return EMPTY_COUNTS;

    return this.db.withTenant(async (tx) => {
      const rows = await tx
        .select({
          unaccepted: sql<number>`(count(*) filter (where ${schema.orders.status} = 'placed' and ${schema.orders.acceptedAt} is null))::int`,
          accepted: sql<number>`(count(*) filter (where ${schema.orders.status} = 'accepted'))::int`,
          preparing: sql<number>`(count(*) filter (where ${schema.orders.status} = 'preparing'))::int`,
          ready: sql<number>`(count(*) filter (where ${schema.orders.status} = 'ready'))::int`,
          completed: sql<number>`(count(*) filter (where ${schema.orders.status} = 'completed'))::int`,
          canceled: sql<number>`(count(*) filter (where ${schema.orders.status} = 'canceled'))::int`,
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.tenantId, input.tenantId),
            inArray(schema.orders.locationId, [...input.locationIds]),
            gte(schema.orders.createdAt, input.createdFrom),
            lt(schema.orders.createdAt, input.createdTo),
            ...(input.orderType !== undefined
              ? [eq(schema.orders.orderType, input.orderType)]
              : []),
          ),
        );
      return rows[0] ?? EMPTY_COUNTS;
    });
  }

  async #listSingleLocation(
    input: OrderFeedQuery,
  ): Promise<{ rows: OrderFeedRow[]; total: number }> {
    const locationId = input.locationIds[0];
    if (locationId === undefined) {
      return { rows: [], total: 0 };
    }

    return this.db.withTenant(async (tx, scoped) => {
      const predicate = and(eq(schema.orders.locationId, locationId), buildFilterPredicate(input));
      const orderRows = await scoped
        .selectFrom(schema.orders, predicate)
        .orderBy(...feedOrder(input));
      return this.#toPagedResult(tx, input, orderRows);
    });
  }

  async #listAcrossLocations(
    input: OrderFeedQuery,
  ): Promise<{ rows: OrderFeedRow[]; total: number }> {
    return this.db.withTenant(async (tx) => {
      const predicate = and(
        eq(schema.orders.tenantId, input.tenantId),
        inArray(schema.orders.locationId, [...input.locationIds]),
        buildFilterPredicate(input),
      );
      const orderRows = await tx
        .select()
        .from(schema.orders)
        .where(predicate)
        .orderBy(...feedOrder(input));
      return this.#toPagedResult(tx, input, orderRows);
    });
  }

  async #toPagedResult(
    tx: RestoTx,
    input: OrderFeedQuery,
    orderRows: readonly OrderRow[],
  ): Promise<{ rows: OrderFeedRow[]; total: number }> {
    const total = orderRows.length;
    const sliced = orderRows.slice(input.offset, input.offset + input.limit);
    if (sliced.length === 0) {
      return { rows: [], total };
    }

    const orderIds = sliced.map((r) => r.id);
    const [locationNameById, itemCountByOrder] = await Promise.all([
      this.#loadLocationNames(tx, input.tenantId, input.locationIds),
      this.#loadItemCounts(tx, input.tenantId, orderIds),
    ]);

    const rows = sliced.map((row) =>
      toFeedRow(row, locationNameById.get(row.locationId) ?? '', itemCountByOrder.get(row.id) ?? 0),
    );
    return { rows, total };
  }

  async #loadLocationNames(
    tx: RestoTx,
    tenantId: string,
    locationIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (locationIds.length === 0) return new Map();
    const rows = await tx
      .select({ id: schema.locations.id, name: schema.locations.name })
      .from(schema.locations)
      .where(
        and(
          eq(schema.locations.tenantId, tenantId),
          inArray(schema.locations.id, [...locationIds]),
        ),
      );
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async #loadItemCounts(
    tx: RestoTx,
    tenantId: string,
    orderIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (orderIds.length === 0) return new Map();
    const rows = await tx
      .select({ orderId: schema.orderItems.orderId, quantity: schema.orderItems.quantity })
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.tenantId, tenantId),
          inArray(schema.orderItems.orderId, [...orderIds]),
        ),
      );
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.orderId, (counts.get(row.orderId) ?? 0) + row.quantity);
    }
    return counts;
  }
}

const EMPTY_COUNTS: OrderFeedCounts = {
  unaccepted: 0,
  accepted: 0,
  preparing: 0,
  ready: 0,
  completed: 0,
  canceled: 0,
};

// The daily number is what an operator reads a floor by, but it restarts every day — so the day
// is the coarse key and the number the fine one, or Monday's №3 would sort inside Tuesday.
function feedOrder(input: OrderFeedQuery): [SQL, SQL] {
  const day = sql`date_trunc('day', ${schema.orders.createdAt} at time zone ${input.timezone ?? 'UTC'})`;
  return input.sort === 'oldest_first'
    ? [asc(day), asc(schema.orders.shortNumber)]
    : [desc(day), desc(schema.orders.shortNumber)];
}

function buildFilterPredicate(input: OrderFeedQuery): SQL | undefined {
  const parts: SQL[] = [
    inArray(schema.orders.status, [...input.statuses]),
    gte(schema.orders.createdAt, input.createdFrom),
    lt(schema.orders.createdAt, input.createdTo),
  ];
  if (input.channel !== undefined) {
    parts.push(eq(schema.orders.channel, input.channel));
  }
  if (input.unacceptedOnly === true) {
    parts.push(isNull(schema.orders.acceptedAt));
  }
  if (input.orderType !== undefined) {
    parts.push(eq(schema.orders.orderType, input.orderType));
  }
  if (input.since !== undefined) {
    const since = input.since;
    const cursorPredicate = or(
      gt(schema.orders.createdAt, since.createdAt),
      and(eq(schema.orders.createdAt, since.createdAt), gt(schema.orders.id, since.id)),
    );
    if (cursorPredicate) parts.push(cursorPredicate);
  }
  return and(...parts);
}

function toFeedRow(row: OrderRow, locationName: string, itemCount: number): OrderFeedRow {
  return {
    id: row.id,
    shortNumber: row.shortNumber,
    status: row.status as OrderStatus,
    locationId: row.locationId,
    locationName,
    orderType: row.orderType as OrderFeedRow['orderType'],
    tableIdentifier: row.tableIdentifier ?? null,
    tableZoneName: row.tableZoneName ?? null,
    tableNumber: row.tableNumber ?? null,
    customerName: row.customerName ?? null,
    customerPhone: row.customerPhone ?? null,
    paymentType: row.paymentType as OrderFeedRow['paymentType'],
    paymentState: row.paymentState as OrderFeedRow['paymentState'],
    total: row.total,
    currency: row.currency,
    itemCount,
    channel: row.channel as OrderFeedRow['channel'],
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt ?? null,
    preparingAt: row.preparingAt ?? null,
    readyAt: row.readyAt ?? null,
    completedAt: row.completedAt ?? null,
    canceledAt: row.canceledAt ?? null,
    etaAt: row.etaAt ?? null,
    cancelReason: row.cancelReason ?? null,
    canceledFromStatus: row.canceledFromStatus ?? null,
    hasFailedRefund: false,
  };
}
