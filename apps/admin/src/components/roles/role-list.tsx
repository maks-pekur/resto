import { useNavigate } from '@tanstack/react-router';
import { Archive, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RoleView } from '@/lib/queries/roles';

const SYSTEM_ROLE_SLUGS = new Set(['owner', 'admin', 'staff']);

interface RoleListProps {
  readonly roles: RoleView[];
  readonly brandSlug: string;
  readonly onArchive: (role: RoleView) => void;
}

export function RoleList({ roles, brandSlug, onArchive }: RoleListProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Name
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Members
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const isSystem = role.system === true || SYSTEM_ROLE_SLUGS.has(role.role);
            return (
              <tr key={role.id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <span className="font-medium">{role.role}</span>
                  {isSystem && (
                    <Badge variant="outline" className="ml-2">
                      System
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">
                  {!isSystem && (
                    <Badge variant="secondary">
                      {role.memberCount ?? 0} member{role.memberCount === 1 ? '' : 's'}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">
                  {!isSystem && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${role.role} role`}
                        onClick={() => {
                          void navigate({
                            to: '/$brandSlug/roles/$roleId',
                            params: { brandSlug, roleId: role.role },
                          });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Archive ${role.role} role`}
                        onClick={() => {
                          onArchive(role);
                        }}
                      >
                        <Archive className="size-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RoleListSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    </div>
  );
}
