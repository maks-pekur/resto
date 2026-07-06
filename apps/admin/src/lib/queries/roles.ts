import { apiFetch } from '@/lib/api-client';

export interface RoleView {
  readonly id: string;
  readonly role: string;
  readonly permission: Record<string, string[]>;
  readonly memberCount?: number;
  readonly system?: boolean;
}

export interface RoleMemberView {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly role: string;
}

interface ProblemDetails {
  readonly code?: string;
  readonly message?: string;
  readonly detail?: string;
}

export const rolesQuery = () => ({
  queryKey: ['roles'] as const,
  queryFn: () => apiFetch<{ roles: RoleView[] }>('/v1/roles'),
  staleTime: 30_000,
});

export const roleQuery = (roleSlug: string) => ({
  queryKey: ['roles', roleSlug] as const,
  queryFn: () => apiFetch<RoleView>(`/v1/roles/${roleSlug}`),
  staleTime: 30_000,
});

export const roleMembersQuery = () => ({
  queryKey: ['roles', 'members'] as const,
  queryFn: () => apiFetch<{ members: RoleMemberView[] }>('/v1/roles/members'),
  staleTime: 30_000,
});

export const createRole = (body: { roleName: string; permission: Record<string, string[]> }) =>
  apiFetch<RoleView>('/v1/roles', { method: 'POST', body });

export const updateRole = (
  roleSlug: string,
  body: { permission: Record<string, string[]>; roleName?: string },
) => apiFetch<RoleView>(`/v1/roles/${roleSlug}`, { method: 'PUT', body });

export const archiveRole = (roleSlug: string) =>
  apiFetch<undefined>(`/v1/roles/${roleSlug}`, { method: 'DELETE' });

export const assignRole = (body: { memberId: string; role: string }) =>
  apiFetch<undefined>(`/v1/roles/${body.role}/assign`, { method: 'POST', body });

export const friendlyRoleError = (
  status: number,
  body: ProblemDetails | null,
  name?: string,
): string => {
  const code = body?.code ?? '';
  if (status === 403) {
    if (code === 'role.insufficient_permissions' || code === 'role.assignment_exceeds_authority') {
      return "You cannot grant permissions you don't hold. Adjust the role's permissions.";
    }
    return "You cannot grant permissions you don't hold. Adjust the role's permissions.";
  }
  if (status === 400) {
    if (code === 'role.name_reserved') {
      return `"${name ?? body?.message ?? 'This'}" is a reserved role name.`;
    }
    if (code === 'role.occupied') {
      const match = body?.message?.match(/(\d+)/);
      const n = match ? match[1] : 'some';
      return `Reassign ${n} member${n === '1' ? '' : 's'} from this role before archiving.`;
    }
    if (code === 'role.cap_reached') {
      return 'You have reached the maximum of 25 custom roles. Archive an unused role to create a new one.';
    }
    return body?.message ?? 'Something went wrong. Please try again.';
  }
  if (status === 409) {
    const roleName = name ?? '';
    return roleName
      ? `A role named "${roleName}" already exists.`
      : 'A role with this name already exists. Choose a different name.';
  }
  return body?.message ?? 'Something went wrong. Please try again.';
};
