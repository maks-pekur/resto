import { afterEach, describe, expect, it, vi } from 'vitest';

// ADMIN_HOST_SUFFIX (here and in @/env) is a module-level constant computed
// at import time — `vi.resetModules()` before each dynamic import forces a
// fresh evaluation against the just-stubbed env, matching env.spec.ts's
// save/restore pattern plus the reset dynamic-import needs on top of it.
const metaEnv = import.meta.env as Record<string, unknown>;

const saveEnv = () => ({ ...metaEnv });
const restoreEnv = (saved: Record<string, unknown>) => {
  for (const key of Object.keys(metaEnv)) Reflect.deleteProperty(metaEnv, key);
  Object.assign(metaEnv, saved);
};

describe('parseTenantSlugFromHost (T-10.2-17-01)', () => {
  let saved: Record<string, unknown>;

  afterEach(() => {
    restoreEnv(saved);
  });

  it('extracts the leftmost label for a genuine tenant host', async () => {
    saved = saveEnv();
    metaEnv.VITE_ADMIN_HOST_SUFFIX = 'admin.resto.app';
    vi.resetModules();

    const { parseTenantSlugFromHost } = await import('./admin-host');
    expect(parseTenantSlugFromHost('acme.admin.resto.app')).toBe('acme');
  });

  it('returns null for the bare apex — no tenant bound there', async () => {
    saved = saveEnv();
    metaEnv.VITE_ADMIN_HOST_SUFFIX = 'admin.resto.app';
    vi.resetModules();

    const { parseTenantSlugFromHost } = await import('./admin-host');
    expect(parseTenantSlugFromHost('admin.resto.app')).toBeNull();
  });

  it('rejects a suffix-spoofing host with extra trailing labels', async () => {
    saved = saveEnv();
    metaEnv.VITE_ADMIN_HOST_SUFFIX = 'admin.resto.app';
    vi.resetModules();

    const { parseTenantSlugFromHost } = await import('./admin-host');
    expect(parseTenantSlugFromHost('evil-admin.resto.app.attacker.com')).toBeNull();
  });

  it('rejects a look-alike suffix appended with attacker-controlled labels', async () => {
    saved = saveEnv();
    metaEnv.VITE_ADMIN_HOST_SUFFIX = 'admin.resto.app';
    vi.resetModules();

    const { parseTenantSlugFromHost } = await import('./admin-host');
    expect(parseTenantSlugFromHost('admin.resto.app.evil.com')).toBeNull();
  });

  it('rejects a two-level subdomain — exactly one leftmost label only', async () => {
    saved = saveEnv();
    metaEnv.VITE_ADMIN_HOST_SUFFIX = 'admin.resto.app';
    vi.resetModules();

    const { parseTenantSlugFromHost } = await import('./admin-host');
    expect(parseTenantSlugFromHost('a.b.admin.resto.app')).toBeNull();
  });
});

describe('adminUrlForTenant', () => {
  let saved: Record<string, unknown>;

  afterEach(() => {
    restoreEnv(saved);
  });

  it('builds an https URL with no port in prod', async () => {
    saved = saveEnv();
    metaEnv.DEV = false;
    metaEnv.VITE_ADMIN_HOST_SUFFIX = 'admin.resto.app';
    vi.resetModules();

    const { adminUrlForTenant } = await import('./admin-host');
    expect(adminUrlForTenant('acme', '/dashboard')).toBe('https://acme.admin.resto.app/dashboard');
  });

  it('builds an http URL with the fixed dev port locally', async () => {
    saved = saveEnv();
    metaEnv.DEV = true;
    metaEnv.VITE_ADMIN_HOST_SUFFIX = 'admin.localhost';
    vi.resetModules();

    const { adminUrlForTenant } = await import('./admin-host');
    expect(adminUrlForTenant('acme', '/dashboard')).toBe(
      'http://acme.admin.localhost:4000/dashboard',
    );
  });
});
