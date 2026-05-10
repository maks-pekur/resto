import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { Currency } from '@resto/domain';

export const SignUpInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  displayName: z.string().min(2).max(120),
  defaultCurrency: Currency,
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
});
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

export class SignUpInputDto extends createZodDto(SignUpInputSchema) {}
