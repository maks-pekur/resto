// Display-only preview of the host the server will assign (UI-SPEC S4:
// "You'll be reachable at {{host}}"). Mirrors TenantSlugValue's shape
// (packages/domain/src/tenant-slug.ts) so the preview never promises a host
// the server would reject — but the server is authoritative: it resolves
// collisions silently (plan 13), this function never checks availability.
export const slugifyTenantName = (raw: string): string => {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length === 0) return '';
  return ascii.slice(0, 64).replace(/-+$/g, '');
};
