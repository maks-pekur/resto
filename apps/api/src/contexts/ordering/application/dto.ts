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
  kind: z.enum(['added', 'excluded']).optional().default('added'),
});

const CartLineItemSchema = z.object({
  itemId: z.string().uuid(),
  sizeId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  modifiers: z.array(CartModifierSchema),
  quantity: z.number().int().positive(),
});

const OrderChannelSchema = z.enum(['site', 'qr-menu']);

export const CreateOrderInputSchema = z
  .object({
    items: z.array(CartLineItemSchema).min(1),
    orderType: z.enum(['dine_in', 'pickup', 'delivery']),
    /** Only trusted from an operator; a guest's table comes from their scanned session. */
    tableId: z.string().uuid().optional(),
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
    /** How the guest intends to pay. The money itself arrives later, on its own path. */
    paymentType: z.enum(['online', 'cash', 'card_on_delivery']).optional().default('online'),
    marketingConsent: z.boolean().optional().default(false),
  })

  .refine(
    (data) => {
      if (data.orderType === 'pickup' || data.orderType === 'delivery') {
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
  )
  .refine((data) => data.paymentType !== 'card_on_delivery' || data.orderType === 'delivery', {
    message: 'card_on_delivery is only for delivery orders',
    path: ['paymentType'],
  });

export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;
export class CreateOrderInputDto extends createZodDto(CreateOrderInputSchema) {}

export const OrderResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().min(1).max(20),
  status: z.string(),
  total: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
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

/** 10.7 D-15: only what a guest needs to recognise their own order. No composition, no snapshot
 * of the name and phone they typed, no internal ids. */
export const MyOrderSummarySchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  shortNumber: z.number().int(),
  status: z.string(),
  paymentStatus: z.string(),
  total: z.string(),
  currency: z.string(),
  createdAt: z.string(),
});
export type MyOrderSummary = z.infer<typeof MyOrderSummarySchema>;

export const MyOrdersResponseSchema = z.object({ orders: z.array(MyOrderSummarySchema) });
export type MyOrdersResponse = z.infer<typeof MyOrdersResponseSchema>;
export class MyOrdersResponseDto extends createZodDto(MyOrdersResponseSchema) {}
