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
import { locations } from './locations';
import { restaurantTables } from './table-zones';

export const orders = pgTable(
  'orders',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    locationId: uuid('location_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    orderNumber: text('order_number').notNull(),
    // How far the kitchen has taken the order. Whether the money arrived is `paymentStatus`'s
    // business — one column could not say "confirmed but not yet paid" (migration 0010).
    // 'canceled' acts as the soft delete: no hard deletes.
    status: text('status').notNull(),
    paymentStatus: text('payment_status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    orderType: text('order_type').notNull(),
    // Legacy free-text table label — no writer from phase 10.3 on (CONTEXT D-03).
    // Kept for past orders, seeds, and any future non-QR order path.
    tableIdentifier: text('table_identifier'),
    // Resolved-table snapshot (CONTEXT D-22): render tableZoneName/tableNumber when
    // present, fall back to tableIdentifier, render nothing when all three are null.
    tableId: uuid('table_id'),
    tableZoneName: text('table_zone_name'),
    tableNumber: text('table_number'),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),
    // 10.7 D-13: the Better Auth user who placed it, when they were signed in. Not tenant-scoped,
    // so it takes no composite FK (ADR-0020 I-2 does not apply).
    customerUserId: text('customer_user_id'),
    subtotal: money('subtotal').notNull(),
    deliveryFee: money('delivery_fee').notNull().default('0.00'),
    serviceFee: money('service_fee').notNull().default('0.00'),
    discount: money('discount').notNull().default('0.00'),
    total: money('total').notNull(),
    currency: text('currency').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
    shortNumber: integer('short_number').notNull(),
    channel: text('channel').notNull().default('site'),
    paymentType: text('payment_type').notNull().default('online'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    preparingAt: timestamp('preparing_at', { withTimezone: true, mode: 'date' }),
    readyAt: timestamp('ready_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    acceptedByUserId: text('accepted_by_user_id'),
    canceledByUserId: text('canceled_by_user_id'),
    cancelReason: text('cancel_reason'),
    cancelNote: text('cancel_note'),
    canceledFromStatus: text('canceled_from_status'),
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
      name: 'orders_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
    compositeTenantFk({
      name: 'orders_table_fk',
      child: { id: table.tableId, tenantId: table.tenantId },
      parent: { id: restaurantTables.id, tenantId: restaurantTables.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('orders_idempotency_key_uq').on(table.tenantId, table.idempotencyKey),
    tenantParentUniqueIndex('orders', { id: table.id, tenantId: table.tenantId }),
    check(
      'orders_status_chk',
      sql`${table.status} IN ('placed','accepted','preparing','ready','completed','canceled')`,
    ),
    check(
      'orders_payment_status_chk',
      sql`${table.paymentStatus} IN ('pending','requires_action','paid','failed','refunded')`,
    ),
    check(
      'orders_paid_at_chk',
      sql`(${table.paymentStatus} = 'paid') = (${table.paidAt} IS NOT NULL)`,
    ),
    check('orders_order_type_chk', sql`${table.orderType} IN ('dine_in','pickup','delivery')`),
    check('orders_channel_chk', sql`${table.channel} IN ('site','qr-menu')`),
    check(
      'orders_payment_type_chk',
      sql`${table.paymentType} IN ('online','cash','card_on_delivery')`,
    ),
    check(
      'orders_cancel_reason_chk',
      sql`${table.cancelReason} IS NULL OR ${table.cancelReason} IN ('guest_no_show','kitchen_out_of_stock','kitchen_too_busy','guest_requested','payment_issue','duplicate_order','other')`,
    ),
    check(
      'orders_canceled_from_status_chk',
      sql`${table.canceledFromStatus} IS NULL OR ${table.canceledFromStatus} IN ('placed','accepted','preparing','ready','completed','canceled')`,
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
    kind: text('kind').notNull().default('added'),
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
    check('order_modifiers_kind_chk', sql`${table.kind} IN ('added', 'excluded')`),
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
    stripeRefundId: text('stripe_refund_id'),
    refundRequestId: text('refund_request_id').notNull(),
    amount: money('amount').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
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
    uniqueIndex('payment_refunds_request_id_uq').on(table.tenantId, table.refundRequestId),
  ],
);

/**
 * What the guest thought, hung off the order rather than an account: ordering here is proof
 * enough that they were, and asking for a login first would cost most of the answers.
 */
export const orderFeedback = pgTable(
  'order_feedback',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    orderId: uuid('order_id').notNull(),
    locationId: uuid('location_id').notNull(),
    rating: smallint('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'order_feedback_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'order_feedback_order_fk',
      child: { id: table.orderId, tenantId: table.tenantId },
      parent: { id: orders.id, tenantId: orders.tenantId },
    }).onDelete('cascade'),
    check('order_feedback_rating_chk', sql`${table.rating} BETWEEN 1 AND 5`),
    uniqueIndex('order_feedback_order_uq').on(table.tenantId, table.orderId),
    index('order_feedback_recent_idx').on(table.tenantId, table.locationId, table.createdAt),
  ],
);
