/**
 * Hidden must equal refused.
 *
 * The sidebar drops nav items an operator has no permission for. That is convenience only — a
 * typed URL or a stale bookmark still reaches the route. This spec enumerates the ACTUALLY
 * assembled router (apps/admin/src/main.tsx) and asserts every route under the protected layout
 * either carries a `requirePermission` guard, inherits one from an ancestor, or is named in
 * UNGATED_FULL_PATHS below.
 *
 * Failure mode this catches: a developer adds /billing to the protected tree and wires it into
 * main.tsx without deciding who may open it — this spec turns RED.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: vi.fn() }),
}));

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
}));

beforeAll(() => {
  if (!document.getElementById('root')) {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  }
});

const PROTECTED_LAYOUT_ID = '/(protected)';

/** Reachable by every signed-in operator, by decision — no permission gates them. */
const UNGATED_FULL_PATHS = new Set([
  '/', // dashboard
  '/onboarding', // pre-tenant setup; the layout redirects here before any gate matters
  '/dashboard/$', // legacy-path redirect, resolves before it renders
]);

interface RouteNode {
  readonly id: string;
  readonly fullPath?: string;
  readonly parentRoute?: RouteNode;
  readonly options?: { readonly beforeLoad?: { readonly permission?: unknown } };
}

const chainOf = (route: RouteNode): RouteNode[] => {
  const chain: RouteNode[] = [];
  let node: RouteNode | undefined = route;
  while (node) {
    chain.push(node);
    node = node.parentRoute;
  }
  return chain;
};

const isGuarded = (route: RouteNode): boolean =>
  route.options?.beforeLoad?.permission !== undefined;

describe('admin route tree — every protected route decides who may open it', () => {
  it('each route under the protected layout is guarded, inherits a guard, or is explicitly ungated', async () => {
    const { router } = await import('../src/main');

    const routes = Object.values(router.routesById as unknown as Record<string, RouteNode>);
    const protectedRoutes = routes.filter((route) => {
      const chain = chainOf(route);
      return route.id !== PROTECTED_LAYOUT_ID && chain.some((r) => r.id === PROTECTED_LAYOUT_ID);
    });

    expect(
      protectedRoutes.length,
      'router must expose routes under the protected layout',
    ).toBeGreaterThan(0);

    const unguarded = protectedRoutes
      .filter((route) => !UNGATED_FULL_PATHS.has(route.fullPath ?? ''))
      .filter((route) => !chainOf(route).some(isGuarded))
      .map((route) => route.fullPath ?? route.id);

    expect(
      unguarded,
      'these protected routes have no permission guard and are not in UNGATED_FULL_PATHS — add ' +
        'requirePermission(...) to the route, or list it as a deliberate exception',
    ).toEqual([]);
  }, 30_000);

  it('guards the routes whose sidebar entries are permission-gated', async () => {
    const { router } = await import('../src/main');
    const routes = Object.values(router.routesById as unknown as Record<string, RouteNode>);

    const guardedByPath = new Map(
      routes
        .filter(isGuarded)
        .map((route) => [route.fullPath ?? route.id, route.options?.beforeLoad?.permission]),
    );

    expect(Object.fromEntries(guardedByPath)).toEqual({
      '/orders': { resource: 'order', action: 'read' },
      '/menu': { resource: 'menu', action: 'read' },
      '/locations': { resource: 'location', action: 'create' },
      '/locations/$slug': { resource: 'location', action: 'create' },
      '/roles': { resource: 'ac', action: 'read' },
      '/roles/$roleId': { resource: 'ac', action: 'read' },
      '/team': { resource: 'staff', action: 'invite' },
      '/settings': { resource: 'settings', action: 'update' },
      '/tenant/payouts': { resource: 'billing', action: 'read' },
      '/tenant/domains': { resource: 'settings', action: 'update' },
      '/tenant/theme': { resource: 'settings', action: 'update' },
    });
  }, 30_000);
});
