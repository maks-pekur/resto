import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import type { Principal } from '../../domain/principal';

interface MeResponse {
  kind: 'operator' | 'customer' | 'anonymous';
  userId?: string;
  email?: string;
  tenantId?: string;
  baseRole?: 'owner' | 'admin' | 'staff';
}

/**
 * Minimal "who am I" endpoint. Behind default-deny AuthGuard but with no
 * @Permissions metadata — any authenticated principal can hit it.
 *
 * Returns a tiny projection of the principal for smoke testing AND for
 * the admin web client to verify session validity on first paint.
 *
 * Response shape is a discriminated union (operator/customer/anonymous);
 * not modeled as a `createZodDto` because nestjs-zod's bridge requires
 * an object schema. The endpoint is documented as a plain JSON return
 * and the admin client narrows by `kind`.
 */
@ApiTags('identity')
@Controller('/v1/me')
export class MeController {
  @Get()
  me(@CurrentPrincipal() actor: Principal): MeResponse {
    if (actor.kind === 'operator') {
      return {
        kind: actor.kind,
        userId: actor.userId,
        email: actor.email,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
        ...(actor.baseRole ? { baseRole: actor.baseRole } : {}),
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
