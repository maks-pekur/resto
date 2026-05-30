'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signInAndBindOrg } from '@/lib/actions/sign-in-and-bind-org';

/**
 * Phase 03 carry-over: previously this file fanned out three sequential
 * apiFetch calls (sign-in → org-list → set-active) with bespoke error
 * handling at each step. The work moved into
 * `apps/admin/lib/actions/sign-in-and-bind-org.ts` (single try/catch,
 * single 401 path) per CTO D-02 suggestion in Phase 02.
 *
 * `next` is refined against the `//evil.com` protocol-relative
 * open-redirect primitive per apps/CLAUDE.md CR-01.
 */
const SignInInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z
    .string()
    .startsWith('/')
    .refine((s) => !/^\/[\\/]/.test(s), 'protocol-relative paths are not allowed')
    .default('/dashboard'),
});

export interface LoginActionState {
  readonly error: string | null;
}

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

  const result = await signInAndBindOrg({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (!result.ok) {
    if (result.error === 'org_activation_failed') {
      return { error: 'Could not activate your organization.' };
    }
    if (result.error === 'org_list_failed') {
      return { error: 'Signed in, but could not load your organizations. Try again.' };
    }
    return { error: 'Invalid credentials.' };
  }

  redirect(parsed.data.next);
}
