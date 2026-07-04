import { Inject, Injectable } from '@nestjs/common';
import { AUTH_TOKEN } from '../identity.tokens';
import type { Auth } from '../infrastructure/better-auth/auth.config';
import { roleApi } from '../infrastructure/better-auth/role-api.bridge';

export interface ListRolesInput {
  readonly organizationId: string;
  readonly headers: Headers;
}

export interface RoleView {
  readonly id: string;
  readonly role: string;
  readonly permission: Record<string, string[]>;
}

@Injectable()
export class ListRolesService {
  constructor(@Inject(AUTH_TOKEN) private readonly auth: Auth) {}

  async execute(input: ListRolesInput): Promise<{ roles: RoleView[] }> {
    const result = await roleApi(this.auth).listOrgRoles({
      query: { organizationId: input.organizationId },
      headers: input.headers,
    });

    // D-12 (08.3): exclude archived roles — BA list may include archivedAt in raw row data
    const active = (result.roles as (RoleView & { archivedAt?: string | null })[]).filter(
      (r) => !r.archivedAt,
    );

    return {
      roles: active.map((r) => ({ id: r.id, role: r.role, permission: r.permission })),
    };
  }
}
