import { desc, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money } from './_types';
import { compositeTenantFk, pkUuid, tenantIdColumn, tenantParentUniqueIndex } from './_columns';
import { tenants } from './tenants';
import { brands, locations } from './brands';

export const orders = pgTable(
  'orders',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id').notNull(),
    locationId: uuid('location_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    orderNumber: text('order_number').notNull(),
    // status acts as soft-delete: 'canceled'/'refunded' replace archived_at (no hard deletes)
    status: text('status').notNull(),
    fulfillmentMode: text('fulfillment_mode').notNull(),
    tableIdentifier: text('table_identifier'),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),
    subtotal: money('subtotal').notNull(),
    deliveryFee: money('delivery_fee').notNull().default('0.00'),
    serviceFee: money('service_fee').notNull().default('0.00'),
    discount: money('discount').notNull().default('0.00'),
    total: money('total').notNull(),
    currency: text('currency').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
    // Phase 10 Plan 01 (D-04): nullable at this stage -- the generator that
    // fills it (CreateOrderService + order_daily_sequences) does not exist
    // until plan 10-04, which tightens this to NOT NULL via migration 0075.
    shortNumber: integer('short_number'),
    channel: text('channel').notNull().default('site'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    preparingAt: timestamp('preparing_at', { withTimezone: true, mode: 'date' }),
    readyAt: timestamp('ready_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    // Better Auth user ids are text, not uuid -- do NOT FK to the BA-owned `user` table.
    acceptedByUserId: text('accepted_by_user_id'),
    canceledByUserId: text('canceled_by_user_id'),
    cancelReason: text('cancel_reason'),
    cancelNote: text('cancel_note'),
    canceledFromStatus: text('canceled_from_status'),
    // D-15: operator-set ready time captured on accept(). Do NOT reuse
    // scheduledFor -- that column means "the guest's requested time".
    etaAt: timestamp('eta_at', { withTimezone: true, mode: 'date' }),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true, mode: 'date' }),
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
    compositeTenantFk({
      name: 'orders_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('orders_idempotency_key_uq').on(table.tenantId, table.idempotencyKey),
    tenantParentUniqueIndex('orders', { id: table.id, tenantId: table.tenantId }),
    check(
      'orders_status_chk',
      sql`${table.status} IN ('created','requires_action','paid','accepted','preparing','ready','completed','canceled','refunded','failed')`,
    ),
    check(
      'orders_fulfillment_mode_chk',
      sql`${table.fulfillmentMode} IN ('dine_in','pickup','delivery')`,
    ),
    check('orders_channel_chk', sql`${table.channel} IN ('site','qr-menu')`),
    check(
      'orders_cancel_reason_chk',
      sql`${table.cancelReason} IS NULL OR ${table.cancelReason} IN ('guest_no_show','kitchen_out_of_stock','kitchen_too_busy','guest_requested','payment_issue','duplicate_order','other')`,
    ),
    check(
      'orders_canceled_from_status_chk',
      sql`${table.canceledFromStatus} IS NULL OR ${table.canceledFromStatus} IN ('created','requires_action','paid','accepted','preparing','ready','completed','canceled','refunded','failed')`,
    ),
    index('orders_feed_idx').on(
      table.tenantId,
      table.locationId,
      table.status,
      desc(table.createdAt),
    ),
  ],
);

export const orderDailySequences = pgTable(
  'order_daily_sequences',
  {
    tenantId: tenantIdColumn(),
    locationId: uuid('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    counter: integer('counter').notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: 'order_daily_sequences_pk',
      columns: [table.tenantId, table.locationId, table.businessDate],
    }),
    foreignKey({
      name: 'order_daily_sequences_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'order_daily_sequences_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
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
    paymentIntentId: text('payment_intent_id'),
    latestChargeId: text('latest_charge_id'),
    refundedAmount: money('refunded_amount').notNull().default('0.00'),
    stripeAccountId: text('stripe_account_id'),
    applicationFeeAmount: money('application_fee_amount').notNull().default('0.00'),
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
    tenantParentUniqueIndex('payments', { id: table.id, tenantId: table.tenantId }),
    check(
      'payments_status_chk',
      sql`${table.status} IN ('pending','requires_action','succeeded','failed','refunded','partially_refunded')`,
    ),
    uniqueIndex('payments_provider_payment_id_uq')
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} IS NOT NULL`),
    uniqueIndex('payments_payment_intent_id_uq')
      .on(table.tenantId, table.paymentIntentId)
      .where(sql`payment_intent_id IS NOT NULL`),
  ],
);

export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    paymentId: uuid('payment_id').notNull(),
    stripeRefundId: text('stripe_refund_id').notNull(),
    amount: money('amount').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'payment_refunds_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'payment_refunds_payment_fk',
      child: { id: table.paymentId, tenantId: table.tenantId },
      parent: { id: payments.id, tenantId: payments.tenantId },
    }).onDelete('restrict'),
    check('payment_refunds_status_chk', sql`${table.status} IN ('pending','succeeded','failed')`),
    uniqueIndex('payment_refunds_stripe_refund_id_uq').on(table.tenantId, table.stripeRefundId),
  ],
);
