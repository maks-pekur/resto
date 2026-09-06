import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from '../src/route-tree';

const OWNER = {
  kind: 'operator',
  userId: 'u-1',
  email: 'owner@demo.local',
  tenantId: 't-1',
  baseRole: 'owner',
  permissions: {},
};

const ok = (data: unknown) => ({ status: 200, ok: true, data });

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: () => Promise.resolve({ data: { session: { activeOrganizationId: 't-1' } } }),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: (path: string) => {
    if (path.startsWith('/v1/me/tenants')) {
      return Promise.resolve(
        ok({ tenants: [{ id: 't-1', slug: 'pizza', displayName: 'Pizza', status: 'active' }] }),
      );
    }
    if (path.startsWith('/v1/me/locations')) {
      // A real location so an unmatched first segment (e.g. a mis-stripped `admin`) falls
      // through resolveLocationRoute's 'redirect' branch, not its 'no-locations' one — the
      // latter redirects to /dashboard too and would mask a broken basepath as a pass.
      return Promise.resolve(ok({ locations: [{ id: 'loc-1', name: 'Podil', slug: 'podil' }] }));
    }
    if (path.startsWith('/v1/me')) return Promise.resolve(ok(OWNER));
    if (path.startsWith('/v1/tenancy/locations')) {
      return Promise.resolve(
        ok([{ id: 'loc-1', name: 'Some Location', slug: 'some-slug', status: 'active' }]),
      );
    }
    if (path.startsWith('/v1/tenancy/table-zones')) return Promise.resolve(ok([]));
    if (path.startsWith('/v1/catalog/draft-diff')) {
      return Promise.resolve(ok({ unpublishedCount: 0, items: [] }));
    }
    if (path.startsWith('/v1/catalog/items')) {
      return Promise.resolve(ok({ items: [], total: 0, limit: 50, offset: 0 }));
    }
    if (path.startsWith('/v1/catalog/categories')) return Promise.resolve(ok({ items: [] }));
    return Promise.resolve(ok({}));
  },
}));

const routerAt = (initialEntry: string) =>
  createRouter({
    routeTree,
    basepath: '/admin',
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

describe('admin router — deep links resolve under the /admin basepath', () => {
  it('resolves the dashboard deep link', async () => {
    const router = routerAt('/admin/dashboard');
    await router.load();
    expect(router.state.matches).not.toHaveLength(0);
    expect(router.state.matches.some((m) => m.fullPath === '/dashboard')).toBe(true);
  }, 20_000);

  it('resolves a nested deep link', async () => {
    const router = routerAt('/admin/menu/items');
    await router.load();
    expect(router.state.matches.some((m) => m.fullPath === '/menu/items')).toBe(true);
  }, 20_000);

  it('resolves a parameterised deep link', async () => {
    const router = routerAt('/admin/locations/some-slug/tables');
    await router.load();
    const match = router.state.matches.find((m) => m.fullPath === '/locations/$slug/tables');
    expect(match).toBeDefined();
    expect((match?.params as { slug?: string } | undefined)?.slug).toBe('some-slug');
  }, 20_000);

  it('resolves the auth deep link', async () => {
    const router = routerAt('/admin/login');
    await router.load();
    expect(router.state.matches.some((m) => m.fullPath === '/login')).toBe(true);
  }, 20_000);

  it('composes a base-prefixed link, which a router with no configured base cannot do', async () => {
    const withBase = routerAt('/admin/dashboard');
    await withBase.load();
    expect(withBase.buildLocation({ to: '/dashboard' }).href).toBe('/admin/dashboard');

    const withoutBase = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    });
    await withoutBase.load();
    expect(withoutBase.buildLocation({ to: '/dashboard' }).href).not.toBe('/admin/dashboard');
  }, 20_000);
});
