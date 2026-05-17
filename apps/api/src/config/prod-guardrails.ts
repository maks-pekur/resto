import type { Env } from './env.schema';

/**
 * Boot-time defense-in-depth check for ADR-0020 Invariant I-3.
 *
 * env.schema's `superRefine` SHOULD already reject each of these
 * conditions; this assertion fires if a future refactor weakens the
 * schema, OR if a deploy hands the API a "real" env var whose value
 * happens to equal the local dev default (the schema cannot tell those
 * apart — it only sees a non-empty string).
 *
 * Mirrors the schema conditions intentionally — when the schema's
 * superRefine moves, this moves too.
 */
const DEV_DEFAULTS = {
  S3_SECRET_KEY: 'minio_dev_password',
  S3_ACCESS_KEY: 'minio',
  S3_ENDPOINT: 'http://localhost:9000',
  AUDIT_ERASURE_SALT: 'dev-only-erasure-salt-32-chars-padding',
  INTERNAL_API_TOKEN: 'internal_dev_token_change_me',
} as const;

type GuardedKey = keyof typeof DEV_DEFAULTS;

export class ProdGuardrailsError extends Error {
  constructor(public readonly violations: readonly string[]) {
    super(`prod-guardrails: refusing to start: ${violations.join('; ')}`);
    this.name = 'ProdGuardrailsError';
  }
}

export const assertProdGuardrails = (env: Env): void => {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return;
  const violations: string[] = [];
  for (const key of Object.keys(DEV_DEFAULTS) as GuardedKey[]) {
    const value = env[key];
    const devDefault = DEV_DEFAULTS[key];
    if (value === undefined || value === devDefault) {
      violations.push(`${key} is unset or equals the dev default`);
    }
  }
  if (violations.length > 0) throw new ProdGuardrailsError(violations);
};
