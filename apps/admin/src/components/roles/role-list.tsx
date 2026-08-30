import { useNavigate } from '@tanstack/react-router';
import { Archive, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from '@/components/common/data-table';
import { RowActions } from '@/components/common/row-actions';
import type { RoleView } from '@/lib/queries/roles';

const SYSTEM_ROLE_SLUGS = new Set(['owner', 'admin', 'staff']);

interface RoleListProps {
  readonly roles: RoleView[];
  readonly onArchive: (role: RoleView) => void;
}

export function RoleList({ roles, onArchive }: RoleListProps) {
  const navigate = useNavigate();

  return (
    <DataTable>
      <DataTableHead
        columns={[
          { label: 'Name' },
          { label: 'Members' },
          { label: 'Actions', className: 'w-12 text-right', srOnly: true },
        ]}
      />
      <tbody>
        {roles.map((role) => {
          const isSystem = role.system === true || SYSTEM_ROLE_SLUGS.has(role.role);
          return (
            <DataTableRow key={role.id}>
              <DataTableCell>
                <span className="font-medium">{role.role}</span>
                {isSystem && (
                  <Badge variant="outline" className="ml-2">
                    System
                  </Badge>
                )}
              </DataTableCell>
              <DataTableCell>
                {!isSystem && (
                  <Badge variant="secondary">
                    {role.memberCount ?? 0} member{role.memberCount === 1 ? '' : 's'}
                  </Badge>
                )}
              </DataTableCell>
              <DataTableCell className="text-right">
                <RowActions
                  label={`Actions for ${role.role} role`}
                  actions={
                    isSystem
                      ? []
                      : [
                          {
                            key: 'edit',
                            label: 'Edit',
                            icon: Pencil,
                            onSelect: () => {
                              void navigate({
                                to: '/roles/$roleId',
                                params: { roleId: role.role },
                              });
                            },
                          },
                          {
                            key: 'archive',
                            label: 'Archive',
                            icon: Archive,
                            tone: 'destructive' as const,
                            onSelect: () => {
                              onArchive(role);
                            },
                          },
                        ]
                  }
                />
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </tbody>
    </DataTable>
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
