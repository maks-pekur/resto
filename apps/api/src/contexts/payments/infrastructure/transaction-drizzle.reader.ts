import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { TenantId } from '@resto/domain';
import type { TransactionQuery, TransactionReader, TransactionRow } from '../domain/ports';

const failedRefundExists = sql<boolean>`exists (
  select 1 from ${schema.paymentRefunds} r
  where r.payment_id = ${schema.payments.id}
    and r.tenant_id = ${schema.payments.tenantId}
    and r.status = 'failed'
)`;

@Injectable()
export class TransactionDrizzleReader implements TransactionReader {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async list(query: TransactionQuery): Promise<{ rows: readonly TransactionRow[]; total: number }> {
    const filters: SQL[] = [eq(schema.payments.tenantId, query.tenantId)];
    if (query.createdFrom !== undefined) {
      filters.push(gte(schema.payments.createdAt, query.createdFrom));
    }
    if (query.createdTo !== undefined) {
      filters.push(lt(schema.payments.createdAt, query.createdTo));
    }
    if (query.status === 'paid') {
      filters.push(sql`${schema.payments.refundedAmount} = 0 and not ${failedRefundExists}`);
    }
    if (query.status === 'refunded') {
      filters.push(sql`${schema.payments.refundedAmount} > 0`);
    }
    if (query.status === 'refund_failed') {
      filters.push(sql`${failedRefundExists}`);
    }
    const predicate = and(...filters);

    return this.db.withTenant(async (tx) => {
      const totalRows = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.payments)
        .where(predicate);

      const rows = await tx
        .select({
          paymentId: schema.payments.id,
          orderId: schema.payments.orderId,
          orderShortNumber: schema.orders.shortNumber,
          locationId: schema.orders.locationId,
          status: schema.payments.status,
          amount: schema.payments.amount,
          refundedAmount: schema.payments.refundedAmount,
          currency: schema.payments.currency,
          hasFailedRefund: failedRefundExists,
          createdAt: schema.payments.createdAt,
        })
        .from(schema.payments)
        .innerJoin(
          schema.orders,
          and(
            eq(schema.payments.orderId, schema.orders.id),
            eq(schema.orders.tenantId, query.tenantId),
          ),
        )
        .where(predicate)
        .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id))
        .limit(query.limit)
        .offset(query.offset);

      return { rows, total: totalRows[0]?.total ?? 0 };
    });
  }

  async countFailedRefunds(tenantId: TenantId): Promise<number> {
    return this.db.withTenant(async (tx) => {
      const rows = await tx
        .select({ total: sql<number>`count(distinct ${schema.paymentRefunds.paymentId})::int` })
        .from(schema.paymentRefunds)
        .where(
          and(
            eq(schema.paymentRefunds.tenantId, tenantId),
            eq(schema.paymentRefunds.status, 'failed'),
          ),
        );
      return rows[0]?.total ?? 0;
    });
  }
}
