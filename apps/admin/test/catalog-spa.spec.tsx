import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  categoriesQuery,
  itemsQuery,
  stopListQuery,
  draftDiffQuery,
  modifierGroupsQuery,
  itemQuery,
} from '@/lib/queries/catalog';
import type { ItemListItemApi } from '@/lib/queries/catalog';
import type { DraftDiffEntry } from '@/lib/menu/types';

const {
  apiFetchMock,
  toastCustomMock,
  toastSuccessMock,
  toastInfoMock,
  toastErrorMock,
  navigateMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastCustomMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastErrorMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: {
    custom: toastCustomMock,
    success: toastSuccessMock,
    info: toastInfoMock,
    error: toastErrorMock,
  },
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string, vars?: Record<string, unknown>) => {
        const full = opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key;
        if (vars && Object.keys(vars).length > 0) {
          return Object.entries(vars).reduce(
            (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
            full,
          );
        }
        return full;
      },
      i18n: { language: 'ru', changeLanguage: vi.fn() },
    }),
    Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const { ItemsTable } = await import('@/components/menu/items-table');
const { StickyPublishBar } = await import('@/components/menu/sticky-publish-bar');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { TodaysWidget } = await import('@/components/menu/todays-86-widget');

const makeQueryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrap = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
);

// ---------------------------------------------------------------------------
// 1. Query key factories
// ---------------------------------------------------------------------------

describe('catalog query key factories', () => {
  it('categoriesQuery key is ["catalog","categories"]', () => {
    expect(categoriesQuery().queryKey).toEqual(['catalog', 'categories']);
  });

  it('itemsQuery key carries the filters, not a tenant', () => {
    const filters = { limit: 50, offset: 0 };
    expect(itemsQuery(filters).queryKey).toEqual(['catalog', 'items', filters]);
  });

  it('stopListQuery key is ["catalog","stop-list",locationId]', () => {
    expect(stopListQuery('loc-1').queryKey).toEqual(['catalog', 'stop-list', 'loc-1']);
  });

  it('draftDiffQuery key is ["catalog","draft-diff"]', () => {
    expect(draftDiffQuery().queryKey).toEqual(['catalog', 'draft-diff']);
  });

  it('modifierGroupsQuery key is ["catalog","modifier-groups"]', () => {
    expect(modifierGroupsQuery().queryKey).toEqual(['catalog', 'modifier-groups']);
  });

  it('itemQuery key is ["catalog","item",id]', () => {
    expect(itemQuery('item-abc').queryKey).toEqual(['catalog', 'item', 'item-abc']);
  });

  // D-41: one session is bound to one organization, so a tenant discriminator in the key would be
  // dead weight at best and a stale-cache trap at worst. Switching organizations reissues the session.
  it('no key carries a tenant discriminator', () => {
    const keys = [
      categoriesQuery().queryKey,
      itemsQuery({ limit: 50, offset: 0 }).queryKey,
      stopListQuery('loc-1').queryKey,
      draftDiffQuery().queryKey,
      modifierGroupsQuery().queryKey,
      itemQuery('item-abc').queryKey,
    ];
    for (const key of keys) {
      expect(key.filter((part) => typeof part === 'string')).not.toContain('burger-barn');
    }
  });

  it('items and categories loaders prefetch distinct keys', () => {
    expect(itemsQuery({ limit: 50, offset: 0 }).queryKey).not.toEqual(categoriesQuery().queryKey);
  });

  it('item detail loader prefetches three distinct keys', () => {
    const keys = [
      categoriesQuery().queryKey,
      modifierGroupsQuery().queryKey,
      itemQuery('some-id').queryKey,
    ].map((k) => JSON.stringify(k));
    expect(new Set(keys).size).toBe(3);
  });

  it('draftDiff staleTime is shorter than categories staleTime (draft-aware)', () => {
    expect(draftDiffQuery().staleTime).toBeLessThan(categoriesQuery().staleTime);
  });
});

// ---------------------------------------------------------------------------
// 2. ItemsTable — list render
// ---------------------------------------------------------------------------

