import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiTags } from '@nestjs/swagger';
import { LocationNeutral } from '../../../../shared/auth';
import { AUTH_DRIZZLE_TOKEN } from '../../identity.tokens';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';
import { resolveEffectivePermissions } from '../../application/location-scope/resolve-effective-permissions';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from '../../application/ports/member-location-scope-reader.port';
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
  constructor(
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly scopeReader: MemberLocationScopeReader,
  ) {}

  @Get()
  async me(@CurrentPrincipal() actor: Principal, @Req() req: FastifyRequest): Promise<MeResponse> {
    if (actor.kind === 'operator') {
      // Same union the PermissionsGuard applies. Reporting anything narrower would make the admin
      // hide screens the server would in fact serve.
      const activeLocationId = (req as FastifyRequest & { activeLocationId?: string | null })
        .activeLocationId;
      const permissions = actor.tenantId
        ? await resolveEffectivePermissions(this.authDb, this.scopeReader, {
            userId: actor.userId,
            tenantId: actor.tenantId,
            baseRole: actor.baseRole,
            activeLocationId,
          })
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
}
