import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env.schema';
import { assertProdGuardrails, ProdGuardrailsError } from '../../src/config/prod-guardrails';

const okProdValues = {
  S3_ENDPOINT: 'https://s3.amazonaws.com',
  S3_ACCESS_KEY: 'prod-access',
  S3_SECRET_KEY: 'prod-secret-replace-me',
  AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
} as const;

const buildEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'production',
    ...okProdValues,
    ...overrides,
  }) as Env;

describe('assertProdGuardrails', () => {
  it('returns silently in development regardless of values', () => {
    const env = buildEnv({
      NODE_ENV: 'development',
      S3_SECRET_KEY: 'minio_dev_password',
      AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
    });
    expect(() => assertProdGuardrails(env)).not.toThrow();
  });

  it('returns silently in test regardless of values', () => {
    const env = buildEnv({
      NODE_ENV: 'test',
      S3_SECRET_KEY: 'minio_dev_password',
    });
    expect(() => assertProdGuardrails(env)).not.toThrow();
  });

  it('passes when all prod values are set to real secrets', () => {
    expect(() => assertProdGuardrails(buildEnv())).not.toThrow();
  });

  it('throws when S3_SECRET_KEY is the dev default in production', () => {
    try {
      assertProdGuardrails(buildEnv({ S3_SECRET_KEY: 'minio_dev_password' }));
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProdGuardrailsError);
      expect((err as Error).message).toMatch(/S3_SECRET_KEY/);
    }
  });

  it('throws when S3_ACCESS_KEY is the dev default', () => {
    expect(() => assertProdGuardrails(buildEnv({ S3_ACCESS_KEY: 'minio' }))).toThrow(
      /S3_ACCESS_KEY/,
    );
  });

  it('throws when S3_ENDPOINT is the dev default', () => {
    expect(() => assertProdGuardrails(buildEnv({ S3_ENDPOINT: 'http://localhost:9000' }))).toThrow(
      /S3_ENDPOINT/,
    );
  });

  it('throws when AUDIT_ERASURE_SALT is the dev fallback constant', () => {
    expect(() =>
      assertProdGuardrails(
        buildEnv({ AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding' }),
      ),
    ).toThrow(/AUDIT_ERASURE_SALT/);
  });

  it('throws when a value is undefined in production', () => {
    expect(() => assertProdGuardrails(buildEnv({ S3_SECRET_KEY: undefined }))).toThrow(
      /S3_SECRET_KEY/,
    );
  });

  it('reports every violation in a single error', () => {
    try {
      assertProdGuardrails(
        buildEnv({
          S3_SECRET_KEY: 'minio_dev_password',
          AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
        }),
      );
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProdGuardrailsError);
      const violations = (err as ProdGuardrailsError).violations;
      expect(violations).toHaveLength(2);
      expect(violations.join(' ')).toMatch(/S3_SECRET_KEY/);
      expect(violations.join(' ')).toMatch(/AUDIT_ERASURE_SALT/);
    }
  });

  it('also fires in staging (treated like production)', () => {
    expect(() =>
      assertProdGuardrails(buildEnv({ NODE_ENV: 'staging', S3_SECRET_KEY: 'minio_dev_password' })),
    ).toThrow(/S3_SECRET_KEY/);
  });
});
