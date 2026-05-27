import 'server-only';
import { z } from 'zod';

/**
 * apps/admin env schema. Parsed eagerly at module load; throws in non-dev
 * when required vars are missing so a misconfigured production deploy
 * crashes at boot instead of routing live operators to localhost
 * (apps/CLAUDE.md env-var rule; CONTEXT D-05, D-06).
 *
 * `import 'server-only'` keeps `INTERNAL_API_TOKEN` server-only — any
 * client-component import path triggers a build error
 * (apps/CLAUDE.md INTERNAL_API_TOKEN rule).
 */

const AdminEnvSchema = z.object({
  NEXT_PUBLIC_API_ORIGIN: z.string().url(),
  ADMIN_WEB_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(16),
  ACTIVE_BRAND_COOKIE_SECRET: z.string().min(32),
});

type AdminEnv = z.infer<typeof AdminEnvSchema>;

const DEV_DEFAULTS: AdminEnv = {
  NEXT_PUBLIC_API_ORIGIN: 'http://localhost:3000',
  ADMIN_WEB_URL: 'http://localhost:3001',
  INTERNAL_API_TOKEN: 'dev-internal-token-min-16-chars',
  ACTIVE_BRAND_COOKIE_SECRET: 'dev-only-active-brand-secret-32!',
};

export class AdminEnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Invalid admin env: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    this.name = 'AdminEnvValidationError';
  }
}

const isPermissive = (nodeEnv: string | undefined): boolean =>
  nodeEnv === 'development' || nodeEnv === 'test';

const loadAdminEnv = (raw: NodeJS.ProcessEnv = process.env): AdminEnv => {
  const candidate: Record<string, string | undefined> = {
    NEXT_PUBLIC_API_ORIGIN: raw.NEXT_PUBLIC_API_ORIGIN,
    ADMIN_WEB_URL: raw.ADMIN_WEB_URL,
    INTERNAL_API_TOKEN: raw.INTERNAL_API_TOKEN,
    ACTIVE_BRAND_COOKIE_SECRET: raw.ACTIVE_BRAND_COOKIE_SECRET,
  };

  if (isPermissive(raw.NODE_ENV)) {
    for (const key of Object.keys(candidate) as (keyof AdminEnv)[]) {
      const v = candidate[key];
      if (v === undefined || v === '') {
        candidate[key] = DEV_DEFAULTS[key];
      }
    }
  }

  const parsed = AdminEnvSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AdminEnvValidationError(parsed.error.issues);
  }
  return parsed.data;
};

const env = loadAdminEnv();

export const apiOrigin = (): string => env.NEXT_PUBLIC_API_ORIGIN;
export const adminOrigin = (): string => env.ADMIN_WEB_URL;
export const internalApiToken = (): string => env.INTERNAL_API_TOKEN;
export const activeBrandCookieSecret = (): string => env.ACTIVE_BRAND_COOKIE_SECRET;
