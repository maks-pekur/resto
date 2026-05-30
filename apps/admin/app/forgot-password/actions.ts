'use server';

import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';
import { adminOrigin } from '@/lib/env';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export interface ForgotPasswordActionState {
  readonly error: string | null;
  readonly submitted: boolean;
}

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

  // Phase 03 carry-over from Phase 02 D-04: previously this file held a
  // `?? 'http://localhost:3001'` fallback which would silently route prod
  // reset emails to the dev host when ADMIN_WEB_URL was missing. The
  // adminOrigin() helper in @/lib/env throws at module load in non-dev when
  // ADMIN_WEB_URL is missing — Pitfall 4 in 03-RESEARCH.md.
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
