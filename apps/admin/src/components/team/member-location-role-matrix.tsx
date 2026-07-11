import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  assignLocationRoleMutation,
  memberLocationRolesQuery,
  removeLocationRoleMutation,
} from '@/lib/queries/team';
import { friendlyRoleError, type RoleView } from '@/lib/queries/roles';
import type { LocationView } from '@/lib/queries/locations';

const SYSTEM_ROLES = ['owner', 'admin', 'staff'] as const;

interface MemberLocationRoleMatrixProps {
  readonly member: {
    readonly id: string;
    readonly email: string;
  };
  readonly isOwner: boolean;
  readonly availableRoles: RoleView[];
  readonly locations: LocationView[];
}

export function MemberLocationRoleMatrix({
  member,
  isOwner,
  availableRoles,
  locations,
}: MemberLocationRoleMatrixProps) {
  const qc = useQueryClient();
  const [addLocationId, setAddLocationId] = useState('');
  const [addRoleSlug, setAddRoleSlug] = useState('');

  const { data } = useQuery({ ...memberLocationRolesQuery(member.id), enabled: isOwner });
  const pairs = data?.data?.locationRoles ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['team', 'location-roles', member.id] });
    void qc.invalidateQueries({ queryKey: ['team', 'members'] });
    void qc.invalidateQueries({ queryKey: ['roles', 'members'] });
  };

  const assignMutation = useMutation({
    mutationFn: (input: { locationId: string; roleSlug: string }) =>
      assignLocationRoleMutation({ memberId: member.id, ...input }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(friendlyRoleError(res.status, res.data as Record<string, string> | null));
        return;
      }
      toast.success(`Location role updated for ${member.email}.`);
      setAddLocationId('');
      setAddRoleSlug('');
      invalidate();
    },
    onError: () => toast.error('Could not update location role. Please try again.'),
  });

  const removeMutation = useMutation({
    mutationFn: (locationId: string) =>
      removeLocationRoleMutation({ memberId: member.id, locationId }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(friendlyRoleError(res.status, res.data as Record<string, string> | null));
        return;
      }
      toast.success(`Location role removed for ${member.email}.`);
      invalidate();
    },
    onError: () => toast.error('Could not remove location role. Please try again.'),
  });

  if (!isOwner) return null;

  const locationName = (locationId: string) =>
    locations.find((l) => l.id === locationId)?.name ?? locationId;
  const assignedLocationIds = new Set(pairs.map((p) => p.locationId));
  const availableLocations = locations.filter((l) => !assignedLocationIds.has(l.id));

  return (
    <div className="flex flex-col gap-1.5">
      {pairs.length === 0 && (
        <span className="text-muted-foreground text-xs">No locations assigned</span>
      )}
      {pairs.map((pair) => (
        <div key={pair.locationId} className="flex items-center gap-1.5">
          <span className="w-28 truncate text-xs" title={locationName(pair.locationId)}>
            {locationName(pair.locationId)}
          </span>
          <Select
            value={pair.role}
            disabled={assignMutation.isPending}
            onValueChange={(roleSlug) => {
              assignMutation.mutate({ locationId: pair.locationId, roleSlug });
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={`Role for ${member.email} at ${locationName(pair.locationId)}`}
              className="w-32"
            >
              <SelectValue />
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${locationName(pair.locationId)} from ${member.email}`}
            disabled={removeMutation.isPending}
            onClick={() => {
              removeMutation.mutate(pair.locationId);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      {availableLocations.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1">
          <Select value={addLocationId} onValueChange={setAddLocationId}>
            <SelectTrigger
              size="sm"
              aria-label={`Add location for ${member.email}`}
              className="w-28"
            >
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              {availableLocations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={addRoleSlug} onValueChange={setAddRoleSlug}>
            <SelectTrigger
              size="sm"
              aria-label={`Role to add for ${member.email}`}
              className="w-32"
            >
              <SelectValue placeholder="Role" />
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!addLocationId || !addRoleSlug || assignMutation.isPending}
            onClick={() => {
              assignMutation.mutate({ locationId: addLocationId, roleSlug: addRoleSlug });
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
