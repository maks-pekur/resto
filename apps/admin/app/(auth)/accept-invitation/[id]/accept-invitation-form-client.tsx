'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { acceptInvitationAction, type AcceptInvitationState } from './actions';

const initial: AcceptInvitationState = { error: null };

/**
 * Phase 03 AUTH-03 confirm step. Hidden `invitationId` is the only field —
 * the operator clicks "Join <tenant>" and the server action posts to BA's
 * accept-invitation endpoint with the existing session cookie.
 */
export const AcceptInvitationForm = ({
  invitationId,
  tenantLabel,
}: {
  readonly invitationId: string;
  readonly tenantLabel: string;
}) => {
  const [state, action, pending] = useActionState(acceptInvitationAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="invitationId" value={invitationId} />
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Joining…' : `Join ${tenantLabel}`}
      </Button>
    </form>
  );
};
