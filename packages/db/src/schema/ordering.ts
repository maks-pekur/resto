import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money } from './_types';
import { compositeTenantFk, pkUuid, tenantIdColumn, tenantParentUniqueIndex } from './_columns';
import { tenants } from './tenants';
import { brands } from './brands';

export const orders = pgTable(
  'orders',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    orderNumber: text('order_number').notNull(),
    // status acts as soft-delete: 'canceled'/'refunded' replace archived_at (no hard deletes)
    status: text('status').notNull(),
    fulfillmentMode: text('fulfillment_mode').notNull(),
    tableIdentifier: text('table_identifier'),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    subtotal: money('subtotal').notNull(),
    deliveryFee: money('delivery_fee').notNull().default('0.00'),
    serviceFee: money('service_fee').notNull().default('0.00'),
    discount: money('discount').notNull().default('0.00'),
    total: money('total').notNull(),
    currency: text('currency').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'orders_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'orders_brand_fk',
      child: { id: table.brandId, tenantId: table.tenantId },
      parent: { id: brands.id, tenantId: brands.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('orders_idempotency_key_uq').on(table.tenantId, table.idempotencyKey),
    tenantParentUniqueIndex('orders', { id: table.id, tenantId: table.tenantId }),
    check(
      'orders_status_chk',
      sql`${table.status} IN ('created','paid','accepted','preparing','ready','completed','canceled','refunded','failed')`,
    ),
    check(
      'orders_fulfillment_mode_chk',
      sql`${table.fulfillmentMode} IN ('dine_in','pickup','delivery')`,
    ),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderId: uuid('order_id').notNull(),
    menuItemId: uuid('menu_item_id').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    unitPrice: money('unit_price').notNull(),
    quantity: smallint('quantity').notNull().default(1),
    lineTotal: money('line_total').notNull(),
    currency: text('currency').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    foreignKey({
      name: 'order_items_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'order_items_order_fk',
      child: { id: table.orderId, tenantId: table.tenantId },
      parent: { id: orders.id, tenantId: orders.tenantId },
    }).onDelete('cascade'),
    tenantParentUniqueIndex('order_items', { id: table.id, tenantId: table.tenantId }),
  ],
);

export const orderModifiers = pgTable(
  'order_modifiers',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderItemId: uuid('order_item_id').notNull(),
    optionId: uuid('option_id').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    priceDelta: money('price_delta').notNull(),
    amount: smallint('amount').notNull().default(1),
    modifierGroupId: uuid('modifier_group_id'),
  },
  (table) => [
    foreignKey({
      name: 'order_modifiers_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'order_modifiers_order_item_fk',
      child: { id: table.orderItemId, tenantId: table.tenantId },
      parent: { id: orderItems.id, tenantId: orderItems.tenantId },
    }).onDelete('cascade'),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderId: uuid('order_id').notNull(),
    status: text('status').notNull(),
    amount: money('amount').notNull(),
    currency: text('currency').notNull(),
    provider: text('provider').notNull().default('stripe'),
    providerPaymentId: text('provider_payment_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'payments_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'payments_order_fk',
      child: { id: table.orderId, tenantId: table.tenantId },
      parent: { id: orders.id, tenantId: orders.tenantId },
    }).onDelete('cascade'),
    check(
      'payments_status_chk',
      sql`${table.status} IN ('pending','succeeded','failed','refunded')`,
    ),
    uniqueIndex('payments_provider_payment_id_uq')
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} IS NOT NULL`),
  ],
);
