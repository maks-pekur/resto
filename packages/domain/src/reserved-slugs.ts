/**
 * Non-dynamic root-level path segments of the admin SPA router.
 * These must all be in RESERVED_SLUGS so no tenant slug can shadow an admin route.
 * D-06: the admin route-derivation spec (apps/admin/test/reserved-slugs-route-derivation.spec.ts)
 * asserts every ACTUAL assembled root segment is in RESERVED_SLUG_SET — catching new routes
 * added to main.tsx without reserving the word.
 */
export const ADMIN_ROOT_ROUTE_SEGMENTS: readonly string[] = [
  'login',
  'signup',
  'forgot-password',
  'reset-password',
  'accept-invitation',
  'onboarding',
  'pick-location',
  'pick-tenant',
];

/**
 * Platform-reserved subdomain labels. Never claimable as a tenant
 * slug — they collide with operational subdomains (admin, api, cdn, …) or are
 * confusing. Matched case-insensitively (slugs are lowercase by construction;
 * this is defence in depth in case a request bypasses the schema).
 */
export const RESERVED_SLUGS: readonly string[] = [
  'accept-invitation',
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
  'forgot-password',
  'help',
  'login',
  'mail',
  'menu',
  'onboarding',
  'pick-location',
  'pick-tenant',
  'public',
  'reset-password',
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

export const RESERVED_SLUG_SET: ReadonlySet<string> = new Set(
  RESERVED_SLUGS.map((s) => s.toLowerCase()),
);
