import { z } from 'zod';

const phoneRegex = /^\+?[0-9\s\-()]{7,}$/u;

const orderTimeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asap') }),
  z.object({ kind: z.literal('scheduled'), at: z.string().min(1, 'Choose a time') }),
]);

export type CartMode = 'delivery' | 'pickup' | null;

export function createCheckoutSchema(mode: CartMode) {
  return z
    .object({
      name: z.string().min(1, 'Name is required'),
      phone: z.string().regex(phoneRegex, 'Enter a valid phone number'),
      email: z.string().email('Enter a valid email address'),
      address: z.string().optional(),
      orderTime: orderTimeSchema,
    })
    .superRefine((value, ctx) => {
      if (
        mode === 'delivery' &&
        (value.address === undefined || value.address.trim().length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address'],
          message: 'Delivery address is required',
        });
      }
    });
}

export const CheckoutFormSchema = createCheckoutSchema(null);
export type CheckoutForm = z.infer<ReturnType<typeof createCheckoutSchema>>;
