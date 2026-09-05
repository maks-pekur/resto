import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { Route as rootRoute } from '@/routes/__root';
import { Route as authLayoutRoute } from '@/routes/(auth)/_layout';
import { Route as forgotPasswordRoute } from '@/routes/(auth)/forgot-password';
import { ThemeProvider } from '@/components/common/theme-provider';

const metaEnv = import.meta.env as Record<string, unknown>;
const originalFetch = global.fetch;

const renderForgotPassword = async () => {
  const router = createRouter({
    routeTree: rootRoute.addChildren([authLayoutRoute.addChildren([forgotPasswordRoute])]),
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ['/forgot-password'] }),
  });
  await router.load();
  render(
    <ThemeProvider>
      <RouterProvider router={router as never} />
    </ThemeProvider>,
  );
};

describe('forgot-password — redirectTo is base-path aware', () => {
  let savedEnv: Record<string, unknown>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    savedEnv = { ...metaEnv };
    fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of Object.keys(metaEnv)) Reflect.deleteProperty(metaEnv, key);
    Object.assign(metaEnv, savedEnv);
  });

  it('targets the base-path reset-password route when BASE_URL is /admin/', async () => {
    metaEnv.BASE_URL = '/admin/';
    await renderForgotPassword();

    await userEvent.type(screen.getByLabelText('Email'), 'owner@demo.local');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { redirectTo: string };
    expect(body.redirectTo).toBe(`${window.location.origin}/admin/reset-password`);
  });

  it('targets the root reset-password route when BASE_URL is /', async () => {
    metaEnv.BASE_URL = '/';
    await renderForgotPassword();

    await userEvent.type(screen.getByLabelText('Email'), 'owner@demo.local');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { redirectTo: string };
    expect(body.redirectTo).toBe(`${window.location.origin}/reset-password`);
  });
});
