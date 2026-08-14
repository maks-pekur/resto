import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { TenantId } from '@resto/domain';
import { and, eq } from 'drizzle-orm';

export interface NotificationOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly customerEmail: string | null;
  readonly brandId: string;
  readonly total: string;
  readonly currency: string;
  /** D-15 / RESEARCH E.16: the operator-set ready time, never scheduledFor. */
  readonly etaAt: Date | null;
  readonly shortNumber: number | null;
  /** IANA zone from the order's location, when one is set (D-15 clock-time formatting). */
  readonly locationTimezone: string | null;
}

export interface NotificationOrderItemRow {
  readonly nameSnapshot: string;
  readonly quantity: number;
}

export const NOTIFICATION_ORDER_REPOSITORY = Symbol('NOTIFICATION_ORDER_REPOSITORY');

export interface NotificationOrderRepository {
  findOrder(tenantId: TenantId, orderId: string): Promise<NotificationOrderRow | null>;
  findOrderItems(tenantId: TenantId, orderId: string): Promise<readonly NotificationOrderItemRow[]>;
}

@Injectable()
export class NotificationOrderDrizzleRepository implements NotificationOrderRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async findOrder(tenantId: TenantId, orderId: string): Promise<NotificationOrderRow | null> {
    return this.db.withTenantId(tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: schema.orders.id,
          orderNumber: schema.orders.orderNumber,
          customerEmail: schema.orders.customerEmail,
          brandId: schema.orders.brandId,
          total: schema.orders.total,
          currency: schema.orders.currency,
          etaAt: schema.orders.etaAt,
          shortNumber: schema.orders.shortNumber,
          locationTimezone: schema.locations.timezone,
        })
        .from(schema.orders)
        .leftJoin(
          schema.locations,
          and(
            eq(schema.orders.locationId, schema.locations.id),
            eq(schema.orders.tenantId, schema.locations.tenantId),
          ),
        )
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  async findOrderItems(
    tenantId: TenantId,
    orderId: string,
  ): Promise<readonly NotificationOrderItemRow[]> {
    return this.db.withTenantId(tenantId, async (tx) => {
      return tx
        .select({
          nameSnapshot: schema.orderItems.nameSnapshot,
          quantity: schema.orderItems.quantity,
        })
        .from(schema.orderItems)
        .where(
          and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.tenantId, tenantId)),
        );
    });
  }
}
