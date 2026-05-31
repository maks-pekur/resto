'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteMemberAction, type InviteActionState } from './invite-action';

const initial: InviteActionState = { error: null, success: null };

/**
 * D-09 minimal invite form: single email + single role dropdown + submit.
 * NO live invitation list / pending-invites table / revoke — those land
 * in Phase 17 / TEAM-01 + TEAM-02.
 *
 * D-10: role options are filtered by the inviter's tier client-side as a
 * defense-in-depth measure. BA's `crud-invites.mjs:112` is the authoritative
 * gate; the regression e2e in `identity-invitation.e2e.spec.ts` Test 2
 * pins that gate.
 */
type Role = 'owner' | 'admin' | 'staff';

const allowedRoles = (inviterRole: Role | undefined): readonly Role[] => {
  if (inviterRole === 'owner') return ['owner', 'admin', 'staff'];
  if (inviterRole === 'admin') return ['admin', 'staff'];
  return ['staff'];
};

export const InviteForm = ({ inviterRole }: { readonly inviterRole: Role | undefined }) => {
  const [state, action, pending] = useActionState(inviteMemberAction, initial);
  const roles = allowedRoles(inviterRole);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="teammate@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          required
          defaultValue={roles[0]}
          className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-muted-foreground text-sm">
          {state.success}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
};
