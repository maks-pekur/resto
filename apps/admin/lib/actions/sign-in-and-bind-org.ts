import 'server-only';
import { apiFetch } from '@/lib/api-server';

interface OrgSummary {
  readonly id: string;
}

interface SignInResponse {
  readonly token?: string;
  readonly user?: { readonly id: string };
}

export interface SignInAndBindOrgResult {
  readonly ok: boolean;
  readonly error?: 'invalid_credentials' | 'org_activation_failed';
}

/**
 * Phase 03 carry-over from Phase 02 D-02: collapses the previous
 * 3-call fan-out in `login/actions.ts:36-74` (signIn → org-list →
 * setActive) into one coherent flow. Single try/catch boundary; a
 * single 401 redirect path bubbles via `apiFetch` (which catches
 * 401 and forwards to `/login?expired=1` per api-server.ts:186-188).
 *
 * Returns a result object instead of throwing so the caller can
 * surface a friendly toast without unwinding the request.
 */
export const signInAndBindOrg = async (input: {
  readonly email: string;
  readonly password: string;
}): Promise<SignInAndBindOrgResult> => {
  // Step 1: sign-in. BA returns 200 + Set-Cookie on success.
  const signIn = await apiFetch<SignInResponse>('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email: input.email, password: input.password },
    forwardSetCookie: true,
  });
  if (!signIn.ok) {
    return { ok: false, error: 'invalid_credentials' };
  }

  // Step 2: list orgs. Only auto-activate when exactly one org is bound
  // (matches Phase 02 behaviour — multi-org picker is a future ticket).
  const orgList = await apiFetch<readonly OrgSummary[]>('/api/auth/organization/list', {
    method: 'GET',
  });
  if (!orgList.ok || orgList.data === null) return { ok: true };
  if (orgList.data.length !== 1) return { ok: true };
  const orgId = orgList.data[0]?.id;
  if (!orgId) return { ok: true };

  // Step 3: bind active org.
  const setActive = await apiFetch<unknown>('/api/auth/organization/set-active', {
    method: 'POST',
    body: { organizationId: orgId },
    forwardSetCookie: true,
  });
  if (!setActive.ok) {
    return { ok: false, error: 'org_activation_failed' };
  }
  return { ok: true };
};
