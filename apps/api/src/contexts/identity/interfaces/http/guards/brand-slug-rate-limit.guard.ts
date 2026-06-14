import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ENV_TOKEN } from '../../../../../config/config.module';
import type { Env } from '../../../../../config/env.schema';

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;

@Injectable()
export class BrandSlugRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweepAt = 0;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  private sweep(now: number): void {
    if (now - this.lastSweepAt < WINDOW_MS) return;
    this.lastSweepAt = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const key = req.principal && 'userId' in req.principal ? req.principal.userId : `ip:${req.ip}`;
    const cap = this.env.RATE_LIMIT_BRAND_SLUG_CHECK_PER_MIN;
    const now = Date.now();
    this.sweep(now);
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    if (existing.count >= cap) {
      const ttlMs = existing.resetAt - now;
      throw new HttpException(
        {
          message: 'Too Many Requests',
          code: 'rate-limit-exceeded',
          detail: `Rate limit exceeded, retry in ${Math.ceil(ttlMs / 1000).toString()} seconds`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    existing.count += 1;
    return true;
  }
}
