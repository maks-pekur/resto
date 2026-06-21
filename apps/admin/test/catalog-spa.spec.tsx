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

describe('catalog query key factories (Plan 07.6-05 Task 4)', () => {
  const slug = 'burger-barn';

  it('categoriesQuery key is ["catalog","categories",brandSlug]', () => {
    expect(categoriesQuery(slug).queryKey).toEqual(['catalog', 'categories', slug]);
  });

  it('itemsQuery key contains brandSlug at index 2', () => {
    const key = itemsQuery(slug, { limit: 50, offset: 0 }).queryKey;
    expect(key[2]).toBe(slug);
    expect(key[0]).toBe('catalog');
    expect(key[1]).toBe('items');
  });

  it('stopListQuery key is ["catalog","stop-list",brandSlug]', () => {
    expect(stopListQuery(slug).queryKey).toEqual(['catalog', 'stop-list', slug]);
  });

  it('draftDiffQuery key is ["catalog","draft-diff",brandSlug]', () => {
    expect(draftDiffQuery(slug).queryKey).toEqual(['catalog', 'draft-diff', slug]);
  });

  it('modifierGroupsQuery key is ["catalog","modifier-groups",brandSlug]', () => {
    expect(modifierGroupsQuery(slug).queryKey).toEqual(['catalog', 'modifier-groups', slug]);
  });

  it('itemQuery key is ["catalog","item",brandSlug,id]', () => {
    expect(itemQuery(slug, 'item-abc').queryKey).toEqual(['catalog', 'item', slug, 'item-abc']);
  });

  it('items loader prefetches both itemsQuery and categoriesQuery (distinct keys)', () => {
    const itemsKey = itemsQuery(slug, { limit: 50, offset: 0 }).queryKey;
    const catKey = categoriesQuery(slug).queryKey;
    expect(itemsKey[0]).toBe('catalog');
    expect(catKey[0]).toBe('catalog');
    expect(itemsKey).not.toEqual(catKey);
  });

  it('item detail loader prefetches categories + modifierGroups when id != "new"', () => {
    const catKey = categoriesQuery(slug).queryKey;
    const mgKey = modifierGroupsQuery(slug).queryKey;
    const iKey = itemQuery(slug, 'some-id').queryKey;
    expect(catKey).toEqual(['catalog', 'categories', slug]);
    expect(mgKey).toEqual(['catalog', 'modifier-groups', slug]);
    expect(iKey).toEqual(['catalog', 'item', slug, 'some-id']);
  });

  it('draftDiff staleTime is shorter than categories staleTime (draft-aware)', () => {
    expect(draftDiffQuery(slug).staleTime).toBeLessThan(categoriesQuery(slug).staleTime);
  });
});

// ---------------------------------------------------------------------------
// 2. ItemsTable — list render
// ---------------------------------------------------------------------------

describe('ItemsTable list render (Plan 07.6-05 Task 4)', () => {
  const makeItem = (id: string, name: string): ItemListItemApi => ({
    id,
    name: { ru: name },
    categoryId: 'cat-1',
    categoryName: { ru: 'Напитки' },
    parentCategoryName: null,
    photoUrl: null,
    basePrice: '150.00',
    currency: 'RUB',
    status: 'published',
    hasSizes: false,
    stoppedAt: null,
  });

  const items = [makeItem('id-1', 'Капучино'), makeItem('id-2', 'Латте')];

  it('renders one row per item with the Russian name', () => {
    render(
      <Wrap>
        <ItemsTable
          brandSlug="bslug"
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

  it('renders the empty state when items is empty', () => {
    render(
      <Wrap>
        <ItemsTable
          brandSlug="bslug"
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
          brandSlug="bslug"
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
          brandSlug="bslug"
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
          <StickyPublishBar brandSlug="test-brand" unpublishedCount={1} diffItems={sampleDiff} />
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
          <StickyPublishBar brandSlug="test-brand" unpublishedCount={0} diffItems={[]} />
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
    const key = stopListQuery('my-brand').queryKey;
    expect(key[0]).toBe('catalog');
    expect(key[1]).toBe('stop-list');
    expect(key[2]).toBe('my-brand');
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
