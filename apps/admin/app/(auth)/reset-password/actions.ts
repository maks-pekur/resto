'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is missing — request a new email.'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

export interface ResetPasswordActionState {
  readonly error: string | null;
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  message?: string;
  code?: string;
}

const friendly = (status: number, body: ProblemDetails | null): string => {
  if (status === 400) {
    if (body?.message === 'INVALID_TOKEN') {
      return 'This reset link is invalid or has expired. Request a new one.';
    }
    if (body?.message === 'PASSWORD_TOO_SHORT') return 'Password must be at least 12 characters.';
    if (body?.message === 'PASSWORD_TOO_LONG') return 'Password is too long.';
    return body?.detail ?? body?.message ?? 'Please check your inputs.';
  }
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return body?.detail ?? `Request failed (${status.toString()}).`;
};

export async function resetPasswordAction(
  _prev: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get('token'),
    newPassword: formData.get('newPassword'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const res = await apiFetch<ProblemDetails>('/api/auth/reset-password', {
    method: 'POST',
    body: { token: parsed.data.token, newPassword: parsed.data.newPassword },
  });

  if (!res.ok) {
    return { error: friendly(res.status, res.data ?? null) };
  }

  redirect('/login?reset=success');
}
