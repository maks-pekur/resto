'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';

const SignUpFormSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  displayName: z.string().min(2).max(120),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code'),
});

export interface SignUpActionState {
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
  if (status === 409) {
    if (body?.code === 'signup.email_taken') return 'An account with that email already exists.';
    if (body?.code === 'signup.slug_unavailable')
      return 'That company name is too common; try a more specific one.';
    return body?.message ?? body?.detail ?? 'Conflict.';
  }
  if (status === 400) return body?.message ?? body?.detail ?? 'Please check your inputs.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return body?.detail ?? `Request failed (${status.toString()}).`;
};

export async function signUpAction(
  _prev: SignUpActionState,
  formData: FormData,
): Promise<SignUpActionState> {
  const parsed = SignUpFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
    defaultCurrency: formData.get('defaultCurrency'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const res = await apiFetch<ProblemDetails>('/v1/signup', {
    method: 'POST',
    body: { ...parsed.data, locale: 'en' },
    forwardSetCookie: true,
  });

  if (!res.ok) {
    return { error: friendly(res.status, res.data ?? null) };
  }

  redirect('/dashboard');
}
