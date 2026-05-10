import { timingSafeEqual } from 'node:crypto';
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

const HEADER = 'x-internal-token';
// Padding length for the constant-time compare buffer. Tokens are
// validated by the env schema as `min(16)` and `INTERNAL_API_TOKEN` is
// expected to be 32–64 bytes in production. 256 covers any reasonable
// future increase without truncating real tokens.
const COMPARE_PAD_LEN = 256;

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

/**
 * Constant-time string comparison. Both inputs are right-padded to a
 * fixed length so the underlying `timingSafeEqual` does not branch on
 * input length (the previous early `if (a.length !== b.length) return
 * false` leaked the secret length via timing). Length equality is then
 * re-asserted in code to keep correctness.
 *
 * Tokens longer than the pad length compare unequal — acceptable in
 * practice (env schema caps tokens far below the pad).
 */
const constantTimeStringEqual = (presented: string, expected: string): boolean => {
  if (presented.length > COMPARE_PAD_LEN || expected.length > COMPARE_PAD_LEN) return false;
  const a = Buffer.alloc(COMPARE_PAD_LEN, 0);
  const b = Buffer.alloc(COMPARE_PAD_LEN, 0);
  a.write(presented);
  b.write(expected);
  const equalBuffers = timingSafeEqual(a, b);
  return equalBuffers && presented.length === expected.length;
};
