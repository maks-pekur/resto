import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildEnvelope, IdentityRolePermissionsChangedV1 } from '@resto/events';
import { TenantId } from '@resto/domain';
import { containsNonDelegatable } from '@resto/domain';
import { AUTH_TOKEN } from '../identity.tokens';
import type { Auth } from '../infrastructure/better-auth/auth.config';
import { roleApi } from '../infrastructure/better-auth/role-api.bridge';
import { InsufficientPermissionsToMintError, RoleNotFoundError } from '../domain/errors';
import {
  IDENTITY_EVENT_EMITTER,
  type IdentityEventEmitterPort,
} from './ports/identity-event-emitter.port';

export interface UpdateRoleServiceInput {
  readonly roleSlug: string;
  readonly permission: Record<string, string[]>;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly headers: Headers;
}

@Injectable()
export class UpdateRoleService {
  private readonly logger = new Logger(UpdateRoleService.name);

  constructor(
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(IDENTITY_EVENT_EMITTER) private readonly emitter: IdentityEventEmitterPort,
  ) {}

  async execute(input: UpdateRoleServiceInput): Promise<void> {
    const listResult = await roleApi(this.auth).listOrgRoles({
      query: { organizationId: input.organizationId },
      headers: input.headers,
    });

    const existing = listResult.roles.find((r) => r.role === input.roleSlug);
    if (!existing) {
      throw new RoleNotFoundError(input.roleSlug);
    }

    // D-04 (08.3): NON_DELEGATABLE guard on new permission set MUST run before BA call
    if (containsNonDelegatable(input.permission)) {
      throw new InsufficientPermissionsToMintError();
    }

    await roleApi(this.auth).updateOrgRole({
      body: {
        organizationId: input.organizationId,
        roleName: input.roleSlug,
        data: { permission: input.permission },
      },
      headers: input.headers,
    });

    const tenantId = TenantId.parse(input.organizationId);
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
