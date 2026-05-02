import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../../src/config/env.schema';

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app@localhost:5432/resto',
  NATS_URL: 'nats://localhost:4222',
};

describe('loadEnv', () => {
  it('parses a minimal valid environment', () => {
    const env = loadEnv(baseEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.NATS_STREAM).toBe('RESTO_EVENTS');
  });

  it('coerces API_PORT from a string', () => {
    const env = loadEnv({ ...baseEnv, API_PORT: '8080' });
    expect(env.API_PORT).toBe(8080);
  });

  it('throws when DATABASE_URL is missing', () => {
    const incomplete = { ...baseEnv };
    delete incomplete.DATABASE_URL;
    expect(() => loadEnv(incomplete)).toThrow(EnvValidationError);
    expect(() => loadEnv(incomplete)).toThrow(/DATABASE_URL/);
  });

  it('throws when NATS_URL is missing', () => {
    const incomplete = { ...baseEnv };
    delete incomplete.NATS_URL;
    expect(() => loadEnv(incomplete)).toThrow(EnvValidationError);
    expect(() => loadEnv(incomplete)).toThrow(/NATS_URL/);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => loadEnv({ ...baseEnv, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('rejects TENANT_DEV_FALLBACK_SLUG outside development', () => {
    // In production, BA env vars are also required — supply them so the
    // only validation issue is TENANT_DEV_FALLBACK_SLUG itself.
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      TENANT_DEV_FALLBACK_SLUG: 'demo',
    };
    expect(() => loadEnv(productionEnv)).toThrow(/development/);
  });

  it('accepts TENANT_DEV_FALLBACK_SLUG in development', () => {
    const env = loadEnv({ ...baseEnv, NODE_ENV: 'development', TENANT_DEV_FALLBACK_SLUG: 'demo' });
    expect(env.TENANT_DEV_FALLBACK_SLUG).toBe('demo');
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() => loadEnv({ ...baseEnv, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });
});
