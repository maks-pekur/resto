import 'server-only';
import { z } from 'zod';

const WebsiteEnvSchema = z.object({
  NEXT_PUBLIC_API_ORIGIN: z.string().url(),
  WEBSITE_URL: z.string().url(),
});

type WebsiteEnv = z.infer<typeof WebsiteEnvSchema>;

const DEV_DEFAULTS: WebsiteEnv = {
  NEXT_PUBLIC_API_ORIGIN: 'http://localhost:3000',
  WEBSITE_URL: 'http://localhost:3002',
};

export class WebsiteEnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Invalid website env: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    this.name = 'WebsiteEnvValidationError';
  }
}

const isPermissive = (nodeEnv: string | undefined): boolean =>
  nodeEnv === 'development' || nodeEnv === 'test';

const loadWebsiteEnv = (raw: NodeJS.ProcessEnv = process.env): WebsiteEnv => {
  const candidate: Record<string, string | undefined> = {
    NEXT_PUBLIC_API_ORIGIN: raw.NEXT_PUBLIC_API_ORIGIN,
    WEBSITE_URL: raw.WEBSITE_URL,
  };

  if (isPermissive(raw.NODE_ENV)) {
    for (const key of Object.keys(candidate) as (keyof WebsiteEnv)[]) {
      const v = candidate[key];
      if (v === undefined || v === '') {
        candidate[key] = DEV_DEFAULTS[key];
      }
    }
  }

  const parsed = WebsiteEnvSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new WebsiteEnvValidationError(parsed.error.issues);
  }
  return parsed.data;
};

const env = loadWebsiteEnv();

export const apiOrigin = (): string => env.NEXT_PUBLIC_API_ORIGIN;
export const websiteUrl = (): string => env.WEBSITE_URL;
