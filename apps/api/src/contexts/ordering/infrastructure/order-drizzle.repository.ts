import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext, schema, TenantAwareDb, type RestoTx } from '@resto/db';
import {
  appendToOutbox,
  buildEnvelope,
  OrderCanceledV1,
  OrderCreatedV1,
  OrderPaidV1,
  OrderRefundedV1,
  OrderStatusChangedV1,
  type EventEnvelope,
} from '@resto/events';
import { and, eq } from 'drizzle-orm';
import { Currency, OrderId, TenantId } from '@resto/domain';
import {
  Order,
  type OrderItemSnapshot,
  type OrderModifierSnapshot,
  type OrderSnapshot,
  type OrderStatus,
} from '../domain/order.aggregate';
import type { OrderDomainEvent } from '../domain/events';
import type { OrderRepository } from '../domain/ports';

const ALLOWED_STATUSES = new Set<string>([
  'created',
  'requires_action',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'canceled',
  'refunded',
  'failed',
]);

const parseStatus = (raw: string): OrderStatus => {
  if (!ALLOWED_STATUSES.has(raw)) throw new Error(`Unknown order status "${raw}" in DB.`);
  return raw as OrderStatus;
};

@Injectable()
export class OrderDrizzleRepository implements OrderRepository {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async save(order: Order): Promise<void> {
    const snapshot = order.toSnapshot();
    const events = order.pullEvents();

    await this.db.withTenant(async (tx) => {
      const result = await tx
        .insert(schema.orders)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          brandId: snapshot.brandId,
          idempotencyKey: snapshot.idempotencyKey,
          orderNumber: snapshot.orderNumber,
          status: snapshot.status,
          fulfillmentMode: snapshot.fulfillmentMode,
          tableIdentifier: snapshot.tableIdentifier,
          customerName: snapshot.customerName,
          customerPhone: snapshot.customerPhone,
          customerEmail: snapshot.customerEmail,
          subtotal: snapshot.subtotal,
          deliveryFee: snapshot.deliveryFee,
          serviceFee: snapshot.serviceFee,
          discount: snapshot.discount,
          total: snapshot.total,
          currency: snapshot.currency,
          scheduledFor: snapshot.scheduledFor,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        })
        .onConflictDoNothing({ target: [schema.orders.tenantId, schema.orders.idempotencyKey] })
        .returning({ id: schema.orders.id });

      if (result.length === 0) return; // ORD-10: idempotent hit — order already exists

      for (const [sortIndex, item] of snapshot.items.entries()) {
        await tx.insert(schema.orderItems).values({
          id: item.id,
          tenantId: snapshot.tenantId,
          orderId: snapshot.id,
          menuItemId: item.menuItemId,
          nameSnapshot: item.nameSnapshot,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          currency: item.currency,
          sortOrder: sortIndex,
        });

        for (const mod of item.modifiers) {
          await tx.insert(schema.orderModifiers).values({
            id: undefined,
            tenantId: snapshot.tenantId,
            orderItemId: item.id,
            optionId: mod.optionId,
            nameSnapshot: mod.nameSnapshot,
            priceDelta: mod.priceDelta,
            amount: mod.amount,
            modifierGroupId: mod.modifierGroupId ?? null,
          });
        }
      }

