import type { Auth } from './auth.config';

export interface RolePluginApi {
  createOrgRole: (opts: {
    body: {
      organizationId: string;
      role: string;
      permission: Record<string, string[]>;
    };
    headers: Headers;
  }) => Promise<{ role?: string }>;
  updateOrgRole: (opts: {
    body: {
      organizationId: string;
      roleName?: string;
      roleId?: string;
      data: { permission?: Record<string, string[]>; roleName?: string };
    };
    headers: Headers;
  }) => Promise<unknown>;
  deleteOrgRole: (opts: {
    body: { organizationId: string; roleName?: string; roleId?: string };
    headers: Headers;
  }) => Promise<unknown>;
  updateMemberRole: (opts: {
    body: { memberId: string; role: string; organizationId: string };
    headers: Headers;
  }) => Promise<unknown>;
}

export const roleApi = (auth: Auth): RolePluginApi => auth.api as unknown as RolePluginApi;
