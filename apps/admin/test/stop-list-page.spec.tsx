import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const apiFetchInternalMock = vi.fn();
const redirectMock = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/api-server-internal', () => ({ apiFetchInternal: apiFetchInternalMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

vi.mock('@/components/menu/todays-86-widget', () => ({
  TodaysWidget: (props: { count: number }) => (
    <div data-testid="todays-widget">count:{props.count}</div>
  ),
}));

vi.mock('../app/dashboard/(workspace)/menu/stop-list/stop-list-table-client', () => ({
  StopListTableClient: (props: { items: readonly { id: string }[] }) => (
    <div data-testid="stop-list-table">rows:{props.items.length}</div>
  ),
}));

const { default: StopListPage } = await import('../app/dashboard/(workspace)/menu/stop-list/page');

const VALID_ME = {
  ok: true,
  status: 200,
  data: { kind: 'operator', tenantId: 'tenant-1' },
};

describe('StopListPage (Plan 04b-09 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(VALID_ME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty state when the stop list is empty', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({ ok: true, status: 200, data: [] });
    const ui = await StopListPage();
    render(ui);
    expect(screen.getByText('Стоп-лист пуст')).toBeInTheDocument();
    expect(screen.getByTestId('todays-widget').textContent).toBe('count:0');
    expect(screen.queryByTestId('stop-list-table')).not.toBeInTheDocument();
  });

  it('renders the widget and table when the stop list has items', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: { ru: 'A' },
          categoryName: { ru: 'C' },
          parentCategoryName: null,
          photoUrl: null,
          stoppedAt: new Date().toISOString(),
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: { ru: 'B' },
          categoryName: { ru: 'C' },
          parentCategoryName: null,
          photoUrl: null,
          stoppedAt: new Date().toISOString(),
        },
      ],
    });
    const ui = await StopListPage();
    render(ui);
    expect(screen.getByTestId('todays-widget').textContent).toBe('count:2');
    expect(screen.getByTestId('stop-list-table').textContent).toBe('rows:2');
  });

  it('redirects to /login when /v1/me is not an operator', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, status: 200, data: { kind: 'customer' } });
    await expect(StopListPage()).rejects.toThrow('redirect:/login');
  });
});