      for (const event of events) {
        await appendToOutbox(tx, {
          envelope: domainEventToEnvelope(event),
          aggregateId: snapshot.id,
        });
      }
    });
  }

  async update(order: Order, tx?: RestoTx): Promise<void> {
    if (tx !== undefined) {
      await this.#runUpdate(tx, order);
    } else {
      await this.db.withTenant(async (innerTx) => this.#runUpdate(innerTx, order));
    }
  }

  async #runUpdate(tx: RestoTx, order: Order): Promise<void> {
    const snapshot = order.toSnapshot();
    const events = order.pullEvents();

    const updated = await tx
      .update(schema.orders)
      .set({
        status: snapshot.status,
        updatedAt: snapshot.updatedAt,
        scheduledFor: snapshot.scheduledFor,
      })
      .where(and(eq(schema.orders.id, snapshot.id), eq(schema.orders.tenantId, snapshot.tenantId)))
      .returning({ id: schema.orders.id });

    if (updated.length === 0) {
      throw new Error(
        `Order ${snapshot.id} not found during update — cannot persist status transition.`,
      );
    }

    for (const event of events) {
      await appendToOutbox(tx, {
        envelope: domainEventToEnvelope(event),
        aggregateId: snapshot.id,
      });
    }
  }

  async findById(id: OrderId): Promise<Order | null> {
    const ctx = requireTenantContext();
    return this.db.withTenant(async (tx) => this.loadByIdWithTx(tx, id, ctx.tenantId));
  }

  async findByIdInTx(tx: RestoTx, id: OrderId, tenantId: string): Promise<Order | null> {
    return this.loadByIdWithTx(tx, id, tenantId);
  }

  async findByIdempotencyKey(tenantId: TenantId, key: string): Promise<Order | null> {
    return this.db.withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.orders)
        .where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.idempotencyKey, key)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return this.loadByIdWithTx(tx, OrderId.parse(row.id), tenantId);
    });
  }

  private async loadByIdWithTx(tx: RestoTx, id: OrderId, tenantId: string): Promise<Order | null> {
    const rows = await tx
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenantId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const itemRows = await tx
      .select()
      .from(schema.orderItems)
      .where(and(eq(schema.orderItems.orderId, id), eq(schema.orderItems.tenantId, tenantId)));

    const items: OrderItemSnapshot[] = [];
    for (const itemRow of itemRows) {
      const modRows = await tx
        .select()
        .from(schema.orderModifiers)
        .where(
          and(
            eq(schema.orderModifiers.orderItemId, itemRow.id),
            eq(schema.orderModifiers.tenantId, tenantId),
          ),
        );

      const modifiers: OrderModifierSnapshot[] = modRows.map((m) => ({
        optionId: m.optionId,
        nameSnapshot: m.nameSnapshot,
        priceDelta: m.priceDelta,
        amount: m.amount,
        modifierGroupId: m.modifierGroupId ?? null,
      }));

      items.push({
        id: itemRow.id,
        menuItemId: itemRow.menuItemId,
        nameSnapshot: itemRow.nameSnapshot,
        unitPrice: itemRow.unitPrice,
        currency: Currency.parse(itemRow.currency),
        modifiers,
        quantity: itemRow.quantity,
        lineTotal: itemRow.lineTotal,
        categoryId: '',
      });
    }

    const snap: OrderSnapshot = {
      id: OrderId.parse(row.id),
      tenantId: TenantId.parse(row.tenantId),
      brandId: row.brandId,
      idempotencyKey: row.idempotencyKey,
      orderNumber: row.orderNumber,
      status: parseStatus(row.status),
      fulfillmentMode: row.fulfillmentMode as OrderSnapshot['fulfillmentMode'],
      tableIdentifier: row.tableIdentifier ?? null,
      customerName: row.customerName ?? null,
      customerPhone: row.customerPhone ?? null,
      customerEmail: row.customerEmail ?? null,
      items,
      subtotal: row.subtotal,
      deliveryFee: row.deliveryFee,
      serviceFee: row.serviceFee,
      discount: row.discount,
      total: row.total,
      currency: Currency.parse(row.currency),
      scheduledFor: row.scheduledFor ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return Order.fromSnapshot(snap);
  }
}

const domainEventToEnvelope = (event: OrderDomainEvent): EventEnvelope => {
  switch (event.kind) {
    case 'OrderCreated':
      return buildEnvelope(
        OrderCreatedV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          brandId: event.brandId,
          orderNumber: event.orderNumber,
          fulfillmentMode: event.fulfillmentMode,
          total: event.totalMinorUnits,
          currency: event.currency,
          itemCount: event.itemCount,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'OrderPaid':
      return buildEnvelope(
        OrderPaidV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          paymentId: event.paymentId,
          total: 0,
          currency: 'USD',
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'OrderCanceled':
      return buildEnvelope(
        OrderCanceledV1,
        { orderId: event.orderId, tenantId: event.tenantId, reason: event.reason },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'OrderRefunded':
      return buildEnvelope(
        OrderRefundedV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          amount: event.amount,
          currency: 'USD',
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'OrderStatusChanged':
      return buildEnvelope(
        OrderStatusChangedV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
  }
};
