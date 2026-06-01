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

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/item-editor-shell-client', () => ({
  ItemEditorShellClient: (props: {
    itemId: string;
    initialItem: { name?: Record<string, string> } | null;
    defaultCurrency: string;
  }) => (
    <div data-testid="shell">
      <span data-testid="itemId">{props.itemId}</span>
      <span data-testid="hasItem">{props.initialItem ? 'yes' : 'no'}</span>
      <span data-testid="currency">{props.defaultCurrency}</span>
    </div>
  ),
}));

const { default: ItemEditorPage } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/page');

const VALID_ME = {
  ok: true,
  status: 200,
  data: { kind: 'operator', tenantId: 'tenant-1' },
};

describe('ItemEditorPage (Plan 04b-07 Task 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(VALID_ME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the shell with itemId='new' and no initialItem for /items/new", async () => {
    apiFetchInternalMock.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [] } });
    const ui = await ItemEditorPage({ params: Promise.resolve({ id: 'new' }) });
    render(ui as React.ReactElement);
    expect(screen.getByTestId('itemId').textContent).toBe('new');
    expect(screen.getByTestId('hasItem').textContent).toBe('no');
  });

  it('renders prefilled shell for an existing item id', async () => {
    const ITEM_ID = '11111111-1111-4111-8111-111111111111';
    apiFetchInternalMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          id: ITEM_ID,
          name: { ru: 'Капучино' },
          description: null,
          categoryId: 'cat-1',
          basePrice: '4.50',
          currency: 'EUR',
          allergens: [],
          proteins: null,
          fats: null,
          carbs: null,
          kcal: null,
          nutritionEstimated: false,
          source: 'manual',
          photos: [],
          slug: 'kapuchino',
          status: 'draft',
          sizes: [],
          modifierGroupIds: [],
        },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { items: [] } });
    const ui = await ItemEditorPage({ params: Promise.resolve({ id: ITEM_ID }) });
    render(ui as React.ReactElement);
    expect(screen.getByTestId('itemId').textContent).toBe(ITEM_ID);
    expect(screen.getByTestId('hasItem').textContent).toBe('yes');
    expect(screen.getByTestId('currency').textContent).toBe('EUR');
  });

  it('renders not-found EmptyState when api returns 404', async () => {
    const ITEM_ID = '11111111-1111-4111-8111-111111111111';
    apiFetchInternalMock
      .mockResolvedValueOnce({ ok: false, status: 404, data: null })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { items: [] } });
    const ui = await ItemEditorPage({ params: Promise.resolve({ id: ITEM_ID }) });
    render(ui as React.ReactElement);
    expect(screen.getByText('Блюдо не найдено')).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('redirects to /login when /v1/me is not an operator', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, status: 200, data: { kind: 'customer' } });
    await expect(ItemEditorPage({ params: Promise.resolve({ id: 'new' }) })).rejects.toThrow(
      'redirect:/login',
    );
  });
});
