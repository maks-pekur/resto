import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildEnvelope, IdentityRolePermissionsChangedV1 } from '@resto/events';
import { TenantId } from '@resto/domain';
import { containsNonDelegatable } from '@resto/domain';
import { AUTH_TOKEN, AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { Auth } from '../infrastructure/better-auth/auth.config';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { roleApi } from '../infrastructure/better-auth/role-api.bridge';
import { InsufficientPermissionsToMintError, RoleNotFoundError } from '../domain/errors';
import { listActiveCustomRoles } from './list-active-custom-roles';
import {
  IDENTITY_EVENT_EMITTER,
  type IdentityEventEmitterPort,
} from './ports/identity-event-emitter.port';

export interface UpdateRoleServiceInput {
  readonly roleSlug: string;
  readonly permission: Record<string, string[]>;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly headers: Headers;
}

@Injectable()
export class UpdateRoleService {
  private readonly logger = new Logger(UpdateRoleService.name);

  constructor(
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
    @Inject(IDENTITY_EVENT_EMITTER) private readonly emitter: IdentityEventEmitterPort,
  ) {}

  async execute(input: UpdateRoleServiceInput): Promise<void> {
    const existing = (await listActiveCustomRoles(this.authDb, input.tenantId)).find(
      (r) => r.role === input.roleSlug,
    );
    if (!existing) {
      throw new RoleNotFoundError(input.roleSlug);
    }

    // D-04 (08.3): NON_DELEGATABLE guard on new permission set MUST run before BA call
    if (containsNonDelegatable(input.permission)) {
      throw new InsufficientPermissionsToMintError();
    }

    await roleApi(this.auth).updateOrgRole({
      body: {
        organizationId: input.tenantId,
        roleName: input.roleSlug,
        data: { permission: input.permission },
      },
      headers: input.headers,
    });

    const tenantId = TenantId.parse(input.tenantId);
    try {
      await this.emitter.emit(
        buildEnvelope(
          IdentityRolePermissionsChangedV1,
          {
            tenantId,
            roleSlug: input.roleSlug,
            previousPermission: existing.permission,
            newPermission: input.permission,
            actorUserId: input.actorUserId,
          },
          { tenantId },
        ),
      );
    } catch (err) {
      this.logger.error(
        { err, type: 'identity.role_permissions_changed.v1', roleSlug: input.roleSlug },
        'Failed to emit identity.role_permissions_changed.v1',
      );
    }
  }
}
