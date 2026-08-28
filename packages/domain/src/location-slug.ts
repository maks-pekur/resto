import { z } from 'zod';
import { ADMIN_ROOT_ROUTE_SEGMENTS } from './reserved-slugs';

/**
 * Words a location may not be slugged as, because each already means something in a URL:
 *
 * - `new` is the create sentinel on `/locations/$slug`, matching the pattern `roles.$roleId` and
 *   `menu/items.$id` already use. A location slugged `new` would shadow its own create form.
 * - `all` was the sentinel in `?location=all`. That param is gone — the slugless `/dashboard` is
 *   now the every-location view — but the word stays reserved: it is still the internal
 *   `apiFetch({ locationId })` sentinel, and a location called "All" would read as a mode.
 * - every admin root route segment, because the slug occupies the first path segment
 *   (`/voskresenka/orders`). A location slugged `menu` or `team` would shadow a real page.
 *
 * That last group is why this list must be derived, not typed out: `ADMIN_ROOT_ROUTE_SEGMENTS` is
 * held honest against the assembled router by
 * `apps/admin/test/reserved-slugs-route-derivation.spec.ts`, so a new root route lands here without
 * anyone remembering to add it.
 *
 * Scoped per tenant, so this list only has to cover route and mode collisions — not other tenants'
 * location names.
 */
export const LOCATION_RESERVED_SLUGS: readonly string[] = [
  'new',
  'all',
  ...ADMIN_ROOT_ROUTE_SEGMENTS,
];

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
