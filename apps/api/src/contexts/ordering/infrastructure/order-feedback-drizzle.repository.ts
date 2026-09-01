import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb } from '@resto/db';
import { and, eq } from 'drizzle-orm';
import type { OrderFeedback, OrderFeedbackRepository } from '../domain/ports';

@Injectable()
export class OrderFeedbackDrizzleRepository implements OrderFeedbackRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async findByOrderId(orderId: string): Promise<OrderFeedback | null> {
    const ctx = requireTenantContext();
    return this.db.withTenant(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.orderFeedback)
        .where(
          and(
            eq(schema.orderFeedback.tenantId, ctx.tenantId),
            eq(schema.orderFeedback.orderId, orderId),
          ),
        )
        .limit(1);
      return row === undefined ? null : toFeedback(row);
    });
  }

  async submit(input: {
    readonly tenantId: string;
    readonly orderId: string;
    readonly locationId: string;
    readonly rating: number;
    readonly comment: string | null;
  }): Promise<OrderFeedback> {
    return this.db.withTenant(async (tx) => {
      const [row] = await tx
        .insert(schema.orderFeedback)
        .values({
          tenantId: input.tenantId,
          orderId: input.orderId,
          locationId: input.locationId,
          rating: input.rating,
          comment: input.comment,
        })
        .returning();
      if (row === undefined) throw new Error('Order feedback insert returned no row.');
      return toFeedback(row);
    });
  }
}

interface FeedbackRow {
  orderId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

const toFeedback = (row: FeedbackRow): OrderFeedback => ({
  orderId: row.orderId,
  rating: row.rating,
  comment: row.comment,
  createdAt: row.createdAt,
});
