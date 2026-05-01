import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '../../domain/principal';

/**
 * Resolve the authenticated principal from the request. The AuthGuard
 * attaches it as `request.principal`; using the decorator gives
 * controllers a typed handle without poking at the raw request.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { principal?: Principal }>();
    return req.principal;
  },
);
