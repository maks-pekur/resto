import { z } from 'zod';

/**
 * Words a location may not be slugged as, because each already means something in a URL:
 *
 * - `new` is the create sentinel on `/locations/$slug`, matching the pattern `roles.$roleId` and
 *   `menu/items.$id` already use. A location slugged `new` would shadow its own create form.
 * - `all` is the sentinel in `?location=all`, the aggregate mode the dashboard reads.
 *
 * Scoped per tenant, so this list only has to cover route and mode collisions — not other tenants'
 * location names.
 */
export const LOCATION_RESERVED_SLUGS: readonly string[] = ['new', 'all'];

export const LOCATION_RESERVED_SLUG_SET: ReadonlySet<string> = new Set(LOCATION_RESERVED_SLUGS);

export const LocationSlug = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'must be lowercase alphanumeric with hyphens, starting with a letter or digit',
  )
  .refine((value) => !LOCATION_RESERVED_SLUG_SET.has(value), {
    message: 'this word is reserved — it already means something in a location URL',
  })
  .brand<'LocationSlug'>();

export type LocationSlug = z.infer<typeof LocationSlug>;
