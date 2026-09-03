import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IngredientApi, IngredientUsageApi } from '@/lib/queries/catalog';

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

const { IngredientStopDialog } = await import('@/components/menu/ingredient-stop-dialog');

const bacon: IngredientApi = {
  id: 'ing-1',
  name: { ru: 'Бекон', en: 'Bacon' },
  description: null,
  priceDelta: '80.00',
  imageUrl: null,
  imageS3Key: null,
  groupCount: 0,
  dishCount: 2,
};

const usage: IngredientUsageApi = {
  groups: [],
  dishesAttached: [{ id: 'dish-attached', name: { ru: 'Пицца' } }],
  dishesInComposition: [{ id: 'dish-comp', name: { ru: 'Бургер' } }],
};

const renderDialog = (onOpenChange = vi.fn()) => {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith('/v1/tenants/me')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        data: { locale: 'ru', contentLocales: ['ru'], defaultCurrency: 'RUB' },
      });
    }
    if (path.startsWith('/v1/catalog/modifier-options/')) {
      return Promise.resolve({ status: 200, ok: true, data: usage });
    }
    return Promise.resolve({ status: 200, ok: true, data: {} });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IngredientStopDialog
        ingredient={bacon}
        locationId="loc-1"
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('IngredientStopDialog', () => {
  it('renders only dishesInComposition entries, never dishesAttached', async () => {
    renderDialog();

    expect(await screen.findByText('Бургер')).toBeInTheDocument();
    expect(screen.queryByText('Пицца')).toBeNull();
  });

  it('nothing is ticked on open', async () => {
    renderDialog();

    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('stopIngredientOnlyBtn fires exactly one stop mutation with no dish ids', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Бургер');
    await user.click(screen.getByText('menu.stopList.stopIngredientOnlyBtn'));

    await waitFor(() => {
      const stopCalls = apiFetchMock.mock.calls.filter(
        (call: unknown[]) => call[0] === '/v1/catalog/stop-list/options',
      );
      expect(stopCalls).toHaveLength(1);
    });
    const itemStopCalls = apiFetchMock.mock.calls.filter(
      (call: unknown[]) => call[0] === '/v1/catalog/stop-list',
    );
    expect(itemStopCalls).toHaveLength(0);
    const optionsCall = apiFetchMock.mock.calls.find(
      (call: unknown[]) => call[0] === '/v1/catalog/stop-list/options',
    ) as [string, { body?: { optionId?: string } }];
    expect(optionsCall[1].body).toEqual({ optionId: 'ing-1' });
  });
});
