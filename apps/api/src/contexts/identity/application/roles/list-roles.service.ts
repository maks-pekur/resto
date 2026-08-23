import { Inject, Injectable } from '@nestjs/common';
import { AUTH_DRIZZLE_TOKEN } from '../../identity.tokens';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';
import { listActiveCustomRoles } from './list-active-custom-roles';

export interface ListRolesInput {
  readonly tenantId: string;
  readonly headers: Headers;
}

export interface RoleView {
  readonly id: string;
  readonly role: string;
  readonly permission: Record<string, string[]>;
}

@Injectable()
export class ListRolesService {
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  async execute(input: ListRolesInput): Promise<{ roles: RoleView[] }> {
    const roles = await listActiveCustomRoles(this.authDb, input.tenantId);
    return { roles };
  }
}
