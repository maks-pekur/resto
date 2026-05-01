import { z } from 'zod';

/**
 * Reserved tenant slugs.
 *
 * Tenants are addressed at `<slug>.menu.resto.app` (and parallel
 * subdomains for the admin, qr-menu, and tenant website). These names
 * collide with platform-owned subdomains or are confusing enough that we
 * never let a tenant claim them — even if the slug-format rule would
 * otherwise allow it.
 *
 * Matched case-insensitively (slugs are lowercase by construction; this
 * is defence in depth in case a request bypasses the schema).
 */
export const TENANT_RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'app',
  'apps',
  'assets',
  'auth',
  'blog',
  'cdn',
  'dashboard',
  'docs',
  'help',
  'login',
  'mail',
  'menu',
  'public',
  'resto',
  'root',
  'signup',
  'static',
  'status',
  'support',
  'system',
  'webhook',
  'webhooks',
  'www',
];

const RESERVED_SET = new Set(TENANT_RESERVED_SLUGS);

/**
 * Tenant slug. Stricter than the generic `Slug`:
 *
 * - 3..64 characters (matches the db `tenants_slug_format_chk`)
 * - starts and ends with an alphanumeric character (no edge hyphens)
 * - lowercase ASCII letters, digits, and hyphens only
 * - not a reserved platform name (see `TENANT_RESERVED_SLUGS`)
 *
 * The reserved-list check is enforced here rather than at the database
 * because it is policy, not a structural invariant — the list will grow
 * and shrink without migrations.
 */
const tenantSlugRegex = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export const TenantSlug = z
  .string()
  .regex(tenantSlugRegex, 'must be 3..64 lowercase alphanumeric/hyphen chars without edge hyphens')
  .refine((v) => !RESERVED_SET.has(v), 'is a reserved platform slug');
export type TenantSlug = z.infer<typeof TenantSlug>;
