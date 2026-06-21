import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env.schema';
import {
  assertProdGuardrails,
  DUMMY_RESEND_API_KEY_LITERAL,
  ProdGuardrailsError,
} from '../../src/config/prod-guardrails';

const okProdValues = {
  S3_ENDPOINT: 'https://s3.amazonaws.com',
  S3_ACCESS_KEY: 'prod-access',
  S3_SECRET_KEY: 'prod-secret-value-32-chars-padding-aaa',
  AUDIT_ERASURE_SALT: 'production-erasure-salt-32-chars-padding',
  BETTER_AUTH_SECRET: 'production-better-auth-secret-32chars-min',
  INTERNAL_API_TOKEN: 'production-token-32-chars-padding-aaaaa',
  // D-01 / Skeptic HIGH-2 — guard added in Plan 03-02; the prod fixture
  // must carry a valid RESEND_API_KEY so the pre-existing dev-default
  // tests still exercise their original failure mode.
  RESEND_API_KEY: 're_real_production_key_xyz',
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
    // Defense-in-depth: the env.schema now applies a `.default(...)` for
    // S3_SECRET_KEY (RES-246), so the inferred type narrows to `string`.
    // assertProdGuardrails still defends against `undefined` for callers
    // that bypass the schema (cast through `as Env`, future refactors
    // that re-add optionality, etc.). The cast here is intentional.
    expect(() =>
      assertProdGuardrails(buildEnv({ S3_SECRET_KEY: undefined as unknown as string })),
    ).toThrow(/S3_SECRET_KEY/);
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
      expect((err as Error).message).toContain('deployment secrets');
    }
  });

  it('also fires in staging (treated like production)', () => {
    expect(() =>
      assertProdGuardrails(buildEnv({ NODE_ENV: 'staging', S3_SECRET_KEY: 'minio_dev_password' })),
    ).toThrow(/S3_SECRET_KEY/);
  });

  it('throws when INTERNAL_API_TOKEN is the dev placeholder', () => {
    expect(() =>
      assertProdGuardrails(buildEnv({ INTERNAL_API_TOKEN: 'internal_dev_token_change_me' })),
    ).toThrow(/INTERNAL_API_TOKEN/);
  });

  describe('API review 2026-06-15 BLOCK-4: critical-secret value checks', () => {
    it('throws when BETTER_AUTH_SECRET equals the in-code dev fallback', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({ BETTER_AUTH_SECRET: 'dev-only-better-auth-secret-32-chars-padding' }),
        ),
      ).toThrow(/BETTER_AUTH_SECRET/);
    });

    it('throws when BETTER_AUTH_SECRET equals the .env.example placeholder', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({ BETTER_AUTH_SECRET: 'local_dev_secret_replace_me_with_a_real_32_char_value' }),
        ),
      ).toThrow(/BETTER_AUTH_SECRET/);
    });

    it('throws when BETTER_AUTH_SECRET is unset in production', () => {
      expect(() =>
        assertProdGuardrails(buildEnv({ BETTER_AUTH_SECRET: undefined as unknown as string })),
      ).toThrow(/BETTER_AUTH_SECRET/);
    });

    it('throws when AUDIT_ERASURE_SALT equals the .env.example placeholder', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({
            AUDIT_ERASURE_SALT: 'local-dev-erasure-salt-replace-me-with-a-real-32-char-value',
          }),
        ),
      ).toThrow(/AUDIT_ERASURE_SALT/);
    });

    it('throws when a critical secret still contains a replace-me/change-me marker', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({ BETTER_AUTH_SECRET: 'almost-real-secret-but-replace_me-32chars' }),
        ),
      ).toThrow(/BETTER_AUTH_SECRET/);
    });
  });

  describe('D-01 / Skeptic HIGH-2: Resend assertion', () => {
    it('throws when RESEND_API_KEY is empty in staging', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({ NODE_ENV: 'staging', RESEND_API_KEY: undefined as unknown as string }),
        ),
      ).toThrow(/RESEND_API_KEY is required/);
    });

    it('throws when RESEND_API_KEY is empty string in production', () => {
      expect(() => assertProdGuardrails(buildEnv({ RESEND_API_KEY: '' }))).toThrow(
        /RESEND_API_KEY is required/,
      );
    });

    it('throws when RESEND_API_KEY is whitespace-only in production', () => {
      expect(() => assertProdGuardrails(buildEnv({ RESEND_API_KEY: '   ' }))).toThrow(
        /RESEND_API_KEY is required/,
      );
    });

    it('throws when RESEND_API_KEY equals the documented dummy literal in staging', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({ NODE_ENV: 'staging', RESEND_API_KEY: DUMMY_RESEND_API_KEY_LITERAL }),
        ),
      ).toThrow(/dummy literal/);
    });

    it('throws when RESEND_API_KEY equals the documented dummy literal in production', () => {
      expect(() =>
        assertProdGuardrails(buildEnv({ RESEND_API_KEY: DUMMY_RESEND_API_KEY_LITERAL })),
      ).toThrow(/dummy literal/);
    });

    it('passes when RESEND_API_KEY is a real value AND adapterName=resend', () => {
      expect(() => assertProdGuardrails(buildEnv(), { emailAdapterName: 'resend' })).not.toThrow();
    });

    it('throws when adapterName is mailhog-smtp in staging (wrong adapter wired in prod)', () => {
      expect(() =>
        assertProdGuardrails(buildEnv({ NODE_ENV: 'staging' }), {
          emailAdapterName: 'mailhog-smtp',
        }),
      ).toThrow(/email adapter must be ResendEmailAdapter/);
    });

    it('throws when adapterName is captured in production', () => {
      expect(() => assertProdGuardrails(buildEnv(), { emailAdapterName: 'captured' })).toThrow(
        /email adapter must be ResendEmailAdapter/,
      );
    });

    it('skips Resend checks in development regardless of RESEND_API_KEY value', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({ NODE_ENV: 'development', RESEND_API_KEY: DUMMY_RESEND_API_KEY_LITERAL }),
        ),
      ).not.toThrow();
    });

    it('skips Resend checks in test regardless of RESEND_API_KEY value', () => {
      expect(() =>
        assertProdGuardrails(
          buildEnv({ NODE_ENV: 'test', RESEND_API_KEY: undefined as unknown as string }),
        ),
      ).not.toThrow();
    });
  });
});
