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

/**
 * D-01 / Skeptic HIGH-2: `.env.example` ships a placeholder so dev tooling
 * works without a real Resend account. The literal MUST NEVER survive to
 * staging/production — `assertProdGuardrails` rejects it, and so does the
 * email-adapter factory (`email-adapter.factory.ts`) as defense-in-depth.
 */
export const DUMMY_RESEND_API_KEY_LITERAL = 're_test_dummy_for_ci_do_not_use_in_prod';

export class ProdGuardrailsError extends Error {
  constructor(public readonly violations: readonly string[]) {
    super(
      `prod-guardrails: refusing to start: ${violations.join('; ')}. ` +
        'Set real values in your deployment secrets (Vault / 1Password ' +
        'Connect / cloud secret manager) and redeploy. Do NOT bypass by ' +
        'setting NODE_ENV=development.',
    );
    this.name = 'ProdGuardrailsError';
  }
}

/**
 * D-01 / Skeptic HIGH-2: extended guard contract.
 *
 * In addition to the ADR-0020 I-3 dev-default check (S3 / audit salt /
 * internal token), this also rejects boot in staging/production when:
 *   - `RESEND_API_KEY` is empty / whitespace-only / undefined.
 *   - `RESEND_API_KEY` equals the documented dummy literal that ships in
 *     `.env.example`.
 *   - `emailAdapterName` (when supplied — wired adapter's `adapterName`
 *     getter) is not `'resend'`. Catches "MailHog accidentally wired in
 *     prod" via a swapped env var.
 *
 * `emailAdapterName` is optional so main.ts can call this BEFORE the
 * NestJS app is constructed (env-only check) AND a second time AFTER the
 * app context exposes the wired adapter (extended check — see Plan 03-02
 * Task 4).
 */
export const assertProdGuardrails = (
  env: Env,
  options: { readonly emailAdapterName?: string } = {},
): void => {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return;
  const violations: string[] = [];
  for (const key of Object.keys(DEV_DEFAULTS) as GuardedKey[]) {
    const value = env[key];
    const devDefault = DEV_DEFAULTS[key];
    if (value === undefined || value === devDefault) {
      violations.push(`${key} is unset or equals the dev default`);
    }
  }
  // D-01 / Skeptic HIGH-2.
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY.trim().length === 0) {
    violations.push(`RESEND_API_KEY is required in NODE_ENV=${env.NODE_ENV}`);
  } else if (env.RESEND_API_KEY === DUMMY_RESEND_API_KEY_LITERAL) {
    violations.push(
      `RESEND_API_KEY equals the documented dummy literal in NODE_ENV=${env.NODE_ENV}`,
    );
  }
  if (options.emailAdapterName !== undefined && options.emailAdapterName !== 'resend') {
    violations.push(
      `email adapter must be ResendEmailAdapter in NODE_ENV=${env.NODE_ENV}, got ${options.emailAdapterName}`,
    );
  }
  if (violations.length > 0) throw new ProdGuardrailsError(violations);
};
