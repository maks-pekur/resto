import { Controller, Get } from '@nestjs/common';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import type { Principal } from '../../domain/principal';

/**
 * Minimal "who am I" endpoint. Behind default-deny AuthGuard but with no
 * @Permissions metadata — any authenticated principal can hit it.
 *
 * Returns a tiny projection of the principal for smoke testing AND for
 * the admin web client to verify session validity on first paint.
 */
@Controller('/v1/me')
export class MeController {
  @Get()
  me(@CurrentPrincipal() actor: Principal) {
    if (actor.kind === 'operator') {
      return {
        kind: actor.kind,
        userId: actor.userId,
        email: actor.email,
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
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
