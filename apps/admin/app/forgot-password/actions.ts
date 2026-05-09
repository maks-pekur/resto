'use server';

import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export interface ForgotPasswordActionState {
  readonly error: string | null;
  readonly submitted: boolean;
}

const adminOrigin = (): string => process.env.ADMIN_WEB_URL ?? 'http://localhost:3001';

export async function forgotPasswordAction(
  _prev: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = ForgotPasswordSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: 'Enter a valid email address.', submitted: false };
  }

  const res = await apiFetch<unknown>('/api/auth/request-password-reset', {
    method: 'POST',
    body: {
      email: parsed.data.email,
      redirectTo: `${adminOrigin()}/reset-password`,
    },
  });

  if (res.status >= 500) {
    return { error: 'Something went wrong on our side. Please try again.', submitted: false };
  }

  // Always render the same confirmation regardless of whether the email
  // matched an account — avoids leaking which addresses are registered.
  return { error: null, submitted: true };
}
