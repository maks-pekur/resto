import { afterEach, describe, expect, it } from 'vitest';

const metaEnv = import.meta.env as Record<string, unknown>;

const saveEnv = () => ({ ...metaEnv });
const restoreEnv = (saved: Record<string, unknown>) => {
  for (const key of Object.keys(metaEnv)) Reflect.deleteProperty(metaEnv, key);
  Object.assign(metaEnv, saved);
};

describe('adminPath', () => {
  let saved: Record<string, unknown>;

  afterEach(() => {
    restoreEnv(saved);
  });

  it('composes a root path when BASE_URL is "/"', async () => {
    saved = saveEnv();
    metaEnv.BASE_URL = '/';

    const { adminPath } = await import('@/lib/admin-path');
    expect(adminPath('/dashboard')).toBe('/dashboard');
  });

  it('composes under the base path when BASE_URL is "/admin/"', async () => {
    saved = saveEnv();
    metaEnv.BASE_URL = '/admin/';

    const { adminPath } = await import('@/lib/admin-path');
    expect(adminPath('/dashboard')).toBe('/admin/dashboard');
  });

  it('tolerates a path without a leading slash', async () => {
    saved = saveEnv();
    metaEnv.BASE_URL = '/';

    const { adminPath: rootAdminPath } = await import('@/lib/admin-path');
    expect(rootAdminPath('dashboard')).toBe('/dashboard');

    metaEnv.BASE_URL = '/admin/';
    expect(rootAdminPath('dashboard')).toBe('/admin/dashboard');
  });

  it('does not double the slash', async () => {
    saved = saveEnv();
    metaEnv.BASE_URL = '/admin/';

    const { adminPath } = await import('@/lib/admin-path');
    expect(adminPath('/')).toBe('/admin/');
  });
});
