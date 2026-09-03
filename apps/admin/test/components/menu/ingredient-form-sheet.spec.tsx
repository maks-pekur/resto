import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IngredientApi } from '@/lib/queries/catalog';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

const { IngredientFormSheet } = await import('@/components/menu/ingredient-form-sheet');

const bacon: IngredientApi = {
  id: 'ing-1',
  name: { ru: 'Бекон', en: 'Bacon' },
  description: null,
  priceDelta: '80.00',
  imageUrl: 'https://cdn.example.com/bacon.jpg',
  imageS3Key: 'ingredients/bacon.jpg',
  groupCount: 0,
  dishCount: 0,
};

const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const renderSheet = (): void => {
  apiFetchMock.mockImplementation((path: string) => {
    if (path === '/v1/tenants/me') {
      return Promise.resolve({
        status: 200,
        ok: true,
        data: { locale: 'ru', contentLocales: ['ru'], defaultCurrency: 'RUB' },
      });
    }
    if (path.endsWith('/usage')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        data: { groups: [], dishesAttached: [], dishesInComposition: [] },
      });
    }
    return Promise.resolve({ status: 200, ok: true, data: { id: bacon.id } });
  });

  render(
    <QueryClientProvider client={makeQueryClient()}>
      <IngredientFormSheet open onOpenChange={vi.fn()} ingredient={bacon} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('IngredientFormSheet', () => {
  it('saving without touching the photo control preserves the existing imageS3Key (GAP 1 fix)', async () => {
    renderSheet();

    await userEvent.click(await screen.findByRole('button', { name: 'menu.ingredients.saveBtn' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/v1/catalog/modifier-options',
        expect.objectContaining({
          method: 'POST',
          body: {
            name: { ru: 'Бекон', en: 'Bacon' },
            description: null,
            priceDelta: '80.00',
            imageS3Key: 'ingredients/bacon.jpg',
            id: 'ing-1',
          },
        }),
      );
    });
  });
});
