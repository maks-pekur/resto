import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: signOutMock, getSession: () => Promise.resolve({ data: null }) },
}));

const metaEnv = import.meta.env as Record<string, unknown>;
const originalLocation = window.location;
const originalFetch = global.fetch;

const unauthorizedResponse = {
  status: 401,
  ok: false,
  headers: { get: () => null },
  json: async () => null,
} as unknown as Response;

describe('apiFetch — expired session redirects under the base path', () => {
  let savedEnv: Record<string, unknown>;

  beforeEach(() => {
    signOutMock.mockClear();
    savedEnv = { ...metaEnv };
    (window as { location: unknown }).location = { href: '' };
    global.fetch = vi.fn().mockResolvedValue(unauthorizedResponse);
  });

  afterEach(() => {
    (window as { location: unknown }).location = originalLocation;
    global.fetch = originalFetch;
    for (const key of Object.keys(metaEnv)) Reflect.deleteProperty(metaEnv, key);
    Object.assign(metaEnv, savedEnv);
  });

  it('redirects to the base-path login when BASE_URL is /admin/', async () => {
    metaEnv.BASE_URL = '/admin/';
    const { apiFetch } = await import('@/lib/api-client');

    await apiFetch('/v1/me');

    expect(window.location.href).toBe('/admin/login?expired=1');
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it('redirects to the root login when BASE_URL is /', async () => {
    metaEnv.BASE_URL = '/';
    const { apiFetch } = await import('@/lib/api-client');

    await apiFetch('/v1/me');

    expect(window.location.href).toBe('/login?expired=1');
  });
});
