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
import { toMinorUnits } from '../domain/money-utils';

const ALLOWED_STATUSES = new Set<string>([
  'placed',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'canceled',
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
          locationId: snapshot.locationId,
          idempotencyKey: snapshot.idempotencyKey,
          orderNumber: snapshot.orderNumber,
          status: snapshot.status,
          orderType: snapshot.orderType,
          tableIdentifier: snapshot.tableIdentifier,
          tableId: snapshot.tableId,
          tableZoneName: snapshot.tableZoneName,
          tableNumber: snapshot.tableNumber,
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
          shortNumber: snapshot.shortNumber,
          channel: snapshot.channel,
          paymentType: snapshot.paymentType,
          paymentStatus: snapshot.paymentStatus,
          paidAt: snapshot.paidAt,
          acceptedAt: snapshot.acceptedAt,
          preparingAt: snapshot.preparingAt,
          readyAt: snapshot.readyAt,
          completedAt: snapshot.completedAt,
          canceledAt: snapshot.canceledAt,
          acceptedByUserId: snapshot.acceptedByUserId,
          canceledByUserId: snapshot.canceledByUserId,
          cancelReason: snapshot.cancelReason,
          cancelNote: snapshot.cancelNote,
          canceledFromStatus: snapshot.canceledFromStatus,
          etaAt: snapshot.etaAt,
          marketingConsent: snapshot.marketingConsent,
          marketingConsentAt: snapshot.marketingConsentAt,
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
            kind: mod.kind,
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
        // markPaid / markRequiresAction / refund / markFailed all move these two together; the
        // insert wrote them and this update did not, so every payment transition was lost.
        paymentStatus: snapshot.paymentStatus,
        paidAt: snapshot.paidAt,
        updatedAt: snapshot.updatedAt,
        scheduledFor: snapshot.scheduledFor,
        shortNumber: snapshot.shortNumber,
        channel: snapshot.channel,
        acceptedAt: snapshot.acceptedAt,
        preparingAt: snapshot.preparingAt,
        readyAt: snapshot.readyAt,
        completedAt: snapshot.completedAt,
        canceledAt: snapshot.canceledAt,
        acceptedByUserId: snapshot.acceptedByUserId,
        canceledByUserId: snapshot.canceledByUserId,
        cancelReason: snapshot.cancelReason,
        cancelNote: snapshot.cancelNote,
        canceledFromStatus: snapshot.canceledFromStatus,
        etaAt: snapshot.etaAt,
        marketingConsent: snapshot.marketingConsent,
        marketingConsentAt: snapshot.marketingConsentAt,
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
        kind: m.kind as OrderModifierSnapshot['kind'],
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
      locationId: row.locationId,
      idempotencyKey: row.idempotencyKey,
      orderNumber: row.orderNumber,
      status: parseStatus(row.status),
      orderType: row.orderType as OrderSnapshot['orderType'],
      tableIdentifier: row.tableIdentifier ?? null,
      tableId: row.tableId ?? null,
      tableZoneName: row.tableZoneName ?? null,
      tableNumber: row.tableNumber ?? null,
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
      shortNumber: row.shortNumber,
      channel: row.channel as OrderSnapshot['channel'],
      paymentType: row.paymentType as OrderSnapshot['paymentType'],
      paymentStatus: row.paymentStatus as OrderSnapshot['paymentStatus'],
      paidAt: row.paidAt ?? null,
      acceptedAt: row.acceptedAt ?? null,
      preparingAt: row.preparingAt ?? null,
      readyAt: row.readyAt ?? null,
      completedAt: row.completedAt ?? null,
      canceledAt: row.canceledAt ?? null,
      acceptedByUserId: row.acceptedByUserId ?? null,
      canceledByUserId: row.canceledByUserId ?? null,
      cancelReason: row.cancelReason ?? null,
      cancelNote: row.cancelNote ?? null,
      canceledFromStatus: row.canceledFromStatus ? parseStatus(row.canceledFromStatus) : null,
      etaAt: row.etaAt ?? null,
      marketingConsent: row.marketingConsent,
      marketingConsentAt: row.marketingConsentAt ?? null,
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
          locationId: event.locationId,
          orderNumber: event.orderNumber,
          orderType: event.orderType,
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
          locationId: event.locationId,
          paymentId: event.paymentId,
          total: toMinorUnits(event.total),
          currency: event.currency,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'OrderCanceled':
      return buildEnvelope(
        OrderCanceledV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          locationId: event.locationId,
          reason: event.reason,
          reasonCode: event.reasonCode,
          canceledFromStatus: event.canceledFromStatus,
          actorUserId: event.actorUserId,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'OrderRefunded':
      return buildEnvelope(
        OrderRefundedV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          locationId: event.locationId,
          amount: event.amount,
          currency: event.currency,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
    case 'OrderStatusChanged':
      return buildEnvelope(
        OrderStatusChangedV1,
        {
          orderId: event.orderId,
          tenantId: event.tenantId,
          locationId: event.locationId,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.actorUserId,
        },
        { tenantId: event.tenantId, occurredAt: event.occurredAt },
      );
  }
};
