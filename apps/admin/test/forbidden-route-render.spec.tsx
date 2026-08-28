/**
 * A refusal must not take the shell down with it.
 *
 * `requirePermission` throws from `beforeLoad` rather than redirecting, on the assumption that the
 * router catches it at the refused route and leaves every ancestor — in the real app, the sidebar
 * and header — mounted. This spec holds the router to that assumption with the real guard, the real
 * Forbidden screen, and the same defaultErrorComponent branch main.tsx installs.
 */
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import i18n from '@/lib/i18n';
import { Forbidden, RouteError } from '@/components/route-error';
import { isForbiddenRouteError, requirePermission } from '@/lib/auth/permissions';
import type { MeResponse } from '@/lib/queries/identity';

const clientReturning = (me: MeResponse): QueryClient =>
  ({
    ensureQueryData: vi.fn(() => Promise.resolve({ status: 200, ok: true, data: me })),
  }) as unknown as QueryClient;

const renderAtGatedRoute = async (me: MeResponse) => {
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => (
      <div>
        <nav data-testid="shell">sidebar</nav>
        <Outlet />
      </div>
    ),
  });

  const gatedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/gated',
    beforeLoad: requirePermission('ac', 'read'),
    component: () => <div data-testid="gated-content">roles</div>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([gatedRoute]),
    context: { queryClient: clientReturning(me) },
    history: createMemoryHistory({ initialEntries: ['/gated'] }),
    defaultErrorComponent: ({ error, reset }) =>
      isForbiddenRouteError(error) ? <Forbidden /> : <RouteError reset={reset} />,
  });

  await router.load();

  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router as never} />
    </I18nextProvider>,
  );
};

describe('a refused route', () => {
  it('renders the Forbidden screen and keeps the surrounding shell mounted', async () => {
    await i18n.changeLanguage('ru');
    await renderAtGatedRoute({ kind: 'operator', email: 'cashier@demo.local', permissions: {} });

    expect(await screen.findByTestId('route-forbidden')).toBeTruthy();
    expect(screen.getByTestId('shell')).toBeTruthy();
    expect(screen.queryByTestId('gated-content')).toBeNull();
    expect(screen.getByText('У вас нет доступа к этой странице.')).toBeTruthy();
  });

  it('renders the route normally when the operator holds the permission', async () => {
    await renderAtGatedRoute({
      kind: 'operator',
      email: 'manager@demo.local',
      permissions: { ac: ['read'] },
    });

    expect(await screen.findByTestId('gated-content')).toBeTruthy();
    expect(screen.queryByTestId('route-forbidden')).toBeNull();
  });
});
