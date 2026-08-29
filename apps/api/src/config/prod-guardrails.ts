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
  MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/resto-dev',
  INTERNAL_API_TOKEN: 'internal_dev_token_change_me',
  STRIPE_CONNECT_RETURN_URL: 'http://localhost:3001/stripe/return',
  STRIPE_CONNECT_REFRESH_URL: 'http://localhost:3001/stripe/refresh',
} as const;

type GuardedKey = keyof typeof DEV_DEFAULTS;

/**
 * API review 2026-06-15 BLOCK-4: the two highest-value secrets were fail-open.
 * `BETTER_AUTH_SECRET` was not guarded at all (a known signing key forges any
 * session/bearer cross-tenant); `AUDIT_ERASURE_SALT` was guarded only against
 * the in-code dev fallback, not the *different* string shipped in `.env.example`
 * (a known salt makes GDPR anonymization reversible). Each key lists every value
 * that must fail-closed in prod: the in-code dev fallback AND the `.env.example`
 * placeholder. Keep in sync with `.env.example` and identity-core's
 * `DEV_BA_SECRET_FALLBACK`.
 */
const FORBIDDEN_SECRET_VALUES = {
  BETTER_AUTH_SECRET: [
    'dev-only-better-auth-secret-32-chars-padding',
    'local_dev_secret_replace_me_with_a_real_32_char_value',
  ],
  AUDIT_ERASURE_SALT: [
    'dev-only-erasure-salt-32-chars-padding',
    'local-dev-erasure-salt-replace-me-with-a-real-32-char-value',
  ],
} as const satisfies Partial<Record<keyof Env, readonly string[]>>;

type ForbiddenSecretKey = keyof typeof FORBIDDEN_SECRET_VALUES;

// Substring tell-tales of an unreplaced placeholder — catches a new placeholder
// even if the exact literal above drifts. Scoped to the critical secrets above
// to avoid false positives on unrelated env values.
const PLACEHOLDER_MARKERS = ['replace_me', 'replace-me', 'change_me', 'change-me'] as const;

/**
 * D-01 / Skeptic HIGH-2: `.env.example` ships a placeholder so dev tooling
 * works without a real Resend account. The literal MUST NEVER survive to
 * staging/production — `assertProdGuardrails` rejects it, and so does the
 * email-adapter factory (`email-adapter.factory.ts`) as defense-in-depth.
 */
export const DUMMY_RESEND_API_KEY_LITERAL = 're_test_dummy_for_ci_do_not_use_in_prod';

export const DUMMY_STRIPE_SECRET_KEY_LITERAL = 'sk_test_placeholder_do_not_use_in_prod';
export const DUMMY_STRIPE_WEBHOOK_SECRET_LITERAL = 'whsec_placeholder_do_not_use_in_prod';

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
  // API review 2026-06-15 BLOCK-4: value-check the two critical secrets the
  // exact-match loop above never covered.
  for (const key of Object.keys(FORBIDDEN_SECRET_VALUES) as ForbiddenSecretKey[]) {
    const value = env[key];
    if (value === undefined || value.trim().length === 0) {
      violations.push(`${key} is unset or blank in NODE_ENV=${env.NODE_ENV}`);
      continue;
    }
    if ((FORBIDDEN_SECRET_VALUES[key] as readonly string[]).includes(value)) {
      violations.push(`${key} equals a known dev fallback or shipped .env.example placeholder`);
      continue;
    }
    const lower = value.toLowerCase();
    if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) {
      violations.push(`${key} contains an unreplaced placeholder marker`);
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
  if (env.STRIPE_SECRET_KEY === undefined || env.STRIPE_SECRET_KEY.trim().length === 0) {
    violations.push(`STRIPE_SECRET_KEY is required in NODE_ENV=${env.NODE_ENV}`);
  } else if (env.STRIPE_SECRET_KEY === DUMMY_STRIPE_SECRET_KEY_LITERAL) {
    violations.push(
      `STRIPE_SECRET_KEY equals the documented dummy literal in NODE_ENV=${env.NODE_ENV}`,
    );
  } else {
    const lower = env.STRIPE_SECRET_KEY.toLowerCase();
    if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) {
      violations.push(`STRIPE_SECRET_KEY contains an unreplaced placeholder marker`);
    }
  }
  if (
    env.STRIPE_WEBHOOK_SECRET !== undefined &&
    env.STRIPE_WEBHOOK_SECRET === DUMMY_STRIPE_WEBHOOK_SECRET_LITERAL
  ) {
    violations.push(
      `STRIPE_WEBHOOK_SECRET equals the documented dummy literal in NODE_ENV=${env.NODE_ENV}`,
    );
  }
  if (violations.length > 0) throw new ProdGuardrailsError(violations);
};
