import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Env } from '../../../src/config/env.schema';
import type { AuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';
import type { IdentityEventEmitterPort } from '../../../src/contexts/identity/application/ports/identity-event-emitter.port';

vi.mock('../../../src/contexts/identity/infrastructure/better-auth/auth.config', () => ({
  buildAuth: vi.fn(() => ({ kind: 'stub-auth' })),
}));

const { buildAuthFromEnv } = await import('../../../src/contexts/identity/identity-core.module');
const { buildAuth } =
  await import('../../../src/contexts/identity/infrastructure/better-auth/auth.config');

const envFor = (nodeEnv: Env['NODE_ENV']): Env =>
  ({
    NODE_ENV: nodeEnv,
    DEPLOYMENT_ENVIRONMENT: nodeEnv,
    LOG_LEVEL: 'info',
    API_PORT: 3000,
    DATABASE_URL: 'postgres://app:pw@localhost:5432/app',
    NATS_URL: 'nats://localhost:4222',
    NATS_STREAM: 'RESTO_EVENTS',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'b',
    S3_ACCESS_KEY: 'k',
    S3_SECRET_KEY: 's',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    OTEL_SERVICE_NAME: 'resto-api',
    CORS_ALLOWED_ORIGINS: [],
    PASSWORD_MIN_LENGTH: 12,
    PASSWORD_MAX_LENGTH: 128,
    RATE_LIMIT_PUBLIC_PER_MIN: 60,
    RATE_LIMIT_INTERNAL_PER_MIN: 10,
    RATE_LIMIT_AUTH_SIGNUP_PER_MIN: 5,
    RATE_LIMIT_BRAND_SLUG_CHECK_PER_MIN: 30,
    RATE_LIMIT_AUTH_RESET_PER_MIN: 5,
    RATE_LIMIT_AUTH_SIGNIN_PER_MIN: 10,
    RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN: 10,
    RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN: 5,
    REQUIRE_EMAIL_VERIFICATION: true,
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    BETTER_AUTH_BASE_URL: 'https://api.resto.app',
    BETTER_AUTH_DATABASE_URL: 'postgres://auth:pw@localhost:5432/auth',
    ADMIN_WEB_URL: 'https://admin.resto.app',
    AUTH_COOKIE_DOMAIN: '.resto.app',
    AUDIT_ERASURE_SALT: 'b'.repeat(32),
    TRUST_PROXY: '10.0.0.0/8',
  }) satisfies Env;

const stubAuthDb = {} as AuthDrizzle;
const stubEmitter: IdentityEventEmitterPort = { emit: vi.fn() };

describe('buildAuthFromEnv (RES-187)', () => {
  beforeEach(() => {
    vi.mocked(buildAuth).mockClear();
  });

  it('boots in NODE_ENV=staging without tripping the email-adapter gate', () => {
    expect(() => buildAuthFromEnv(stubAuthDb, envFor('staging'), stubEmitter)).not.toThrow();
  });

  it('boots in NODE_ENV=production without tripping the email-adapter gate', () => {
    expect(() => buildAuthFromEnv(stubAuthDb, envFor('production'), stubEmitter)).not.toThrow();
  });

  it('forwards a real sendVerificationEmail to buildAuth (not undefined)', () => {
    buildAuthFromEnv(stubAuthDb, envFor('staging'), stubEmitter);
    expect(buildAuth).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(buildAuth).mock.calls[0]?.[0];
    expect(opts?.sendVerificationEmail).toBeTypeOf('function');
  });
});
