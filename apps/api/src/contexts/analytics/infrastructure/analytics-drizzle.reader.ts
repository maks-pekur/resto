import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { AnalyticsReader, DashboardTotals, DashboardTotalsQuery } from '../domain/ports';

// Money a guest actually paid: `created` and `requires_action` never charged, `canceled`,
// `failed` and `refunded` are not revenue. Refunds are counted on their own, not netted off.
const REVENUE_STATUSES = ['paid', 'accepted', 'preparing', 'ready', 'completed'] as const;

const EMPTY: DashboardTotals = {
  revenue: '0.00',
  completedOrders: 0,
  newGuests: 0,
  refunds: '0.00',
};

const guestKey = sql<string>`coalesce(nullif(${schema.orders.customerPhone}, ''), nullif(${schema.orders.customerEmail}, ''))`;

@Injectable()
export class AnalyticsDrizzleReader implements AnalyticsReader {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async readDashboardTotals(query: DashboardTotalsQuery): Promise<DashboardTotals> {
    if (query.locationIds.length === 0) return EMPTY;
    const { tenantId, from, to } = query;
    const locationIds = [...query.locationIds];

    return this.db.withTenant(async (tx) => {
      const orderRows = await tx
        .select({
          revenue: sql<string>`coalesce(sum(${schema.orders.total}) filter (where ${schema.orders.status} in ('paid', 'accepted', 'preparing', 'ready', 'completed')), 0)::numeric(14, 2)::text`,
          completedOrders: sql<number>`(count(*) filter (where ${schema.orders.status} = 'completed'))::int`,
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.tenantId, tenantId),
            inArray(schema.orders.locationId, locationIds),
            gte(schema.orders.createdAt, from),
            lt(schema.orders.createdAt, to),
          ),
        );

      const refundRows = await tx
        .select({
          refunds: sql<string>`coalesce(sum(${schema.paymentRefunds.amount}), 0)::numeric(14, 2)::text`,
        })
        .from(schema.paymentRefunds)
        .innerJoin(
          schema.payments,
          and(
            eq(schema.paymentRefunds.paymentId, schema.payments.id),
            eq(schema.payments.tenantId, tenantId),
          ),
        )
        .innerJoin(
          schema.orders,
          and(eq(schema.payments.orderId, schema.orders.id), eq(schema.orders.tenantId, tenantId)),
        )
        .where(
          and(
            eq(schema.paymentRefunds.tenantId, tenantId),
            eq(schema.paymentRefunds.status, 'succeeded'),
            inArray(schema.orders.locationId, locationIds),
            gte(schema.paymentRefunds.createdAt, from),
            lt(schema.paymentRefunds.createdAt, to),
          ),
        );

      // A guest is new when their first paid order lands in the window, so the inner
      // query deliberately carries no date filter — it is every order they ever placed.
      const firstPaidOrders = tx
        .select({
          firstPaidAt: sql<Date>`min(${schema.orders.createdAt})`.as('first_paid_at'),
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.tenantId, tenantId),
            inArray(schema.orders.locationId, locationIds),
            inArray(schema.orders.status, [...REVENUE_STATUSES]),
            sql`${guestKey} is not null`,
          ),
        )
        .groupBy(guestKey)
        .as('first_paid_orders');

      const guestRows = await tx
        .select({ newGuests: sql<number>`count(*)::int` })
        .from(firstPaidOrders)
        // Bound as text with an explicit cast: a bare `sql` parameter carries no column
        // mapper, and the driver cannot bind a Date without one.
        .where(
          sql`${firstPaidOrders.firstPaidAt} >= ${from.toISOString()}::timestamptz and ${firstPaidOrders.firstPaidAt} < ${to.toISOString()}::timestamptz`,
        );

      return {
        revenue: orderRows[0]?.revenue ?? EMPTY.revenue,
        completedOrders: orderRows[0]?.completedOrders ?? 0,
        newGuests: guestRows[0]?.newGuests ?? 0,
        refunds: refundRows[0]?.refunds ?? EMPTY.refunds,
      };
    });
  }
}
