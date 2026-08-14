import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreatePaymentIntentInputSchema = z.object({
  orderId: z.string().uuid(),
});

export type CreatePaymentIntentInput = z.infer<typeof CreatePaymentIntentInputSchema>;
export class CreatePaymentIntentInputDto extends createZodDto(CreatePaymentIntentInputSchema) {}

export const CreatePaymentIntentResponseSchema = z.object({
  clientSecret: z.string().min(1),
  connectedAccountId: z.string().min(1),
  orderId: z.string().uuid(),
});

export type CreatePaymentIntentResponse = z.infer<typeof CreatePaymentIntentResponseSchema>;

export const RefundInputSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().min(1, 'Reason is required'),
});

export type RefundInput = z.infer<typeof RefundInputSchema>;
export class RefundInputDto extends createZodDto(RefundInputSchema) {}

// Canonical cancel reason codes -- pinned identically in order.aggregate.ts
// (CANCEL_REASON_CODES), 10-RESEARCH.md §A.3, 10-UI-SPEC.md §5/§12 and
// migration 0073's orders_cancel_reason_chk CHECK constraint. This DTO-level
// enum is the first HTTP-boundary line of defence, well ahead of the
// domain-level InvalidCancelReasonError and the DB CHECK constraint.
const CANCEL_REASON_CODES = [
  'guest_no_show',
  'kitchen_out_of_stock',
  'kitchen_too_busy',
  'guest_requested',
  'payment_issue',
  'duplicate_order',
  'other',
] as const;

export const CancelOrderInputSchema = z.object({
  reasonCode: z.enum(CANCEL_REASON_CODES),
  cancelNote: z.string().max(500).optional(),
});

export type CancelOrderInput = z.infer<typeof CancelOrderInputSchema>;
export class CancelOrderInputDto extends createZodDto(CancelOrderInputSchema) {}