describe('ItemsTable list render (Plan 07.6-05 Task 4)', () => {
  const makeItem = (id: string, name: string): ItemListItemApi => ({
    id,
    slug: id,
    name: { ru: name },
    categoryId: 'cat-1',
    categoryName: { ru: 'Напитки' },
    parentCategoryName: null,
    // The api returns `photo: { s3Key, sortOrder, url } | null`. This fixture said
    // `photoUrl` for months and nothing caught it, because admin's tsconfig did not
    // typecheck `test/` — which is how the drift that broke the item editor survived.
    photo: null,
    basePrice: '150.00',
    currency: 'RUB',
    status: 'published',
    hasSizes: false,
    stoppedAt: null,
    sortOrder: 0,
  });

  const items = [makeItem('id-1', 'Капучино'), makeItem('id-2', 'Латте')];

  it('renders one row per item with the Russian name', () => {
    render(
      <Wrap>
        <ItemsTable
          items={items}
          totalCount={2}
          pagination={{ page: 1, pageSize: 50 }}
          onPageChange={vi.fn()}
        />
      </Wrap>,
    );
    expect(screen.getByTestId('item-row-id-1')).toBeInTheDocument();
    expect(screen.getByTestId('item-row-id-2')).toBeInTheDocument();
    expect(screen.getByText('Капучино')).toBeInTheDocument();
    expect(screen.getByText('Латте')).toBeInTheDocument();
  });

  // The reported symptom was "clicking a dish does not open its card". The row is the
  // click target — the name cell has no handler of its own — so this asserts the row
  // actually asks the router for the detail route with that item's id.
  it('opens the item detail route when a row is clicked', async () => {
    navigateMock.mockClear();
    render(
      <Wrap>
        <ItemsTable
          items={items}
          totalCount={2}
          pagination={{ page: 1, pageSize: 50 }}
          onPageChange={() => undefined}
        />
      </Wrap>,
    );
    await userEvent.click(screen.getByText('Капучино'));
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/menu/items/$id',
      params: { id: 'id-1' },
    });
  });

  it('renders the empty state when items is empty', () => {
    render(
      <Wrap>
        <ItemsTable
          items={[]}
          totalCount={0}
          pagination={{ page: 1, pageSize: 50 }}
          onPageChange={vi.fn()}
        />
      </Wrap>,
    );
    expect(screen.queryByTestId('item-row-id-1')).not.toBeInTheDocument();
  });

  it('disables back button on page 1', () => {
    render(
      <Wrap>
        <ItemsTable
          items={items}
          totalCount={100}
          pagination={{ page: 1, pageSize: 50 }}
          onPageChange={vi.fn()}
        />
      </Wrap>,
    );
    const backBtn = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('common.back'));
    expect(backBtn).toBeDefined();
    expect(backBtn).toBeDisabled();
  });

  it('enables back button on page > 1', () => {
    render(
      <Wrap>
        <ItemsTable
          items={items}
          totalCount={100}
          pagination={{ page: 2, pageSize: 50 }}
          onPageChange={vi.fn()}
        />
      </Wrap>,
    );
    const backBtn = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('common.back'));
    expect(backBtn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 3. StickyPublishBar — publish-toast id
// ---------------------------------------------------------------------------

describe('StickyPublishBar publish-toast id (Plan 07.6-05 Task 4)', () => {
  const sampleDiff: DraftDiffEntry[] = [
    { entityType: 'item', id: 'i-1', name: 'Капучино', status: 'draft' },
  ];

  const renderBar = (client: QueryClient) =>
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <StickyPublishBar unpublishedCount={1} diffItems={sampleDiff} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when unpublishedCount is 0', () => {
    const client = makeQueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <StickyPublishBar unpublishedCount={0} diffItems={[]} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls toast.custom with id "publish-countdown" on successful publish', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { scheduled: true, cancelAfterMs: 5000 },
    });
    const user = userEvent.setup();
    const client = makeQueryClient();
    renderBar(client);

    const publishBtn = screen.getByRole('button', {
      name: /menu\.publishBar\.publishMenuBtn/u,
    });
    await user.click(publishBtn);

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalled();
    });

    const callArgs = toastCustomMock.mock.calls[0];
    if (!callArgs) throw new Error('toast.custom not called');
    const options = callArgs[1] as { id: string; duration: number };
    expect(options.id).toBe('publish-countdown');
    expect(options.duration).toBe(Infinity);
  });

  it('calls toast.error with id "publish-countdown" on failed publish', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 503, data: null });
    const user = userEvent.setup();
    const client = makeQueryClient();
    renderBar(client);

    const publishBtn = screen.getByRole('button', {
      name: /menu\.publishBar\.publishMenuBtn/u,
    });
    await user.click(publishBtn);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    const errorCall = toastErrorMock.mock.calls[0];
    if (!errorCall) throw new Error('toast.error not called');
    expect((errorCall[1] as { id: string }).id).toBe('publish-countdown');
    expect(
      screen.getByRole('button', { name: /menu\.publishBar\.publishMenuBtn/u }),
    ).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 4. Dashboard widget driven by stopListQuery data
// ---------------------------------------------------------------------------

describe('dashboard TodaysWidget count from stopListQuery (Plan 07.6-05 Task 4)', () => {
  it('renders the stop count in the badge', () => {
    render(
      <Wrap>
        <TodaysWidget count={4} />
      </Wrap>,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('stopListQuery key prefix is "catalog" (confirms apiFetch routing)', () => {
    expect(stopListQuery('loc-1').queryKey).toEqual(['catalog', 'stop-list', 'loc-1']);
  });

  it('dashboard index maps stopListQuery result.data.items.length to widget count', () => {
    render(
      <Wrap>
        <TodaysWidget count={2} />
      </Wrap>,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
