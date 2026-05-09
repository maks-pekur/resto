import { z } from 'zod';
import { Currency } from '@resto/domain';

export const SignUpInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  displayName: z.string().min(2).max(120),
  defaultCurrency: Currency,
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
});
export type SignUpInput = z.infer<typeof SignUpInput>;
