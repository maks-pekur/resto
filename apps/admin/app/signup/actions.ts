'use server';

import { cookies } from 'next/headers';
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

interface SignUpSuccess {
  readonly tenant: { id: string; slug: string };
  readonly brand: { id: string; slug: string };
  readonly userId: string;
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

  const { email, password, displayName, defaultCurrency } = parsed.data;

  const res = await apiFetch<SignUpSuccess | ProblemDetails>('/v1/signup', {
    method: 'POST',
    forwardSetCookie: true,
    body: {
      email,
      password,
      displayName,
      defaultCurrency,
      locale: 'en',
    },
  });

  if (!res.ok) {
    const errorBody = (res.data as ProblemDetails | null) ?? null;
    return { error: friendly(res.status, errorBody) };
  }

  const success = res.data as SignUpSuccess | null;
  if (success?.brand?.slug) {
    const cookieStore = await cookies();
    cookieStore.set('resto.active_brand', success.brand.slug, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }

  redirect('/dashboard');
}
