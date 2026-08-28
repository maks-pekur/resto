/**
 * The route tree as assembled in main.tsx, driven the way a browser drives it.
 *
 * The pure helpers in `location-path.spec.ts` prove the decisions; this proves they are wired —
 * that `/$locationSlug` sits below every static route rather than swallowing them, that the old
 * addresses still land somewhere useful, and that a slug the operator does not hold is corrected
 * before the page renders.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const OWNER = {
  kind: 'operator',
  userId: 'u-1',
  email: 'owner@demo.local',
  tenantId: 't-1',
  baseRole: 'owner',
  permissions: {},
};

const LOCATIONS = [
  { id: 'loc-v', name: 'Воскресенка', slug: 'voskresenka' },
  { id: 'loc-p', name: 'Podil', slug: 'podil' },
];

const ok = (data: unknown) => ({ status: 200, ok: true, data });

vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn() }) }));
vi.mock('@sentry/react', () => ({ init: vi.fn(), browserTracingIntegration: vi.fn(() => ({})) }));

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
    if (path.startsWith('/v1/me/locations')) return Promise.resolve(ok({ locations: LOCATIONS }));
    if (path.startsWith('/v1/me')) return Promise.resolve(ok(OWNER));
    if (path.startsWith('/v1/orders')) return Promise.resolve(ok({ rows: [] }));
    return Promise.resolve(ok({ items: [] }));
  },
}));

beforeAll(() => {
  if (!document.getElementById('root')) {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  }
});

const landsOn = async (href: string): Promise<string> => {
  const { router } = await import('../src/main');
  await router.navigate({ href });
  return router.state.location.pathname;
};

describe('location-in-the-path routing', () => {
  it('serves a location-grain page under its slug', async () => {
    expect(await landsOn('/voskresenka/orders')).toBe('/voskresenka/orders');
    expect(await landsOn('/voskresenka/stop-list')).toBe('/voskresenka/stop-list');
  }, 20_000);

  it('corrects a slug the operator does not hold, keeping the page they asked for', async () => {
    expect(await landsOn('/nowhere/orders')).toBe('/podil/orders');
  }, 20_000);

  it('leaves brand-grain pages out of the location layout', async () => {
    expect(await landsOn('/team')).toBe('/team');
    expect(await landsOn('/menu/items')).toBe('/menu/items');
    expect(await landsOn('/locations')).toBe('/locations');
    expect(await landsOn('/roles')).toBe('/roles');
  }, 20_000);

  it('redirects the landing address to the every-location dashboard', async () => {
    expect(await landsOn('/')).toBe('/dashboard');
  }, 20_000);

  it('sends the old slugless /orders to the default location', async () => {
    expect(await landsOn('/orders')).toBe('/podil/orders');
  }, 20_000);

  it('sends the old /menu/stop-list to the default location', async () => {
    expect(await landsOn('/menu/stop-list')).toBe('/podil/stop-list');
  }, 20_000);

  it('serves the every-location dashboard rather than a legacy splat', async () => {
    // The `/dashboard/$` route this replaces matched `/dashboard` itself, so the landing redirect
    // bounced between `/` and `/dashboard` forever. Deleting it is what makes `/dashboard` a page.
    expect(await landsOn('/dashboard')).toBe('/dashboard');
  }, 20_000);
});
