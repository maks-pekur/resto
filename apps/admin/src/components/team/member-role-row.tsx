import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { assignRole, friendlyRoleError, type RoleView } from '@/lib/queries/roles';

const SYSTEM_ROLES = ['owner', 'admin', 'staff'] as const;

interface MemberRoleRowProps {
  readonly member: {
    readonly id: string;
    readonly userId: string;
    readonly email: string;
    readonly role: string;
  };
  readonly isOwner: boolean;
  readonly currentUserId: string;
  readonly availableRoles: RoleView[];
}

export function MemberRoleRow({
  member,
  isOwner,
  currentUserId,
  availableRoles,
}: MemberRoleRowProps) {
  const qc = useQueryClient();
  const isSelf = member.userId === currentUserId;

  const assignMutation = useMutation({
    mutationFn: (roleSlug: string) => assignRole({ memberId: member.id, role: roleSlug }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(friendlyRoleError(res.status, res.data as Record<string, string> | null));
      } else {
        toast.success(`Role updated for ${member.email}.`);
        void qc.invalidateQueries({ queryKey: ['roles', 'members'] });
        void qc.invalidateQueries({ queryKey: ['team', 'members'] });
      }
    },
    onError: () => toast.error('Could not update role. Please try again.'),
  });

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 text-sm">{member.email}</td>
      <td className="px-4 py-2">
        <Badge variant="outline">{member.role}</Badge>
      </td>
      {isOwner && (
        <td className="px-4 py-2">
          {isSelf ? (
            <Select disabled value={member.role}>
              <SelectTrigger
                size="sm"
                aria-label={`Role for ${member.email}`}
                title="You cannot change your own role"
                className="w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={member.role}
              disabled={assignMutation.isPending}
              onValueChange={(slug) => {
                assignMutation.mutate(slug);
              }}
            >
              <SelectTrigger size="sm" aria-label={`Role for ${member.email}`} className="w-40">
                <SelectValue placeholder={assignMutation.isPending ? 'Saving…' : 'Select role'} />
              </SelectTrigger>
              <SelectContent>
                {SYSTEM_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
                {availableRoles.map((r) => (
                  <SelectItem key={r.id} value={r.role}>
                    {r.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </td>
      )}
    </tr>
  );
}
