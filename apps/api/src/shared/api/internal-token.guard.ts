import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { constantTimeStringEqual } from './constant-time-equal';

const HEADER = 'x-internal-token';

/**
 * Guards `/internal/v1/*` routes during MVP-1 (RES-171).
 *
 * The seed CLI (RES-81) and any operator script must send a shared
 * `X-Internal-Token` header that matches `INTERNAL_API_TOKEN`. Real
 * IAM lands with the identity bounded context (RES-79); this token is
 * the deliberate placeholder until then. The token is required outside
 * `NODE_ENV=development`; in dev a missing-token request is allowed
 * for tooling ergonomics.
 *
 * Lives in `shared/` because three contexts (tenancy, identity, catalog)
 * gate `/internal/v1/*` routes with it — owning it under any single
 * context would force the others to import that context just for the
 * guard.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const expected = this.env.INTERNAL_API_TOKEN;
    if (!expected) {
      if (this.env.NODE_ENV === 'development') return true;
      throw new UnauthorizedException('Server is misconfigured: INTERNAL_API_TOKEN is not set.');
    }
    const presented = req.headers[HEADER];
    if (typeof presented === 'string' && constantTimeStringEqual(presented, expected)) {
      return true;
    }
    throw new UnauthorizedException('Invalid or missing internal token.');
  }
}
