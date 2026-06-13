/**
 * Platform-reserved subdomain labels. Never claimable as a tenant OR brand
 * slug — they collide with operational subdomains (admin, api, cdn, …) or are
 * confusing. Matched case-insensitively (slugs are lowercase by construction;
 * this is defence in depth in case a request bypasses the schema).
 */
export const RESERVED_SLUGS: readonly string[] = [
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

export const RESERVED_SLUG_SET: ReadonlySet<string> = new Set(
  RESERVED_SLUGS.map((s) => s.toLowerCase()),
);
