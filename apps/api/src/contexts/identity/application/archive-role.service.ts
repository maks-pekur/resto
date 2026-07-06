import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { buildEnvelope, IdentityRoleDeletedV1 } from '@resto/events';
import { TenantId } from '@resto/domain';
import { member as memberTable, organizationRole } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { RoleNotFoundError, RoleOccupiedError } from '../domain/errors';
import { listActiveCustomRoles } from './list-active-custom-roles';
import {
  IDENTITY_EVENT_EMITTER,
  type IdentityEventEmitterPort,
} from './ports/identity-event-emitter.port';

export interface ArchiveRoleServiceInput {
  readonly roleSlug: string;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly headers: Headers;
}

@Injectable()
export class ArchiveRoleService {
  private readonly logger = new Logger(ArchiveRoleService.name);

  constructor(
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
    @Inject(IDENTITY_EVENT_EMITTER) private readonly emitter: IdentityEventEmitterPort,
  ) {}

  async execute(input: ArchiveRoleServiceInput): Promise<void> {
    const activeRoles = await listActiveCustomRoles(this.authDb, input.organizationId);
    if (!activeRoles.some((r) => r.role === input.roleSlug)) {
      throw new RoleNotFoundError(input.roleSlug);
    }

    // D-12 (08.3): exact CSV-split member count — LIKE would false-positive on slug substrings
    const memberRows = await this.authDb.db
      .select({ id: memberTable.id, role: memberTable.role })
      .from(memberTable)
      .where(eq(memberTable.organizationId, input.organizationId));

    const occupyingMembers = memberRows.filter((m) => {
      const parts = m.role.split(',').map((r) => r.trim());
      return parts.includes(input.roleSlug);
    });

    if (occupyingMembers.length > 0) {
      throw new RoleOccupiedError(input.roleSlug, occupyingMembers.length);
    }

    // D-12 (08.3): soft-archive; NEVER call auth.api.deleteOrgRole (hard-delete forbidden)
    await this.authDb.db
      .update(organizationRole)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(organizationRole.organizationId, input.organizationId),
          eq(organizationRole.role, input.roleSlug),
        ),
      );

    const tenantId = TenantId.parse(input.organizationId);
    try {
      await this.emitter.emit(
        buildEnvelope(
          IdentityRoleDeletedV1,
          { tenantId, roleSlug: input.roleSlug, actorUserId: input.actorUserId },
          { tenantId },
        ),
      );
    } catch (err) {
      this.logger.error(
        { err, type: 'identity.role_deleted.v1', roleSlug: input.roleSlug },
        'Failed to emit identity.role_deleted.v1',
      );
    }
  }
}
