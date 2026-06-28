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
