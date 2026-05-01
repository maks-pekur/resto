import { z } from 'zod';

/**
 * Generic kebab-case slug. Lowercase ASCII letters, digits, and hyphens.
 * Must start with an alphanumeric character; trailing hyphens are
 * permitted (a value like `"a-"` is rejected by the more specific
 * `TenantSlug` rules but accepted here — entity slugs are typically
 * derived from human names and constrained per-table at the db layer).
 *
 * Mirrors the per-table slug check in `@resto/db`:
 * `^[a-z0-9][a-z0-9-]*$`.
 */
const slugRegex = /^[a-z0-9][a-z0-9-]*$/;

export const Slug = z
  .string()
  .min(1)
  .max(120)
  .regex(slugRegex, 'must be lowercase alphanumeric with hyphens, starting with a letter or digit');
export type Slug = z.infer<typeof Slug>;
