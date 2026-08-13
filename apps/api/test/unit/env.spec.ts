import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../../src/config/env.schema';
import { assertProdGuardrails, ProdGuardrailsError } from '../../src/config/prod-guardrails';

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app@localhost:5432/resto',
  NATS_URL: 'nats://localhost:4222',
};

describe('loadEnv', () => {
  it('parses a minimal valid environment', () => {
    const env = loadEnv(baseEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(5001);
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
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: '10.0.0.0/8',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: 'prod-secret-replace-me',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
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

  it('rejects production boot when AUTH_COOKIE_DOMAIN is missing', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
    };
    expect(() => loadEnv(productionEnv)).toThrow(EnvValidationError);
    expect(() => loadEnv(productionEnv)).toThrow(/AUTH_COOKIE_DOMAIN/);
  });

  it('accepts a production environment with a properly-shaped AUTH_COOKIE_DOMAIN', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: '10.0.0.0/8',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: 'prod-secret-replace-me',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    };
    const env = loadEnv(productionEnv);
    expect(env.AUTH_COOKIE_DOMAIN).toBe('.resto.app');
    expect(env.TRUST_PROXY).toBe('10.0.0.0/8');
  });

  it('rejects an AUTH_COOKIE_DOMAIN without the leading dot', () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        AUTH_COOKIE_DOMAIN: 'resto.app',
      }),
    ).toThrow(/AUTH_COOKIE_DOMAIN/);
  });

  it('rejects production boot when TRUST_PROXY is missing', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: 'prod-secret-replace-me',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    };
    expect(() => loadEnv(productionEnv)).toThrow(/TRUST_PROXY/);
  });

  it('rejects TRUST_PROXY=true outside dev/test', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: 'true',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: 'prod-secret-replace-me',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    };
    expect(() => loadEnv(productionEnv)).toThrow(/unsafe/);
  });

  it('accepts TRUST_PROXY=true in development', () => {
    const env = loadEnv({ ...baseEnv, TRUST_PROXY: 'true' });
    expect(env.TRUST_PROXY).toBe('true');
  });

  it('applies S3_ENDPOINT default in production but assertProdGuardrails rejects it', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: '10.0.0.0/8',
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: 'prod-secret-replace-me',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    };
    const env = loadEnv(productionEnv);
    expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
    expect(() => assertProdGuardrails(env)).toThrow(ProdGuardrailsError);
    expect(() => assertProdGuardrails(env)).toThrow(/S3_ENDPOINT/);
  });

  it('applies S3_ACCESS_KEY default in production but assertProdGuardrails rejects it', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: '10.0.0.0/8',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_SECRET_KEY: 'prod-secret-replace-me',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    };
    const env = loadEnv(productionEnv);
    expect(env.S3_ACCESS_KEY).toBe('minio');
    expect(() => assertProdGuardrails(env)).toThrow(/S3_ACCESS_KEY/);
  });

  it('applies S3_SECRET_KEY default in production but assertProdGuardrails rejects it', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: '10.0.0.0/8',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_ACCESS_KEY: 'prod-access',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    };
    const env = loadEnv(productionEnv);
    expect(env.S3_SECRET_KEY).toBe('minio_dev_password');
    expect(() => assertProdGuardrails(env)).toThrow(/S3_SECRET_KEY/);
  });

  it('rejects production boot when INTERNAL_API_TOKEN is missing', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: '10.0.0.0/8',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: 'prod-secret-replace-me',
    };
    expect(() => loadEnv(productionEnv)).toThrow(/INTERNAL_API_TOKEN/);
  });

  it('rejects production boot when a required var is whitespace-only', () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      DATABASE_DIRECT_URL: 'postgres://direct@localhost:5432/resto',
      BETTER_AUTH_SECRET: 'production-secret-32-chars-padding-padding',
      BETTER_AUTH_BASE_URL: 'https://api.resto.app',
      BETTER_AUTH_DATABASE_URL: 'postgres://auth@localhost:5432/resto',
      ADMIN_WEB_URL: 'https://admin.resto.app',
      AUTH_COOKIE_DOMAIN: '.resto.app',
      AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
      TRUST_PROXY: '10.0.0.0/8',
      S3_ENDPOINT: 'https://s3.amazonaws.com',
      S3_ACCESS_KEY: 'prod-access',
      S3_SECRET_KEY: '   ',
      INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
    };
    expect(() => loadEnv(productionEnv)).toThrow(/S3_SECRET_KEY/);
  });

  it('applies S3 dev defaults when S3_* envs are unset', () => {
    const env = loadEnv(baseEnv);
    expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
    expect(env.S3_ACCESS_KEY).toBe('minio');
    expect(env.S3_SECRET_KEY).toBe('minio_dev_password');
    expect(env.S3_REGION).toBe('us-east-1');
    expect(env.S3_BUCKET).toBe('resto-dev');
  });

  it('accepts explicit S3 overrides when env vars are set', () => {
    const env = loadEnv({
      ...baseEnv,
      S3_ENDPOINT: 'https://r2.example.com',
      S3_ACCESS_KEY: 'real-key',
      S3_SECRET_KEY: 'real-secret',
    });
    expect(env.S3_ENDPOINT).toBe('https://r2.example.com');
    expect(env.S3_ACCESS_KEY).toBe('real-key');
    expect(env.S3_SECRET_KEY).toBe('real-secret');
  });
});
