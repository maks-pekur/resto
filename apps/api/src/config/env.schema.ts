import { z } from 'zod';

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
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  DEPLOYMENT_ENVIRONMENT: z.string().default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(3000),

  /** Runtime-role URL — non-superuser, NOBYPASSRLS (RES-83). */
  DATABASE_URL: z.string().url(),
  /** Schema-owner URL — used by migrations only, never by the runtime app. */
  DATABASE_ADMIN_URL: z.string().url().optional(),

  REDIS_URL: z.string().url().optional(),
  NATS_URL: z.string().url(),
  /** JetStream stream the app's events flow through. */
  NATS_STREAM: z.string().default('RESTO_EVENTS'),

  /**
   * Shared secret for `/internal/v1/*` routes — the only auth in MVP-1
   * (ADR-0012 deferred per-user IAM to MVP-2). Required outside dev;
   * `InternalTokenGuard` allows unauthenticated requests in development
   * for tooling ergonomics.
   */
  INTERNAL_API_TOKEN: z.string().min(16).optional(),

  /** S3-compatible bucket for menu images (R2 / AWS S3 / MinIO in dev). */
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('resto-dev'),
  S3_ACCESS_KEY: z.string().default('minio'),
  S3_SECRET_KEY: z.string().default('minio_dev_password'),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('resto-api'),

  /**
   * Dev-only escape hatch. When set, requests on the api root domain
   * (no tenant subdomain) are pinned to this slug instead of running
   * tenant-less. Refused outside `NODE_ENV=development`.
   */
  TENANT_DEV_FALLBACK_SLUG: z.string().optional(),
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
