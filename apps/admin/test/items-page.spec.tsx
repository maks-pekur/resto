import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Plan 04b-06 Task 2 — Items list RSC page.
 *
 * Spec scope: RSC builds the correct query string for the
 * `/internal/v1/catalog/items` call from URL search params, and skips the
 * `status` query when the operator picked the default
 * 'all-except-archived' (Plan 02 backend default).
 */

const { apiFetchMock, apiFetchInternalMock, redirectMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  apiFetchInternalMock: vi.fn(),
  redirectMock: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/api-server-internal', () => ({ apiFetchInternal: apiFetchInternalMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

// Replace the client islands with placeholder div components — we are
// asserting on the server-side query construction only.
vi.mock('@/app/dashboard/(workspace)/menu/items/items-table-client', () => ({
  ItemsTableClient: ({ items }: { items: readonly { id: string }[] }) => (
    <div data-testid="items-table-stub" data-count={items.length} />
  ),
}));
vi.mock('@/app/dashboard/(workspace)/menu/items/items-filter-bar-client', () => ({
  ItemsFilterBarClient: () => <div data-testid="filter-bar-stub" />,
}));
vi.mock('@/components/tenant-breadcrumb', () => ({
  TenantBreadcrumb: ({ trail }: { trail: string }) => <div data-testid="breadcrumb">{trail}</div>,
}));
vi.mock('@/components/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty">{title}</div>,
}));
vi.mock('@/components/ui/sidebar', () => ({
  SidebarTrigger: () => <div data-testid="sidebar-trigger" />,
}));
vi.mock('@/components/ui/separator', () => ({
  Separator: () => <div data-testid="separator" />,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...rest }: React.PropsWithChildren) => <button {...rest}>{children}</button>,
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  apiFetchMock.mockResolvedValue({
    ok: true,
    data: { kind: 'operator', tenantId: TENANT_ID },
  });
  apiFetchInternalMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { items: [], total: 0, limit: 50, offset: 0 },
  });
});

const importPage = async () => {
  const mod = await import('@/app/dashboard/(workspace)/menu/items/page');
  return mod.default as (args: {
    searchParams: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;
};

describe('ItemsListPage RSC (Plan 04b-06 Task 2)', () => {
  it('omits the status query when default filter is all-except-archived', async () => {
    const Page = await importPage();
    const el = await Page({ searchParams: Promise.resolve({}) });
    render(el);
    const calls = apiFetchInternalMock.mock.calls.map((c) => c[0] as string);
    const itemsCall = calls.find((c) => c.startsWith('/internal/v1/catalog/items'));
    expect(itemsCall).toBeDefined();
    expect(itemsCall).not.toContain('status=');
    expect(itemsCall).toContain('limit=50');
    expect(itemsCall).toContain('offset=0');
  });

  it('includes status query when operator picks a specific status', async () => {
    const Page = await importPage();
    const el = await Page({ searchParams: Promise.resolve({ status: 'draft' }) });
    render(el);
    const calls = apiFetchInternalMock.mock.calls.map((c) => c[0] as string);
    const itemsCall = calls.find((c) => c.startsWith('/internal/v1/catalog/items'));
    expect(itemsCall).toContain('status=draft');
  });

  it('passes categoryId + q + offset to the internal endpoint', async () => {
    const Page = await importPage();
    const el = await Page({
      searchParams: Promise.resolve({
        category: '99999999-9999-4999-8999-999999999999',
        q: 'кофе',
        page: '3',
      }),
    });
    render(el);
    const calls = apiFetchInternalMock.mock.calls.map((c) => c[0] as string);
    const itemsCall = calls.find((c) => c.startsWith('/internal/v1/catalog/items'));
    expect(itemsCall).toContain('categoryId=99999999-9999-4999-8999-999999999999');
    expect(itemsCall).toContain('q=');
    expect(itemsCall).toContain('offset=100'); // (3 - 1) * 50
  });

  it('redirects to /login when the operator session is missing', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, data: null });
    const Page = await importPage();
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('also fetches /internal/v1/catalog/categories for the filter dropdown', async () => {
    const Page = await importPage();
    const el = await Page({ searchParams: Promise.resolve({}) });
    render(el);
    const calls = apiFetchInternalMock.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.startsWith('/internal/v1/catalog/categories'))).toBe(true);
  });
});
