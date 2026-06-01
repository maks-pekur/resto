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

vi.mock('../app/dashboard/(workspace)/menu/modifier-groups/modifier-groups-table-client', () => ({
  ModifierGroupsTableClient: (props: { items: readonly { id: string }[] }) => (
    <div data-testid="mg-table">rows:{props.items.length}</div>
  ),
}));

const { default: ModifierGroupsPage } =
  await import('../app/dashboard/(workspace)/menu/modifier-groups/page');

const VALID_ME = {
  ok: true,
  status: 200,
  data: { kind: 'operator', tenantId: 'tenant-1' },
};

describe('ModifierGroupsPage (Plan 04b-08 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(VALID_ME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty state when there are no groups', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [] } });
    const ui = await ModifierGroupsPage();
    render(ui);
    expect(screen.getByText('Нет групп модификаторов')).toBeInTheDocument();
    expect(screen.queryByTestId('mg-table')).not.toBeInTheDocument();
  });

  it('renders the table when groups exist', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: { ru: 'Соусы' },
            minSelectable: 0,
            maxSelectable: 3,
            optionCount: 4,
            usageCount: 6,
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: { ru: 'Сиропы' },
            minSelectable: 0,
            maxSelectable: 1,
            optionCount: 3,
            usageCount: 0,
          },
        ],
      },
    });
    const ui = await ModifierGroupsPage();
    render(ui);
    expect(screen.getByTestId('mg-table').textContent).toBe('rows:2');
  });

  it('redirects to /login when /v1/me is not an operator', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, status: 200, data: { kind: 'customer' } });
    await expect(ModifierGroupsPage()).rejects.toThrow('redirect:/login');
  });
});
