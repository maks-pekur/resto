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

interface SignUpSuccess {
  readonly status: 'pending_verification';
}

/**
 * Phase 03 D-06: the api now returns the enumeration-safe
 * `{ status: 'pending_verification' }` on BOTH the new-email and
 * existing-email branches. The admin UI deliberately no longer
 * differentiates the two — every successful submission redirects to
 * `/login?signup=pending_verification`, where the login page renders the
 * generic "Check your email to verify your account" toast. The friendly
 * "email taken" message is the trade-off Pattern 3 in 03-RESEARCH.md
 * documents.
 */
const friendly = (status: number, body: ProblemDetails | null): string => {
  // 409 still occurs for slug exhaustion (rare); 400 for validation.
  if (status === 409) {
    if (body?.code === 'signup.slug_unavailable') {
      return 'That company name is too common; try a more specific one.';
    }
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

  // D-06: do NOT forwardSetCookie — both branches must look identical on
  // the wire, and the api now strips Set-Cookie from the response.
  const res = await apiFetch<SignUpSuccess | ProblemDetails>('/v1/signup', {
    method: 'POST',
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

  redirect('/login?signup=pending_verification');
}
