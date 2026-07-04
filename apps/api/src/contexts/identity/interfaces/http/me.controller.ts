import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { BrandNeutral } from '../../../../shared/auth';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import type { Principal } from '../../domain/principal';

interface MeResponse {
  kind: 'operator' | 'customer' | 'anonymous';
  userId?: string;
  email?: string;
  tenantId?: string;
  baseRole?: 'owner' | 'admin' | 'staff';
  twoFactorEnabled?: boolean;
  activeBrandId?: string | null;
}

@ApiTags('identity')
@BrandNeutral()
@Controller('/v1/me')
export class MeController {
  @Get()
  me(@CurrentPrincipal() actor: Principal, @Req() req: FastifyRequest): MeResponse {
    if (actor.kind === 'operator') {
      return {
        kind: actor.kind,
        userId: actor.userId,
        email: actor.email,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
        ...(actor.baseRole ? { baseRole: actor.baseRole } : {}),
        ...(typeof actor.twoFactorEnabled === 'boolean'
          ? { twoFactorEnabled: actor.twoFactorEnabled }
          : {}),
        activeBrandId: req.activeBrandId ?? null,
      };
    }
    if (actor.kind === 'customer') {
      return {
        kind: actor.kind,
        userId: actor.userId,
        tenantId: actor.tenantId,
      };
    }
    return { kind: 'anonymous' };
  }
}
