import { z } from 'zod';

const BRAND_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u;

export const BrandSlug = z
  .string()
  .min(3)
  .max(64)
  .toLowerCase()
  .refine((value) => BRAND_SLUG_RE.test(value), {
    message:
      'Brand slug must be lowercase alphanumeric with hyphens, 3–64 chars, not starting or ending with a hyphen.',
  })
  .brand<'BrandSlug'>();
export type BrandSlug = z.infer<typeof BrandSlug>;
