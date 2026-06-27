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
