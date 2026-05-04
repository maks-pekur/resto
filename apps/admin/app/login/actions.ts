'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';

const SignInInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().startsWith('/').default('/dashboard'),
});

export interface LoginActionState {
  readonly error: string | null;
}

interface OrgSummary {
  readonly id: string;
}

interface SignInResponse {
  readonly token?: string;
  readonly user?: { readonly id: string };
}

const fetchSingleOrgId = async (): Promise<string | null> => {
  const res = await apiFetch<readonly OrgSummary[]>('/api/auth/organization/list', {
    method: 'GET',
  });
  if (!res.ok || !Array.isArray(res.data)) return null;
  if (res.data.length !== 1) return null;
  return res.data[0]?.id ?? null;
};

export async function signInAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = SignInInput.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? '/dashboard',
  });
  if (!parsed.success) {
    return { error: 'Enter a valid email and password.' };
  }

  // Sign in — relay BA's Set-Cookie to the user agent.
  const signIn = await apiFetch<SignInResponse>('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: parsed.data.email, password: parsed.data.password },
    forwardSetCookie: true,
  });
  if (!signIn.ok) {
    return { error: 'Invalid credentials.' };
  }

  // Auto-activate the operator's tenant when they belong to exactly one
  // org. Multi-org picker lands with a future ticket.
  const orgId = await fetchSingleOrgId();
  if (orgId) {
    const setActive = await apiFetch<unknown>('/api/auth/organization/set-active', {
      method: 'POST',
      body: { organizationId: orgId },
      forwardSetCookie: true,
    });
    if (!setActive.ok) {
      return { error: 'Could not activate your organization.' };
    }
  }

  redirect(parsed.data.next);
}
