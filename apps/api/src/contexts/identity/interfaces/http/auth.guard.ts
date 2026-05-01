import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getTenantContext } from '@resto/db';
import type { FastifyRequest } from 'fastify';
import { InvalidTokenError, TenantMismatchError } from '../../domain/errors';
import type { Principal } from '../../domain/principal';
import { JWT_VERIFIER, type JwtVerifier } from '../../domain/ports';
import { IS_PUBLIC_KEY } from './public.decorator';

const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * Validates the inbound bearer token, projects it onto a `Principal`,
 * and pins the resolved tenant context: a token issued for tenant A
 * MUST NOT operate on tenant B even if the request hits tenant B's
 * subdomain. Tenant-context resolution is the tenancy middleware's job;
 * this guard only enforces the match.
 *
 * Routes marked `@Public()` bypass authentication entirely (health,
 * OpenAPI). Otherwise: missing/invalid token → 401; tenant mismatch
 * → 403.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & { principal?: Principal }>();
    const auth = req.headers.authorization;
    if (typeof auth !== 'string' || !BEARER_PREFIX.test(auth)) {
      throw new UnauthorizedException('Missing or malformed Authorization header.');
    }
    const token = auth.replace(BEARER_PREFIX, '').trim();
    if (token.length === 0) {
      throw new UnauthorizedException('Empty bearer token.');
    }

    let principal: Principal;
    try {
      principal = await this.verifier.verify(token);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }

    const resolved = getTenantContext();
    if (resolved && resolved.tenantId !== principal.tenantId) {
      throw new ForbiddenException(
        new TenantMismatchError(principal.tenantId, resolved.tenantId).message,
      );
    }

    req.principal = principal;
    return true;
  }
}
