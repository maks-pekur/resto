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
