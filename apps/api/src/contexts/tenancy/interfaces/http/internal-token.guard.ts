import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';

const HEADER = 'x-internal-token';

/**
 * Guards `/internal/v1/*` routes during MVP-1.
 *
 * The seed CLI (RES-81) and any operator script must send a shared
 * `X-Internal-Token` header that matches `INTERNAL_API_TOKEN`. Real
 * IAM lands with the identity bounded context (RES-79); this token is
 * the deliberate placeholder until then. The token is required outside
 * `NODE_ENV=development`; in dev a missing-token request is allowed
 * for tooling ergonomics.
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
    if (typeof presented === 'string' && timingSafeEqual(presented, expected)) {
      return true;
    }
    throw new UnauthorizedException('Invalid or missing internal token.');
  }
}

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};
