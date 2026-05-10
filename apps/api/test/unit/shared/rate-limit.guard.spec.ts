import { describe, expect, it, vi } from 'vitest';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { RateLimitGuard, type RateLimitHandler } from '../../../src/shared/rate-limit.guard';

const buildContext = (req = {}, reply = {}): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => reply }),
  }) as unknown as ExecutionContext;

describe('RateLimitGuard', () => {
  it('returns true when the underlying handler resolves (request within budget)', async () => {
    const handler: RateLimitHandler = vi.fn().mockResolvedValue(undefined);
    const guard = new RateLimitGuard(handler);
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rewraps a Fastify HTTP error from the handler as a NestJS HttpException', async () => {
    const fastifyErr = Object.assign(new Error('Too Many Requests'), {
      statusCode: 429,
      message: 'Too Many Requests',
      code: 'rate-limit-exceeded',
      detail: 'Rate limit exceeded, retry in 30 seconds',
    });
    const handler: RateLimitHandler = vi.fn().mockRejectedValue(fastifyErr);
    const guard = new RateLimitGuard(handler);

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(HttpException);

    const thrown = await guard.canActivate(buildContext()).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(HttpException);
    const httpErr = thrown as HttpException;
    expect(httpErr.getStatus()).toBe(429);
    // Body is forwarded so ProblemDetailsFilter can pick `code` + `detail`.
    const response = httpErr.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('rate-limit-exceeded');
    expect(response.detail).toContain('30 seconds');
  });

  it('honors a `status` field when `statusCode` is absent', async () => {
    const fastifyErr = Object.assign(new Error('Too Many Requests'), {
      status: 429,
      code: 'rate-limit-exceeded',
    });
    const handler: RateLimitHandler = vi.fn().mockRejectedValue(fastifyErr);
    const guard = new RateLimitGuard(handler);
    const thrown = (await guard
      .canActivate(buildContext())
      .catch((e: unknown) => e)) as HttpException;
    expect(thrown.getStatus()).toBe(429);
  });

  it('defaults to 429 when neither status nor statusCode is set on the rejection body', async () => {
    const fastifyErr = Object.assign(new Error('Too Many Requests'), {
      code: 'rate-limit-exceeded',
    });
    const handler: RateLimitHandler = vi.fn().mockRejectedValue(fastifyErr);
    const guard = new RateLimitGuard(handler);
    const thrown = (await guard
      .canActivate(buildContext())
      .catch((e: unknown) => e)) as HttpException;
    expect(thrown.getStatus()).toBe(429);
  });
});
