import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { randomBytes } from 'node:crypto';

// Prices and discounts are resolved server-side from the published catalog
// (API review 2026-06-15 BLOCK-1) — the client sends only what it selected
// (item, size, modifier options, quantity, display names), never money.
const CartModifierSchema = z.object({
  optionId: z.string().uuid(),
  name: z.string().min(1).max(200),
  amount: z.number().int().positive().optional(),
});

const CartLineItemSchema = z.object({
  itemId: z.string().uuid(),
  sizeId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  modifiers: z.array(CartModifierSchema),
  quantity: z.number().int().positive(),
});

// D-04: apps/qr-menu has no order-submission path yet -- 'site' is the only
// producible value today, but the column/enum exist ahead of QR ordering.
const OrderChannelSchema = z.enum(['site', 'qr-menu']);

export const CreateOrderInputSchema = z
  .object({
    items: z.array(CartLineItemSchema).min(1),
    fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']),
    table: z.string().max(20).optional(),
    customerName: z.string().max(200).optional(),
    customerPhone: z.string().max(30).optional(),
    customerEmail: z.string().email().max(254).optional(),
    idempotencyKey: z.string().uuid(),
    // ORD-12: no operating-hours source exists yet — accept any future datetime; schedule validation deferred.
    scheduledFor: z
      .string()
      .datetime()
      .refine((v) => new Date(v) > new Date(), {
        message: 'scheduledFor must be in the future',
      })
      .optional(),
    channel: OrderChannelSchema.optional().default('site'),
    // D-17: a flag + a server-set timestamp is the GDPR lawful-basis shape
    // this repo precedents for consent (no consent-copy/version table or
    // column exists anywhere else) -- the client never supplies the
    // timestamp, Order.create() derives marketingConsentAt from `now`.
    marketingConsent: z.boolean().optional().default(false),
  })
  .refine(
    (data) => {
      if (data.fulfillmentMode === 'dine_in') return data.table !== undefined && data.table !== '';
      return true;
    },
    { message: 'table is required for dine_in orders', path: ['table'] },
  )
  .refine(
    (data) => {
      if (data.fulfillmentMode === 'pickup' || data.fulfillmentMode === 'delivery') {
        return (
          data.customerName !== undefined &&
          data.customerName !== '' &&
          data.customerPhone !== undefined &&
          data.customerPhone !== ''
        );
      }
      return true;
    },
    {
      message: 'customerName and customerPhone are required for pickup/delivery orders',
      path: ['customerName'],
    },
  );

export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;
export class CreateOrderInputDto extends createZodDto(CreateOrderInputSchema) {}

export const OrderResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().min(1).max(20),
  status: z.string(),
  total: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  // D-04: raw integer, not a pre-formatted '#042' string -- display format
  // (e.g. '№{{n}}') is a UI concern, so a future rebrand needs no backfill.
  // Non-nullable end to end (Plan 04 Task 3): orders.short_number is NOT
  // NULL as of migration 0075 and no pre-migration row survived the clear,
  // so no legacy null value can ever be read back through this schema.
  shortNumber: z.number().int().positive(),
  channel: OrderChannelSchema,
});
export type OrderResponse = z.infer<typeof OrderResponseSchema>;

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getUTCFullYear().toString();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  const bytes = randomBytes(5);
  const suffix = Array.from(bytes)
    .map((b) => ALPHANUM[b % ALPHANUM.length])
    .join('');
  return `${y}${m}${d}-${suffix}`;
}
