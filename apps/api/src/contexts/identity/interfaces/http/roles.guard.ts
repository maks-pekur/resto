import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../../domain/principal';
import type { Role } from '../../domain/role';
import { InsufficientRoleError } from '../../domain/errors';
import { ROLES_KEY } from './roles.decorator';
import { REQUIRES_LOCATION_KEY } from './requires-location.decorator';

/**
 * Enforces role membership and (optionally) ABAC location scoping. Runs
 * AFTER `AuthGuard` — depends on `request.principal`. Empty role list
 * means "any authenticated principal".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const locationParamName = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_LOCATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if ((!required || required.length === 0) && !locationParamName) {
      return true;
    }

    const req = context.switchToHttp().getRequest<FastifyRequest & { principal?: Principal }>();
    const principal = req.principal;
    if (!principal) {
      throw new UnauthorizedException(
        'Roles guard requires authentication; ensure AuthGuard runs before RolesGuard.',
      );
    }

    if (required && required.length > 0) {
      const allowed = required.some((role) => principal.roles.includes(role));
      if (!allowed) {
        throw new ForbiddenException(new InsufficientRoleError(required, principal.roles).message);
      }
    }

    if (locationParamName) {
      const params = (req.params ?? {}) as Record<string, string | undefined>;
      const requested = params[locationParamName];
      if (!requested) {
        throw new ForbiddenException(
          `Route requires location id at param "${locationParamName}", but none was supplied.`,
        );
      }
      const scoped = principal.locations;
      if (scoped && scoped.length > 0 && !scoped.includes(requested)) {
        throw new ForbiddenException(`Principal is not scoped to location "${requested}".`);
      }
    }

    return true;
  }
}
