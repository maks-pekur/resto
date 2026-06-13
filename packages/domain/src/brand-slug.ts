import { z } from 'zod';
import { RESERVED_SLUG_SET } from './reserved-slugs';

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
  })
  .refine((value) => !RESERVED_SLUG_SET.has(value), {
    message: 'Brand slug is a reserved platform name.',
  })
  .refine((value) => !value.startsWith('xn--'), {
    message: 'Brand slug must not be a punycode/IDN (xn--) label.',
  });
export type BrandSlugValue = z.infer<typeof BrandSlugValue>;

export const BrandSlug = BrandSlugValue.brand<'BrandSlug'>();
export type BrandSlug = z.infer<typeof BrandSlug>;
