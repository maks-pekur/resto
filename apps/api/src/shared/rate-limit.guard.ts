import { type CanActivate, type ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type RateLimitHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface RateLimitErrorBody {
  readonly status?: number;
  readonly statusCode?: number;
}

/**
 * Wraps the `@fastify/rate-limit` handler in a NestJS guard. Running the
 * limiter inside Nest's pipeline is the documented workaround for the
 * platform-fastify route-registration path that bypasses the plugin's
 * `onRoute` callback and `preHandler` hook (RES-120).
 *
 * The handler from `fastify.rateLimit()` either resolves (request within
 * budget) or throws a Fastify HTTP error whose body is the object built
 * by `errorResponseBuilder`. We translate the throw into a Nest
 * `HttpException(429)` so `ProblemDetailsFilter` formats the response as
 * `application/problem+json` like every other 4xx in the api.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly handler: RateLimitHandler) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    try {
      await this.handler(req, reply);
      return true;
    } catch (err) {
      const body = err as RateLimitErrorBody;
      const status = body.status ?? body.statusCode ?? 429;
      throw new HttpException(body as Record<string, unknown>, status);
    }
  }
}
