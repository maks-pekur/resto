import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildEnvelope, IdentityRoleCreatedV1 } from '@resto/events';
import { TenantId } from '@resto/domain';
import { containsNonDelegatable } from '@resto/domain';
import { AUTH_TOKEN } from '../../identity.tokens';
import type { Auth } from '../../infrastructure/better-auth/auth.config';
import { roleApi } from '../../infrastructure/better-auth/role-api.bridge';
import { InsufficientPermissionsToMintError, RoleNameReservedError } from '../../domain/errors';
import {
  IDENTITY_EVENT_EMITTER,
  type IdentityEventEmitterPort,
} from '../ports/identity-event-emitter.port';

const RESERVED_SYSTEM_SLUGS = new Set(['owner', 'admin', 'staff']);

export interface CreateRoleServiceInput {
  readonly roleName: string;
  readonly permission: Record<string, string[]>;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly headers: Headers;
}

@Injectable()
export class CreateRoleService {
  private readonly logger = new Logger(CreateRoleService.name);

  constructor(
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(IDENTITY_EVENT_EMITTER) private readonly emitter: IdentityEventEmitterPort,
  ) {}

  async execute(input: CreateRoleServiceInput): Promise<{ roleSlug: string }> {
    if (RESERVED_SYSTEM_SLUGS.has(input.roleName.toLowerCase())) {
      throw new RoleNameReservedError(input.roleName);
    }

    // D-04 (08.3): NON_DELEGATABLE guard MUST run before the BA call
    if (containsNonDelegatable(input.permission)) {
      throw new InsufficientPermissionsToMintError();
    }

    const result = await roleApi(this.auth).createOrgRole({
      body: {
        organizationId: input.tenantId,
        role: input.roleName,
        permission: input.permission,
      },
      headers: input.headers,
    });

    const tenantId = TenantId.parse(input.tenantId);
    try {
      await this.emitter.emit(
        buildEnvelope(
          IdentityRoleCreatedV1,
          {
            tenantId,
            roleSlug: result.role ?? input.roleName,
            permission: input.permission,
            actorUserId: input.actorUserId,
          },
          { tenantId },
        ),
      );
    } catch (err) {
      this.logger.error(
        { err, type: 'identity.role_created.v1', roleSlug: result.role ?? input.roleName },
        'Failed to emit identity.role_created.v1',
      );
    }

    return { roleSlug: result.role ?? input.roleName };
  }
}
