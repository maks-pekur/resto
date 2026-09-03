import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IngredientApi, IngredientListResponse } from '@/lib/queries/catalog';

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

const { IngredientCardGrid } = await import('@/components/menu/ingredient-card-grid');

const bacon: IngredientApi = {
  id: 'ing-1',
  name: { ru: 'Бекон', en: 'Bacon' },
  description: null,
  priceDelta: '80.00',
  imageUrl: 'https://cdn.example.com/bacon.jpg',
  imageS3Key: 'ingredients/bacon.jpg',
  groupCount: 2,
  dishCount: 3,
};

const onion: IngredientApi = {
  id: 'ing-2',
  name: { ru: 'Лук', en: 'Onion' },
  description: null,
  priceDelta: '0.00',
  imageUrl: null,
  imageS3Key: null,
  groupCount: 0,
  dishCount: 0,
};

const renderGrid = (ingredients: readonly IngredientApi[]) => {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith('/v1/tenants/me')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        data: { locale: 'ru', contentLocales: ['ru'], defaultCurrency: 'RUB' },
      });
    }
    const body: IngredientListResponse = { items: ingredients };
    return Promise.resolve({ status: 200, ok: true, data: body });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IngredientCardGrid onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('IngredientCardGrid', () => {
  it('renders one card per ingredient in the library', async () => {
    renderGrid([bacon, onion]);

    expect(await screen.findByTestId('ingredient-card-ing-1')).toBeInTheDocument();
    expect(screen.getByTestId('ingredient-card-ing-2')).toBeInTheDocument();
  });

  it('renders the placeholder icon, not a broken image, when imageUrl is null', async () => {
    renderGrid([onion]);

    const card = await screen.findByTestId('ingredient-card-ing-2');
    expect(screen.getByTestId('ingredient-photo-placeholder-ing-2')).toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
  });

  it('renders the empty state when the library has no ingredients', async () => {
    renderGrid([]);

    expect(await screen.findByText('menu.ingredients.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('menu.ingredients.emptyDescription')).toBeInTheDocument();
  });
});
