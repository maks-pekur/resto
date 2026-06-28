import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { TenantId } from '@resto/domain';
import { and, eq, sql } from 'drizzle-orm';
import { fromMinorUnits } from '../../ordering/domain/money-utils';
import type {
  PaymentRefundRow,
  PaymentRepository,
  PaymentRow,
  UpsertPaymentInput,
  UpsertPaymentRefundInput,
} from '../domain/ports';

@Injectable()
export class PaymentDrizzleRepository implements PaymentRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async findByPaymentIntentId(
    tenantId: TenantId,
    paymentIntentId: string,
    tx: RestoTx,
  ): Promise<PaymentRow | null> {
    const rows = await tx
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tenantId, tenantId),
          eq(schema.payments.paymentIntentId, paymentIntentId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? rowToPaymentRow(row) : null;
  }

  async findByOrderId(
    tenantId: TenantId,
    orderId: string,
    tx: RestoTx,
  ): Promise<PaymentRow | null> {
    const rows = await tx
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.orderId, orderId)))
      .limit(1);
    const row = rows[0];
    return row ? rowToPaymentRow(row) : null;
  }

  async upsertByPaymentIntentId(input: UpsertPaymentInput, tx: RestoTx): Promise<PaymentRow> {
    const id = input.id ?? randomUUID();
    const now = new Date();
    await tx
      .insert(schema.payments)
      .values({
        id,
        tenantId: input.tenantId,
        orderId: input.orderId,
        status: input.status,
        amount: input.amount,
        currency: input.currency,
        paymentIntentId: input.paymentIntentId ?? null,
        latestChargeId: input.latestChargeId ?? null,
        refundedAmount: input.refundedAmount ?? '0.00',
        stripeAccountId: input.stripeAccountId ?? null,
        applicationFeeAmount: input.applicationFeeAmount ?? '0.00',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.payments.tenantId, schema.payments.paymentIntentId],
        targetWhere: sql`payment_intent_id is not null`,
        set: {
          status: input.status,
          latestChargeId: input.latestChargeId ?? null,
          refundedAmount: input.refundedAmount ?? '0.00',
          updatedAt: now,
        },
      });

    const rows = await tx
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tenantId, input.tenantId),
          input.paymentIntentId
            ? eq(schema.payments.paymentIntentId, input.paymentIntentId)
            : eq(schema.payments.orderId, input.orderId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error('Failed to upsert payment row');
    return rowToPaymentRow(row);
  }

  async findRefundByStripeId(
    tenantId: TenantId,
    stripeRefundId: string,
    tx: RestoTx,
  ): Promise<PaymentRefundRow | null> {
    const rows = await tx
      .select()
      .from(schema.paymentRefunds)
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, tenantId),
          eq(schema.paymentRefunds.stripeRefundId, stripeRefundId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? rowToRefundRow(row) : null;
  }

  async upsertRefund(input: UpsertPaymentRefundInput, tx: RestoTx): Promise<PaymentRefundRow> {
    const id = randomUUID();
    const now = new Date();
    await tx
      .insert(schema.paymentRefunds)
      .values({
        id,
        tenantId: input.tenantId,
        paymentId: input.paymentId,
        stripeRefundId: input.stripeRefundId,
        amount: input.amount,
        reason: input.reason,
        status: input.status,
        createdAt: now,
      })
      .onConflictDoNothing();

    const rows = await tx
      .select()
      .from(schema.paymentRefunds)
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, input.tenantId),
          eq(schema.paymentRefunds.stripeRefundId, input.stripeRefundId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error('Failed to upsert payment_refund row');
    return rowToRefundRow(row);
  }

  async updateRefundStatus(
    tenantId: TenantId,
    stripeRefundId: string,
    status: string,
    tx: RestoTx,
  ): Promise<void> {
    await tx
      .update(schema.paymentRefunds)
      .set({ status })
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, tenantId),
          eq(schema.paymentRefunds.stripeRefundId, stripeRefundId),
        ),
      );
  }
}

const rowToPaymentRow = (row: typeof schema.payments.$inferSelect): PaymentRow => ({
  id: row.id,
  tenantId: TenantId.parse(row.tenantId),
  orderId: row.orderId,
  status: row.status,
  amount: row.amount,
  currency: row.currency,
  paymentIntentId: row.paymentIntentId,
  latestChargeId: row.latestChargeId,
  refundedAmount: row.refundedAmount,
  stripeAccountId: row.stripeAccountId,
  applicationFeeAmount: row.applicationFeeAmount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const rowToRefundRow = (row: typeof schema.paymentRefunds.$inferSelect): PaymentRefundRow => ({
  id: row.id,
  tenantId: TenantId.parse(row.tenantId),
  paymentId: row.paymentId,
  stripeRefundId: row.stripeRefundId,
  amount: row.amount,
  reason: row.reason,
  status: row.status,
  createdAt: row.createdAt,
});

export { fromMinorUnits };
