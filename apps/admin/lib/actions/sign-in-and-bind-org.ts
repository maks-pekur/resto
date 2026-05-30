import 'server-only';
import { apiFetch } from '@/lib/api-server';

interface OrgSummary {
  readonly id: string;
}

interface SignInResponse {
  readonly token?: string;
  readonly user?: { readonly id: string };
}

export type SignInAndBindOrgError =
  | 'invalid_credentials'
  | 'org_activation_failed'
  | 'org_list_failed';

export interface SignInAndBindOrgResult {
  readonly ok: boolean;
  readonly error?: SignInAndBindOrgError;
  // WR-05: surface the org count so the caller can render a multi-org
  // picker (`orgCount > 1`) or warn about a half-bound session
  // (`orgCount === 0`). Absent when the action did not reach the org list.
  readonly orgCount?: number;
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
 *
 * WR-05: distinguishes (a) signin failure, (b) org-list failure
 * (5xx / non-array body), (c) zero-org / multi-org auto-activation
 * skipped (ok=true with orgCount), (d) set-active failure.
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
  if (!orgList.ok) {
    return { ok: false, error: 'org_list_failed' };
  }
  const orgs = Array.isArray(orgList.data) ? orgList.data : [];
  if (orgs.length !== 1) {
    // Zero (legit pre-provisioning state) or multi-org (picker needed) —
    // both leave the session signed-in-but-unbound. Caller decides UX.
    return { ok: true, orgCount: orgs.length };
  }
  const orgId = orgs[0]?.id;
  if (!orgId) {
    return { ok: false, error: 'org_activation_failed' };
  }

  // Step 3: bind active org.
  const setActive = await apiFetch<unknown>('/api/auth/organization/set-active', {
    method: 'POST',
    body: { organizationId: orgId },
    forwardSetCookie: true,
  });
  if (!setActive.ok) {
    return { ok: false, error: 'org_activation_failed' };
  }
  return { ok: true, orgCount: 1 };
};
