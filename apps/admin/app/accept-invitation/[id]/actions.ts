'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';

const AcceptSchema = z.object({
  invitationId: z.string().min(1),
});

export interface AcceptInvitationState {
  readonly error: string | null;
}

interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly message?: string;
  readonly code?: string;
}

/**
 * Phase 03 AUTH-03: accept the invitation. BA's
 * `/api/auth/organization/accept-invitation` matches `session.user.email`
 * against `invitation.email` (verified at `crud-invites.mjs:335`) and
 * runs the `afterAcceptInvitation` hook which attaches the user to the
 * organization (D-11 auto-attach for existing accounts).
 *
 * On success, redirect to `/dashboard` — the next request loads the
 * brand-switcher with the newly-attached tenant in scope.
 */
export async function acceptInvitationAction(
  _prev: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const parsed = AcceptSchema.safeParse({
    invitationId: formData.get('invitationId'),
  });
  if (!parsed.success) {
    return { error: 'Invitation id is missing.' };
  }

  const res = await apiFetch<ProblemDetails>('/api/auth/organization/accept-invitation', {
    method: 'POST',
    body: { invitationId: parsed.data.invitationId },
    forwardSetCookie: true,
  });

  if (!res.ok) {
    if (res.status === 403) {
      // Could be email mismatch OR EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING.
      return {
        error:
          'You are not allowed to accept this invitation — make sure you are signed in with the right email and that the email is verified.',
      };
    }
    if (res.status === 404 || res.status === 410) {
      return { error: 'Invitation is invalid or has expired.' };
    }
    const body = res.data;
    return {
      error: body?.detail ?? body?.message ?? 'Could not accept the invitation.',
    };
  }

  redirect('/dashboard');
}
