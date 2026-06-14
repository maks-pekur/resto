import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { BrandSlugRateLimitGuard } from '../../../src/contexts/identity/interfaces/http/guards/brand-slug-rate-limit.guard';
import type { Env } from '../../../src/config/env.schema';

const T0 = 1_700_000_000_000;
const WINDOW_MS = 60_000;

const ctxFor = (ip: string): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ ip }) }) }) as unknown as ExecutionContext;

const bucketCount = (guard: BrandSlugRateLimitGuard): number =>
  (guard as unknown as { buckets: Map<string, unknown> }).buckets.size;

const buildGuard = (cap: number): BrandSlugRateLimitGuard =>
  new BrandSlugRateLimitGuard({ RATE_LIMIT_BRAND_SLUG_CHECK_PER_MIN: cap } as unknown as Env);

describe('BrandSlugRateLimitGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to the cap within a window, then throws 429', () => {
    const guard = buildGuard(3);
    const ctx = ctxFor('1.1.1.1');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('resets the bucket once the window elapses', () => {
    const guard = buildGuard(1);
    const ctx = ctxFor('2.2.2.2');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);

    vi.setSystemTime(T0 + WINDOW_MS + 1);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('evicts expired buckets so the map does not grow unbounded', () => {
    const guard = buildGuard(5);
    for (let i = 0; i < 100; i++) {
      guard.canActivate(ctxFor(`10.0.0.${i.toString()}`));
    }
    expect(bucketCount(guard)).toBe(100);

    vi.setSystemTime(T0 + WINDOW_MS + 1);
    guard.canActivate(ctxFor('9.9.9.9'));

    expect(bucketCount(guard)).toBe(1);
  });
});
