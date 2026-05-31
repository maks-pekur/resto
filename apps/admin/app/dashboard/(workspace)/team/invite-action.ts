'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';

/**
 * Phase 03 AUTH-02: minimal team-invitation server action. Posts to BA's
 * `/api/auth/organization/invite-member` with the operator's session
 * cookie forwarded by `apiFetch`. BA enforces:
 *   - owner-only-can-grant-owner at `crud-invites.mjs:112` (Skeptic LOW-12
 *     regression test in `identity-invitation.e2e.spec.ts`).
 *   - email-verification before invite send via
 *     `requireEmailVerificationOnInvitation: true` (Pitfall 8).
 *   - 48h TTL on the invitation row (BA default, D-12).
 *
 * On success BA triggers `sendInvitationEmail` which delegates to the
 * wired EmailAdapterPort (Plan 02). The invitee receives a link to
 * `${ADMIN_WEB_URL}/accept-invitation/<invitation.id>`.
 */
const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['owner', 'admin', 'staff']),
});

export interface InviteActionState {
  readonly error: string | null;
  readonly success: string | null;
}

interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly message?: string;
  readonly code?: string;
}

export async function inviteMemberAction(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const parsed = InviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
      success: null,
    };
  }

  const res = await apiFetch<ProblemDetails>('/api/auth/organization/invite-member', {
    method: 'POST',
    body: { email: parsed.data.email, role: parsed.data.role },
  });

  if (!res.ok) {
    if (res.status === 403) {
      // BA's owner-only-grants-owner gate (D-10). Defense-in-depth on top of
      // the role-dropdown UI filter in `invite-form-client.tsx`.
      return {
        error: 'You are not allowed to invite a member with this role.',
        success: null,
      };
    }
    if (res.status === 409) {
      return {
        error: 'There is already a pending invitation for that email.',
        success: null,
      };
    }
    const body = res.data;
    return {
      error: body?.detail ?? body?.message ?? 'Could not send invitation.',
      success: null,
    };
  }

  revalidatePath('/dashboard/team');
  return {
    error: null,
    success: `Invitation sent to ${parsed.data.email}.`,
  };
}
