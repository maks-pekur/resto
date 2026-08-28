/**
 * Non-dynamic root-level path segments of the admin SPA router.
 * These must all be in RESERVED_SLUGS so no tenant slug can shadow an admin route.
 * D-06: the admin route-derivation spec (apps/admin/test/reserved-slugs-route-derivation.spec.ts)
 * asserts every ACTUAL assembled root segment is in RESERVED_SLUG_SET — catching new routes
 * added to main.tsx without reserving the word.
 */
export const ADMIN_ROOT_ROUTE_SEGMENTS: readonly string[] = [
  // (auth)
  'login',
  'signup',
  'forgot-password',
  'reset-password',
  'accept-invitation',
  'pick-location',
  'pick-tenant',
  // (protected) — became root segments when phase 10.2 plan 15 deleted the
  // `/$brandSlug` path segment and flattened the dashboard tree beneath it.
  'onboarding',
  'locations',
  'menu',
  'orders',
  'roles',
  'settings',
  'team',
  'tenant',
  // The location slug moved back into the first path segment, so these two joined it there:
  // the dashboard got its own address (`/dashboard` = every location) and the stop list left
  // the menu subtree (its grain is the location, the menu's is the brand).
  'dashboard',
  'stop-list',
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
  // Admin root route segments that became top-level when phase 10.2 plan 15
  // deleted the `/$brandSlug` path segment and flattened the dashboard tree.
  // Reserved as defence in depth: the tenant slug now lives in the hostname
  // (D-21), so a path collision is no longer reachable — but the invariant is
  // cheap to keep and the slug has lived in a path before.
  'dashboard-redirect',
  'locations',
  'orders',
  'roles',
  'settings',
  'stop-list',
  'team',
  'tenant',
];

export const RESERVED_SLUG_SET: ReadonlySet<string> = new Set(
  RESERVED_SLUGS.map((s) => s.toLowerCase()),
);
