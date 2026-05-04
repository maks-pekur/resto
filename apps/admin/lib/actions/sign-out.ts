'use server';

import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';

/**
 * Server action: sign the operator out via BA, relay BA's
 * cookie-clearing `Set-Cookie` to the user agent, then redirect to
 * `/login`. Triggered by a `<form action={signOutAction}>` in the
 * sidebar's NavUser dropdown — keeps the auth surface server-side
 * with no `better-auth/react` client SDK on the wire.
 */
export async function signOutAction(): Promise<never> {
  await apiFetch<unknown>('/api/auth/sign-out', {
    method: 'POST',
    forwardSetCookie: true,
  });
  redirect('/login');
}
