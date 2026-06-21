import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

type Role = 'owner' | 'admin' | 'staff';

const allowedRoles = (inviterRole: Role | undefined): readonly Role[] => {
  if (inviterRole === 'owner') return ['owner', 'admin', 'staff'];
  if (inviterRole === 'admin') return ['admin', 'staff'];
  return ['staff'];
};

interface InviteFormState {
  error: string | null;
  success: string | null;
}

export function InviteForm({
  inviterRole,
  onSuccess,
}: {
  readonly inviterRole: Role | undefined;
  readonly onSuccess?: () => void;
}) {
  const [state, setState] = useState<InviteFormState>({ error: null, success: null });
  const roles = allowedRoles(inviterRole);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Role }) => {
      const baRole = role === 'staff' ? 'member' : role;
      const res = await authClient.organization.inviteMember({ email, role: baRole });
      return res;
    },
    onSuccess: (res, { email }) => {
      if (res.error) {
        if (res.error.status === 403) {
          setState({
            error: 'You are not allowed to invite a member with this role.',
            success: null,
          });
        } else if (res.error.status === 409) {
          setState({
            error: 'There is already a pending invitation for that email.',
            success: null,
          });
        } else {
          setState({ error: res.error.message ?? 'Could not send invitation.', success: null });
        }
        return;
      }
      void qc.invalidateQueries({ queryKey: ['team', 'invitations'] });
      setState({ error: null, success: `Invitation sent to ${email}.` });
      onSuccess?.();
    },
    onError: () => {
      setState({ error: 'Could not send invitation.', success: null });
    },
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = (fd.get('email') as string | null)?.trim().toLowerCase() ?? '';
    const role = (fd.get('role') as Role | null) ?? roles[0] ?? 'staff';
    if (!email) return;
    mutation.mutate({ email, role });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}
