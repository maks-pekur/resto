import { VITE_ADMIN_HOST_SUFFIX } from '@/env';

// D-21: the tenant lives in the host, not a path segment. D-24: the
// match is label-by-label against ADMIN_HOST_SUFFIX, never a bare suffix
// test — a substring check would let `evil-admin.resto.app.attacker.com`
// (which contains `.admin.resto.app` as a substring) parse as a valid
// tenant host.
export const ADMIN_HOST_SUFFIX = VITE_ADMIN_HOST_SUFFIX;

const DEV_PORT = ':4000';

export const parseTenantSlugFromHost = (hostname: string): string | null => {
  const hostLabels = hostname.split('.');
  const suffixLabels = ADMIN_HOST_SUFFIX.split('.');
  if (hostLabels.length !== suffixLabels.length + 1) return null;
  const [slug, ...rest] = hostLabels;
  if (!slug || slug.length === 0) return null;
  const matchesSuffix = rest.every((label, i) => label === suffixLabels[i]);
  return matchesSuffix ? slug : null;
};

export const adminUrlForTenant = (slug: string, path = ''): string => {
  if (import.meta.env.DEV) {
    return `http://${slug}.${ADMIN_HOST_SUFFIX}${DEV_PORT}${path}`;
  }
  return `https://${slug}.${ADMIN_HOST_SUFFIX}${path}`;
};
