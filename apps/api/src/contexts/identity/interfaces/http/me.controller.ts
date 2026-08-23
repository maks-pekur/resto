import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, eq } from 'drizzle-orm';
import { member as memberTable } from '@resto/db/schema';
import { LocationNeutral } from '../../../../shared/auth';
import { AUTH_DRIZZLE_TOKEN } from '../../identity.tokens';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';
import { computeEffectivePermissions } from '@resto/domain';
import { listActiveCustomRoles } from '../../application/list-active-custom-roles';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import type { Principal } from '../../domain/principal';

interface MeResponse {
  kind: 'operator' | 'customer' | 'anonymous';
  userId?: string;
  email?: string;
  tenantId?: string;
  baseRole?: 'owner' | 'admin' | 'staff';
  twoFactorEnabled?: boolean;
  permissions: Record<string, string[]>;
}

@ApiTags('identity')
@LocationNeutral()
@Controller('/v1/me')
export class MeController {
  constructor(@Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle) {}

  @Get()
  async me(@CurrentPrincipal() actor: Principal): Promise<MeResponse> {
    if (actor.kind === 'operator') {
      const permissions = actor.tenantId
        ? await this.resolvePermissions(actor.userId, actor.tenantId)
        : {};
      return {
        kind: actor.kind,
        userId: actor.userId,
        email: actor.email,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
        ...(actor.baseRole ? { baseRole: actor.baseRole } : {}),
        ...(typeof actor.twoFactorEnabled === 'boolean'
          ? { twoFactorEnabled: actor.twoFactorEnabled }
          : {}),
        permissions,
      };
    }
    if (actor.kind === 'customer') {
      return {
        kind: actor.kind,
        userId: actor.userId,
        tenantId: actor.tenantId,
        permissions: {},
      };
    }
    return { kind: 'anonymous', permissions: {} };
  }

  private async resolvePermissions(
    userId: string,
    tenantId: string,
  ): Promise<Record<string, string[]>> {
    const rows = await this.authDb.db
      .select({ role: memberTable.role })
      .from(memberTable)
      .where(and(eq(memberTable.userId, userId), eq(memberTable.tenantId, tenantId)))
      .limit(1);
    const memberRoleCsv = rows[0]?.role;
    if (!memberRoleCsv) return {};

    const activeRoles = await listActiveCustomRoles(this.authDb, tenantId);
    const customRoleLookup = (slug: string): Record<string, string[]> | null =>
      activeRoles.find((r) => r.role === slug)?.permission ?? null;

    const effective = computeEffectivePermissions(memberRoleCsv, customRoleLookup);
    const result: Record<string, string[]> = {};
    for (const [resource, actions] of Object.entries(effective)) {
      result[resource] = [...actions];
    }
    return result;
  }
}
