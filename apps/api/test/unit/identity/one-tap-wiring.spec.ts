import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Env } from '../../../src/config/env.schema';

vi.mock('../../../src/contexts/identity/infrastructure/better-auth/auth.config', () => ({
  buildAuth: vi.fn(() => ({ kind: 'stub-auth' })),
}));

const { buildAuthFromEnv } = await import('../../../src/contexts/identity/identity-core.module');
const { buildAuth } =
  await import('../../../src/contexts/identity/infrastructure/better-auth/auth.config');

interface BuiltOpts {
  trustedOrigins?: string[];
  google?: { clientId: string; clientSecret: string };
}

const baseEnv = {
  NODE_ENV: 'development',
  DEPLOYMENT_ENVIRONMENT: 'development',
  LOG_LEVEL: 'info',
  API_PORT: 3000,
  DATABASE_URL: 'postgres://app:pw@localhost:5432/app',
  NATS_URL: 'nats://localhost:4222',
  NATS_STREAM: 'RESTO_EVENTS',
  S3_ENDPOINT: 'http://localhost:9000',
  MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/resto-dev',
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
  RATE_LIMIT_TENANT_SLUG_CHECK_PER_MIN: 30,
  RATE_LIMIT_AUTH_RESET_PER_MIN: 5,
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_BASE_URL: 'https://resto.app',
  ADMIN_WEB_URL: 'https://resto.app/admin',
} as unknown as Env;

const envWith = (over: Partial<Record<string, unknown>>): Env => ({ ...baseEnv, ...over });

const stub = () => ({}) as never;

const optsFor = (env: Env): BuiltOpts => {
  buildAuthFromEnv(stub(), env, stub(), stub(), stub());
  const call = vi.mocked(buildAuth).mock.calls.at(-1);
  return (call?.[0] ?? {}) as BuiltOpts;
};

beforeEach(() => {
  vi.mocked(buildAuth).mockClear();
});

describe('tenant origins reach Better Auth', () => {
  it('trusts every tenant host under the apex, one label deep', () => {
    const opts = optsFor(envWith({ PUBLIC_APEX_DOMAIN: 'resto.app' }));
    expect(opts.trustedOrigins).toContain('https://*.resto.app');
  });

  it('adds no wildcard when there is no apex to build one from', () => {
    const opts = optsFor(envWith({ PUBLIC_APEX_DOMAIN: undefined }));
    expect(opts.trustedOrigins?.some((o) => o.includes('*'))).toBe(false);
  });

  it('keeps the admin origin alongside it', () => {
    const opts = optsFor(envWith({ PUBLIC_APEX_DOMAIN: 'resto.app' }));
    expect(opts.trustedOrigins).toContain('https://resto.app');
  });
});

describe('Google credentials reach Better Auth, and one-tap borrows them', () => {
  it('passes both credentials through when both are set', () => {
    const opts = optsFor(
      envWith({ GOOGLE_CLIENT_ID: 'client-123', GOOGLE_CLIENT_SECRET: 'secret-abc' }),
    );
    expect(opts.google).toEqual({ clientId: 'client-123', clientSecret: 'secret-abc' });
  });

  it('passes nothing when only one is set, so a half-configured provider never mounts', () => {
    expect(optsFor(envWith({ GOOGLE_CLIENT_ID: 'client-123' })).google).toBeUndefined();
    expect(optsFor(envWith({ GOOGLE_CLIENT_SECRET: 'secret-abc' })).google).toBeUndefined();
  });

  it('passes nothing when neither is set, so the app boots without Google at all', () => {
    expect(optsFor(baseEnv).google).toBeUndefined();
  });
});
