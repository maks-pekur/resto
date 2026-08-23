import { apiFetch } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';

export interface OrgMember {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly createdAt: string;
}

export interface OrgInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly inviterId: string;
}

export const memberListQuery = () => ({
  queryKey: ['team', 'members'] as const,
  queryFn: async () => {
    const result = await authClient.organization.listMembers();
    return result.data ?? [];
  },
  staleTime: 30_000,
});

export const invitationListQuery = () => ({
  queryKey: ['team', 'invitations'] as const,
  queryFn: async () => {
    const result = await authClient.organization.listInvitations();
    return result.data ?? [];
  },
  staleTime: 30_000,
});

export interface MemberLocationRoleView {
  readonly locationId: string;
  readonly role: string;
}

export const memberLocationRolesQuery = (memberId: string) => ({
  queryKey: ['team', 'location-roles', memberId] as const,
  queryFn: () =>
    apiFetch<{ locationRoles: MemberLocationRoleView[] }>(`/v1/members/${memberId}/location-roles`),
  staleTime: 30_000,
});

export const assignLocationRoleMutation = (input: {
  memberId: string;
  locationId: string;
  roleSlug: string;
}) =>
  apiFetch<undefined>(`/v1/members/${input.memberId}/location-roles`, {
    method: 'POST',
    body: { locationId: input.locationId, roleSlug: input.roleSlug },
  });

export const removeLocationRoleMutation = (input: { memberId: string; locationId: string }) =>
  apiFetch<undefined>(`/v1/members/${input.memberId}/location-roles/${input.locationId}`, {
    method: 'DELETE',
  });
