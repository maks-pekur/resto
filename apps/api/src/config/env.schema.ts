import { z } from 'zod';

/**
 * D-21/D-24: the wildcard's `*` must occupy the ENTIRE leftmost hostname
 * label, with at least two literal labels after it. Rejects a wildcard
 * that can swallow a label boundary (`https://*resto.app` matches any
 * `*resto.app`-suffixed host; `https://*.app` has nothing anchoring it to
 * `resto.app` at all) — the origin-spoofing hazard this field exists to
 * prevent.
 */
const isValidAdminOriginWildcard = (value: string): boolean => {
  let hostname: string;
  try {
    hostname = new URL(value).hostname;
  } catch {
    return false;
  }
  const [first, ...rest] = hostname.split('.');
  return (
    first === '*' &&
    rest.length >= 2 &&
    rest.every((label) => label.length > 0 && !label.includes('*'))
  );
};

/**
 * Environment schema for `apps/api`.
 *
 * Every value the app reads at boot lives here. Anything the app needs
 * but is not in this schema is a layering bug — environment access goes
 * through `ConfigService`, not `process.env` directly, except in the
 * telemetry bootstrap (which runs before the Nest container exists).
 *
 * Required fields fail fast at boot — `loadEnv` throws on first invalid
 * input, which is what we want: an api with a missing DATABASE_URL
 * cannot serve traffic, no matter what guarantees the deploy claims.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    DEPLOYMENT_ENVIRONMENT: z.string().default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    API_PORT: z.coerce.number().int().positive().default(5001),

    /** Runtime-role URL — non-superuser, NOBYPASSRLS (RES-83). */
    DATABASE_URL: z.string().url(),
    /** Schema-owner URL — used by migrations only, never by the runtime app. */
    DATABASE_ADMIN_URL: z.string().url().optional(),
    /**
     * Unpooled, session-pinned Postgres connection for the outbox
     * dispatcher's advisory lock (D-05 / Neon PgBouncer transaction-mode
     * footgun). A session-level advisory lock (`pg_try_advisory_lock`)
     * must live on a dedicated backend that is never returned to a pooler
     * between queries. Required outside dev/test (enforced by
     * superRefine); in dev falls back to DATABASE_URL so the local docker
     * stack needs no extra env var.
     */
    DATABASE_DIRECT_URL: z.string().url().optional(),
    /**
     * Sentry Cloud DSN for unhandled-exception capture (G-04). Optional
     * at all times — Sentry is observability, not a correctness gate.
     * When absent the init is a silent no-op; api, website, and admin all
     * boot normally without it.
     */
    SENTRY_DSN: z.string().url().optional(),
    /**
     * Milliseconds since last successful dispatch before /readyz marks the
     * outbox leader as stalled (G-03). Default 30s — aligns with PAY-12's
     * ">30s stall" SLA (SC-5 ROADMAP). Operators may raise for bursty queues.
     */
    OUTBOX_STALL_THRESHOLD_MS: z.coerce.number().int().positive().default(30_000),

    NATS_URL: z.string().url(),
    /** JetStream stream the app's events flow through. */
    NATS_STREAM: z.string().default('RESTO_EVENTS'),
    /**
     * NATS username/password (RES-178). Optional in dev/test where the
     * broker runs without auth; production deploys SHOULD set both via
     * Vault and the connect call passes them through to `nats.connect`.
     */
    NATS_USERNAME: z.string().optional(),
    NATS_PASSWORD: z.string().optional(),

    /**
     * Shared secret for `/internal/v1/*` routes — the only auth in MVP-1
     * (ADR-0012 deferred per-user IAM to MVP-2). Required outside dev;
     * `InternalTokenGuard` allows unauthenticated requests in development
     * for tooling ergonomics.
     */
    INTERNAL_API_TOKEN: z.string().min(16).optional(),

    /**
     * 32+ char secret signing BA cookies and tokens. Required outside dev
     * (enforced by superRefine below). Rotated per environment via Vault.
     */
    BETTER_AUTH_SECRET: z.string().min(32).optional(),

    /**
     * Public base URL of the api (used by BA for cookie scope and email
     * link generation). Required outside dev. e.g. https://api.resto.app
     */
    BETTER_AUTH_BASE_URL: z.string().url().optional(),

    /**
     * Postgres connection string for BA's drizzle client. Connects under
     * `resto_auth` (BYPASSRLS). Distinct from DATABASE_URL (which is
     * `resto_app` NOBYPASSRLS). Required outside dev.
     */
    BETTER_AUTH_DATABASE_URL: z.string().url().optional(),

    /**
     * Public URL of the admin web app — used as link target in invitation
     * and password-reset emails. Required outside dev. This is the apex
     * host (pre-tenant sign-in/signup); per-tenant traffic is
     * ADMIN_WEB_ORIGIN_WILDCARD below (D-21).
     */
    ADMIN_WEB_URL: z.string().url().optional(),

    /**
     * Wildcard trusted origin for per-tenant admin hosts (D-21,
     * D-24). Optional — absent means only the apex ADMIN_WEB_URL is
     * trusted. e.g. `https://*.admin.resto.app`; local dev
     * `http://*.admin.localhost:4000`.
     */
    ADMIN_WEB_ORIGIN_WILDCARD: z
      .string()
      .url()
      .optional()
      .refine((value) => value === undefined || isValidAdminOriginWildcard(value), {
        message:
          'ADMIN_WEB_ORIGIN_WILDCARD must have "*" as the entire leftmost hostname label, followed by at least two literal labels (e.g. https://*.admin.resto.app)',
      }),

    WEBSITE_PUBLIC_URL: z.string().url().optional(),

    /**
     * Cookie domain for BA sessions. `.admin.resto.app` in production,
     * `.admin.localhost` in dev (D-21/D-24) — scoping to the bare apex would
     * deliver the operator session cookie to the guest menu
     * (`<slug>.menu.resto.app`) and the public site (`<slug>.resto.app`) too.
     * Dev needs the leading-dot value for the same reason production does:
     * every sign-in hops from `admin.<domain>` to `<slug>.admin.<domain>`, and
     * a host-only cookie does not survive that hop.
     */
    AUTH_COOKIE_DOMAIN: z.string().optional(),

    /**
     * The platform's own apex, without scheme or port — `resto.app` in
     * production, `localhost` in dev. Gates the `<slug>.<apex>` guest host
     * (the restaurant's public site) so an unregistered custom domain whose
     * first label happens to match a tenant slug cannot resolve. Unset means
     * only `<slug>.menu.<domain>` resolves on the guest path.
     */
    PUBLIC_APEX_DOMAIN: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .refine((v) => v === undefined || /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(v), {
        message: 'PUBLIC_APEX_DOMAIN must be a bare hostname (no scheme, no port, no path)',
      }),

    /**
     * Salt used by the audit_log PII anonymisation step on tenant erasure
     * (RES-138). Required outside dev/test (enforced by superRefine);
     * minimum 32 chars and immutable post-deploy — rotating it severs the
     * link between historic anonymised IDs and any future anonymised IDs.
     */
    AUDIT_ERASURE_SALT: z.string().min(32).optional(),

    /**
     * S3-compatible bucket for menu images (R2 / AWS S3 / MinIO in dev).
     *
     * Defaults match `prod-guardrails.DEV_DEFAULTS` so dev/test boot
     * without env-seed. `assertProdGuardrails` (boot-time, non-dev/test)
     * is the prod-rejection layer for these three keys — it throws
     * `ProdGuardrailsError` if any of the values reaching the running
     * process equals the dev default. ADR-0020 I-3.
     *
     * The `.refine` rejects whitespace-only values (e.g. `'   '`).
     * `.default(...)` only applies when the input is `undefined`; a
     * whitespace string is "set" from Zod's perspective, so without
     * `.refine` it would bypass the default and reach the adapter.
     */
    S3_ENDPOINT: z
      .string()
      .url()
      .default('http://localhost:9000')
      .refine((s) => s.trim().length > 0, 'S3_ENDPOINT must not be whitespace-only'),
    /**
     * Public origin (CDN or bucket) that serves published menu photos. Those
     * objects are copied to a world-readable prefix on publish and addressed by a
     * stable URL — a published menu is public by definition, and signing it only
     * bought expiring links no cache could reuse.
     */
    MEDIA_PUBLIC_BASE_URL: z
      .string()
      .url()
      .default('http://localhost:9000/resto-dev')
      .refine((s) => s.trim().length > 0, 'MEDIA_PUBLIC_BASE_URL must not be whitespace-only'),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('resto-dev'),
    S3_ACCESS_KEY: z
      .string()
      .default('minio')
      .refine((s) => s.trim().length > 0, 'S3_ACCESS_KEY must not be whitespace-only'),
    S3_SECRET_KEY: z
      .string()
      .default('minio_dev_password')
      .refine((s) => s.trim().length > 0, 'S3_SECRET_KEY must not be whitespace-only'),

    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
    OTEL_SERVICE_NAME: z.string().default('resto-api'),

    /**
     * Dev-only escape hatch. When set, requests on the api root domain
     * (no tenant subdomain) are pinned to this slug instead of running
     * tenant-less. Refused outside `NODE_ENV=development`.
     */
    TENANT_DEV_FALLBACK_SLUG: z.string().optional(),

    /**
     * CORS allowlist (RES-99). Comma-separated patterns; each entry is
     * either an exact origin (`https://admin.resto.app`) or a pattern
     * with `*` as a single subdomain segment (`https://*.menu.resto.app`).
     * Empty list disables cross-origin requests entirely.
     */
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default('http://localhost:4000,http://localhost:3001,http://localhost:3002')
      .transform((raw) =>
        raw
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),

    /**
     * Fastify trust-proxy setting (RES-165). Controls whether
     * `X-Forwarded-*` headers are honored to derive `req.ip`/`req.hostname`.
     * Untrusted XFF lets a client rotate IPs to bypass per-IP rate-limit
     * buckets, so the default is `false` (do not trust the headers).
     *
     * Accepted values:
     *   - unset / empty / 'false' → false (safe default)
     *   - 'N' (positive integer)  → trust this many proxy hops
     *   - 'a.b.c.d/n,e.f.g.h/n'    → trust only these CIDRs
     *   - 'true'                   → trust all (DEV ONLY — refused outside dev/test)
     *
     * Required outside dev/test (deploys are always behind an ingress).
     */
    TRUST_PROXY: z.string().optional(),

    /** Per-IP rate limit (req/min) for public/auth routes. */
    RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().int().positive().default(60),
    /** Per-IP rate limit (req/min) for `/internal/v1/*`. */
    RATE_LIMIT_INTERNAL_PER_MIN: z.coerce.number().int().positive().default(10),
    /** Per-IP rate limit (req/min) for `POST /api/auth/sign-up/email` (brute-force resistance, RES-137). */
    RATE_LIMIT_AUTH_SIGNUP_PER_MIN: z.coerce.number().int().positive().default(5),
    /** Per-user rate limit (req/min) for `GET /v1/me/tenants/slug-availability`. */
    RATE_LIMIT_TENANT_SLUG_CHECK_PER_MIN: z.coerce.number().int().positive().default(30),
    REQUIRE_EMAIL_VERIFICATION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((s) => s === 'true'),
    /** Per-IP rate limit (req/min) for `POST /api/auth/request-password-reset` (brute-force resistance, RES-137). */
    RATE_LIMIT_AUTH_RESET_PER_MIN: z.coerce.number().int().positive().default(5),
    /** Per-IP rate limit (req/min) for `POST /api/auth/sign-in/email` (brute-force resistance, RES-137). */
    RATE_LIMIT_AUTH_SIGNIN_PER_MIN: z.coerce.number().int().positive().default(10),
    /**
     * Per-email rate limit (req/min) for `POST /api/auth/sign-in/email`
     * (brute-force resistance, RES-169). Applied IN ADDITION to the
     * per-IP cap so an attacker rotating IPs against one account is
     * still throttled on this bucket.
     */
    RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN: z.coerce.number().int().positive().default(10),
    /** Per-email rate limit (req/min) for `POST /api/auth/request-password-reset` (RES-169). */
    RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN: z.coerce.number().int().positive().default(5),
    /** Minimum password length enforced by BA's emailAndPassword config (RES-137; NIST-aligned). */
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
    /** Maximum password length enforced by BA's emailAndPassword config (RES-137). */
    PASSWORD_MAX_LENGTH: z.coerce.number().int().min(64).default(128),

    /**
     * Per-tenant signin rate-limit (D-20). Applied IN ADDITION to the
     * per-IP and per-email buckets — an attacker rotating both IPs and
     * email addresses against one tenant is still throttled here.
     * Default 60 (generous for onboarding, tight against credential
     * stuffing). Enforcement lands in Plan 03; declared here so all the
     * new envs ship in the same wave.
     */
    RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN: z.coerce.number().int().positive().default(60),

    /**
     * Resend SDK API key (D-01). Optional at the schema level so dev/test
     * boot without one (the factory picks MailHog/Captured in those
     * envs). `assertProdGuardrails` (boot-time, non-dev/test) is the
     * prod-rejection layer — it throws if the value is empty OR equals
     * the documented dummy literal in staging/production.
     */
    /**
     * Guest sign-in with Google. Both or neither: the provider is only registered when the pair
     * is present, so a deploy that forgets one gets no social login rather than a half-wired one.
     */
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    /**
     * Sender identity used by the Resend adapter. Must be a verified
     * domain in the Resend dashboard before deploy (D-07 SPF/DKIM/DMARC
     * runbook). Default applies in dev so MailHog runs without env-seed.
     */
    RESEND_FROM: z.string().min(1).default('RestOS <noreply@resto.app>'),
    /** Operator support address for replies to platform emails. */
    RESEND_REPLY_TO: z.string().email().default('support@resto.app'),

    /** MailHog SMTP host (dev adapter target). Matches docker-compose.dev.yml. */
    MAILHOG_HOST: z.string().min(1).default('localhost'),
    /** MailHog SMTP port (dev adapter target). Matches docker-compose.dev.yml. */
    MAILHOG_PORT: z.coerce.number().int().positive().default(1025),

    /** Stripe platform secret key. Never log this value. */
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_APPLICATION_FEE_AMOUNT: z.coerce.number().int().nonnegative().default(0),
    STRIPE_CONNECT_CLIENT_ID: z.string().optional(),
    STRIPE_CONNECT_RETURN_URL: z.string().url().default('http://localhost:3001/stripe/return'),
    STRIPE_CONNECT_REFRESH_URL: z.string().url().default('http://localhost:3001/stripe/refresh'),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_CONNECT_OAUTH_REDIRECT_URL: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
      // S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY are now always set
      // via Zod `.default(...)` (matching `DEV_DEFAULTS`). Prod rejection
      // for them moves to `assertProdGuardrails` (boot-time), which
      // catches the dev-default values via the `=== devDefault` check.
      // ADR-0020 I-3.
      for (const key of [
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_BASE_URL',
        'BETTER_AUTH_DATABASE_URL',
        'ADMIN_WEB_URL',
        'WEBSITE_PUBLIC_URL',
        'AUTH_COOKIE_DOMAIN',
        'AUDIT_ERASURE_SALT',
        'TRUST_PROXY',
        'INTERNAL_API_TOKEN',
        'DATABASE_DIRECT_URL',
      ] as const) {
        if (!env[key]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when NODE_ENV is ${env.NODE_ENV}`,
          });
        }
      }
      if (env.TRUST_PROXY === 'true') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TRUST_PROXY'],
          message:
            'TRUST_PROXY=true is unsafe outside dev/test; specify a CIDR list (e.g. "10.0.0.0/8") or hop count instead',
        });
      }
    }

    // D-21/D-24: this only enforces the SHAPE (leading dot). Satisfying it
    // does not mean the SCOPE is right — `.resto.app` is a valid dotted
    // value but the wrong one; the operator cookie belongs on
    // `.admin.resto.app` only (see the field comment above).
    if (env.AUTH_COOKIE_DOMAIN && !env.AUTH_COOKIE_DOMAIN.startsWith('.')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_COOKIE_DOMAIN'],
        message:
          'AUTH_COOKIE_DOMAIN must start with "." to enable cross-subdomain cookies (e.g. ".admin.resto.app").',
      });
    }
  });
export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Invalid environment: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Parse and validate the environment. Throws `EnvValidationError` on the
 * first invalid input — callers (the ConfigModule provider) propagate
 * the error so Nest fails the boot before any controller is mounted.
 */
export const loadEnv = (raw: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error.issues);
  }
  if (parsed.data.NODE_ENV !== 'development' && parsed.data.TENANT_DEV_FALLBACK_SLUG) {
    throw new EnvValidationError([
      {
        code: 'custom',
        path: ['TENANT_DEV_FALLBACK_SLUG'],
        message: 'TENANT_DEV_FALLBACK_SLUG is only allowed when NODE_ENV=development',
      },
    ]);
  }
  return parsed.data;
};
