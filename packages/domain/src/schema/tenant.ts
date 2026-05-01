import { z } from 'zod';
import { TenantId } from '../ids';
import { TenantSlug } from '../tenant-slug';
import { Currency } from '../money';
import { timestampsShape } from './_shared';

/**
 * Lifecycle of a tenant in the platform.
 *
 * - `active`: normal operation
 * - `suspended`: locked out (billing failure, abuse) — not deleted
 * - `archived`: tenant has left the platform; retained for audit
 */
export const TenantStatus = z.enum(['active', 'suspended', 'archived']);
export type TenantStatus = z.infer<typeof TenantStatus>;

const localeRegex = /^[a-z]{2}(?:-[A-Z]{2})?$/;

/**
 * A single restaurant business on the platform. Mirrors the `tenants`
 * table in `@resto/db`. Domain rules that the database also enforces are
 * intentionally duplicated here — schemas describe the business; the db
 * is the second line of defence.
 */
export const Tenant = z.object({
  id: TenantId,
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  status: TenantStatus,
  locale: z.string().regex(localeRegex, 'must be a locale tag like "en" or "en-US"'),
  defaultCurrency: Currency,
  stripeAccountId: z.string().nullable(),
  ...timestampsShape,
});
export type Tenant = z.infer<typeof Tenant>;
