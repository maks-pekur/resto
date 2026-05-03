import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../src/config/env.schema';
import { InternalTokenGuard } from '../../../src/contexts/tenancy/interfaces/http/internal-token.guard';

const baseEnv = (overrides: Partial<Env> = {}): Env => ({
  NODE_ENV: 'production',
  DEPLOYMENT_ENVIRONMENT: 'production',
  LOG_LEVEL: 'info',
  API_PORT: 3000,
  DATABASE_URL: 'postgres://app@localhost/db',
  NATS_URL: 'nats://localhost:4222',
  NATS_STREAM: 'RESTO_EVENTS',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'resto',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OTEL_SERVICE_NAME: 'resto-api',
  ...overrides,
});

const ctxWith = (headers: Record<string, string | undefined>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  }) as unknown as ExecutionContext;

const VALID_TOKEN = 'integration-test-token-1234567890';

describe('InternalTokenGuard', () => {
  describe('token unset', () => {
    it('passes in development (dev tooling ergonomics)', () => {
      const guard = new InternalTokenGuard(baseEnv({ NODE_ENV: 'development' }));
      expect(guard.canActivate(ctxWith({}))).toBe(true);
    });

    it('rejects in production with UnauthorizedException', () => {
      const guard = new InternalTokenGuard(baseEnv({ NODE_ENV: 'production' }));
      expect(() => guard.canActivate(ctxWith({}))).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctxWith({}))).toThrow(/misconfigured/i);
    });

    it('rejects in test', () => {
      const guard = new InternalTokenGuard(baseEnv({ NODE_ENV: 'test' }));
      expect(() => guard.canActivate(ctxWith({}))).toThrow(UnauthorizedException);
    });
  });

  describe('token set', () => {
    const env = baseEnv({ NODE_ENV: 'production', INTERNAL_API_TOKEN: VALID_TOKEN });

    it('passes when the presented header matches', () => {
      const guard = new InternalTokenGuard(env);
      expect(guard.canActivate(ctxWith({ 'x-internal-token': VALID_TOKEN }))).toBe(true);
    });

    it('rejects when the header is missing', () => {
      const guard = new InternalTokenGuard(env);
      expect(() => guard.canActivate(ctxWith({}))).toThrow(UnauthorizedException);
    });

    it('rejects when the header value is wrong but the same length', () => {
      const wrong = 'X'.repeat(VALID_TOKEN.length);
      const guard = new InternalTokenGuard(env);
      expect(() => guard.canActivate(ctxWith({ 'x-internal-token': wrong }))).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when the header value is the wrong length (timing-safe early return)', () => {
      const guard = new InternalTokenGuard(env);
      expect(() => guard.canActivate(ctxWith({ 'x-internal-token': 'short' }))).toThrow(
        UnauthorizedException,
      );
    });
  });

  it('does not consult process.env (uses injected Env only)', () => {
    // Sentinel: even if process.env contains a valid-looking token, the
    // guard must read from `this.env` so Zod validation is the source of
    // truth.
    const original = process.env.INTERNAL_API_TOKEN;
    process.env.INTERNAL_API_TOKEN = VALID_TOKEN;
    try {
      const guard = new InternalTokenGuard(baseEnv({ NODE_ENV: 'production' }));
      expect(() => guard.canActivate(ctxWith({ 'x-internal-token': VALID_TOKEN }))).toThrow(
        UnauthorizedException,
      );
    } finally {
      if (original === undefined) delete process.env.INTERNAL_API_TOKEN;
      else process.env.INTERNAL_API_TOKEN = original;
    }
  });
});
