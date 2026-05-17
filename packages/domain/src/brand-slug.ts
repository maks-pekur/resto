import { z } from 'zod';

const BRAND_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u;

/**
 * HTTP-boundary form — raw lowercase slug, no brand. Use this in
 * `createZodDto` request schemas; `nestjs-zod` emits `type: string`
 * for it (the branded variant emits `unknown` — ADR-0020 I-7).
 * Inside the domain use `BrandSlug`.
 */
export const BrandSlugValue = z
  .string()
  .min(3)
  .max(64)
  .toLowerCase()
  .refine((value) => BRAND_SLUG_RE.test(value), {
    message:
      'Brand slug must be lowercase alphanumeric with hyphens, 3–64 chars, not starting or ending with a hyphen.',
  });
export type BrandSlugValue = z.infer<typeof BrandSlugValue>;

export const BrandSlug = BrandSlugValue.brand<'BrandSlug'>();
export type BrandSlug = z.infer<typeof BrandSlug>;
