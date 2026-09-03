import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ModifierApi, ModifierListResponse } from '@/lib/queries/catalog';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'ru', changeLanguage: vi.fn() },
    }),
  };
});

const { ModifierTable } = await import('@/components/menu/modifier-table');

const bacon: ModifierApi = {
  id: 'ing-1',
  name: { ru: 'Бекон', en: 'Bacon' },
  description: null,
  priceDelta: '80.00',
  imageUrl: 'https://cdn.example.com/bacon.jpg',
  imageS3Key: 'modifiers/bacon.jpg',
  groupCount: 2,
  dishCount: 3,
};

const onion: ModifierApi = {
  id: 'ing-2',
  name: { ru: 'Лук', en: 'Onion' },
  description: null,
  priceDelta: '0.00',
  imageUrl: null,
  imageS3Key: null,
  groupCount: 0,
  dishCount: 0,
};

const renderTable = (modifiers: readonly ModifierApi[]) => {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith('/v1/tenants/me')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        data: { locale: 'ru', contentLocales: ['ru'], defaultCurrency: 'RUB' },
      });
    }
    const body: ModifierListResponse = { items: modifiers };
    return Promise.resolve({ status: 200, ok: true, data: body });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ModifierTable onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('ModifierTable', () => {
  it('renders one row per modifier in the library', async () => {
    renderTable([bacon, onion]);

    expect(await screen.findByTestId('modifier-row-ing-1')).toBeInTheDocument();
    expect(screen.getByTestId('modifier-row-ing-2')).toBeInTheDocument();
  });

  it('renders the placeholder icon, not a broken image, when imageUrl is null', async () => {
    renderTable([onion]);

    const row = await screen.findByTestId('modifier-row-ing-2');
    expect(screen.getByTestId('modifier-photo-placeholder-ing-2')).toBeInTheDocument();
    expect(row.querySelector('img')).toBeNull();
  });

  it('renders the empty state when the library has no modifiers', async () => {
    renderTable([]);

    expect(await screen.findByText('menu.modifiers.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('menu.modifiers.emptyDescription')).toBeInTheDocument();
  });
});
