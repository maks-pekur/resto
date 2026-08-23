import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { schema, TenantAwareDb, type RestoTx } from '@resto/db';
import { TenantId } from '@resto/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { fromMinorUnits } from '../../ordering/domain/money-utils';
import type {
  PaymentRefundRow,
  PaymentRepository,
  PaymentRow,
  UpdateRefundOutcomeInput,
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

  async findRefundByRequestId(
    tenantId: TenantId,
    refundRequestId: string,
    tx: RestoTx,
  ): Promise<PaymentRefundRow | null> {
    const rows = await tx
      .select()
      .from(schema.paymentRefunds)
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, tenantId),
          eq(schema.paymentRefunds.refundRequestId, refundRequestId),
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
        refundRequestId: input.refundRequestId,
        amount: input.amount,
        reason: input.reason,
        status: input.status,
        failureReason: input.failureReason ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.paymentRefunds.tenantId, schema.paymentRefunds.refundRequestId],
        set: {
          stripeRefundId: input.stripeRefundId,
          amount: input.amount,
          reason: input.reason,
          status: input.status,
          failureReason: input.failureReason ?? null,
          updatedAt: now,
        },
      });

    const rows = await tx
      .select()
      .from(schema.paymentRefunds)
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, input.tenantId),
          eq(schema.paymentRefunds.refundRequestId, input.refundRequestId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error('Failed to upsert payment_refund row');
    return rowToRefundRow(row);
  }

  async updateRefundOutcome(
    tenantId: TenantId,
    refundRequestId: string,
    outcome: UpdateRefundOutcomeInput,
    tx: RestoTx,
  ): Promise<void> {
    await tx
      .update(schema.paymentRefunds)
      .set({
        status: outcome.status,
        ...(outcome.stripeRefundId !== undefined ? { stripeRefundId: outcome.stripeRefundId } : {}),
        ...(outcome.failureReason !== undefined ? { failureReason: outcome.failureReason } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, tenantId),
          eq(schema.paymentRefunds.refundRequestId, refundRequestId),
        ),
      );
  }

  async updateRefundStatusByStripeId(
    tenantId: TenantId,
    stripeRefundId: string,
    status: string,
    tx: RestoTx,
  ): Promise<void> {
    await tx
      .update(schema.paymentRefunds)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.paymentRefunds.tenantId, tenantId),
          eq(schema.paymentRefunds.stripeRefundId, stripeRefundId),
        ),
      );
  }

  async findFailedRefundsForOrders(
    tenantId: TenantId,
    orderIds: readonly string[],
    tx?: RestoTx,
  ): Promise<readonly (PaymentRefundRow & { orderId: string })[]> {
    if (orderIds.length === 0) return [];
    const runner = async (
      t: RestoTx,
    ): Promise<readonly (PaymentRefundRow & { orderId: string })[]> => {
      const rows = await t
        .select({
          refund: schema.paymentRefunds,
          orderId: schema.payments.orderId,
        })
        .from(schema.paymentRefunds)
        .innerJoin(schema.payments, eq(schema.paymentRefunds.paymentId, schema.payments.id))
        .where(
          and(
            eq(schema.paymentRefunds.tenantId, tenantId),
            eq(schema.paymentRefunds.status, 'failed'),
            inArray(schema.payments.orderId, [...orderIds]),
          ),
        );
      return rows.map((r) => ({ ...rowToRefundRow(r.refund), orderId: r.orderId }));
    };
    return tx ? runner(tx) : this.db.withTenant(runner);
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
  refundRequestId: row.refundRequestId,
  amount: row.amount,
  reason: row.reason,
  status: row.status,
  failureReason: row.failureReason,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export { fromMinorUnits };
