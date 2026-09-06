import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ModifierApi, ModifierListResponse } from '@/lib/queries/catalog';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

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

const { ItemModifierGroupsCard } = await import('@/components/menu/item-modifier-groups-card');

const bacon: ModifierApi = {
  id: 'ing-1',
  name: { ru: 'Бекон', en: 'Bacon' },
  description: null,
  priceDelta: '80.00',
  imageUrl: null,
  imageS3Key: null,
  groupCount: 0,
  dishCount: 0,
};

const renderCard = (initialModifierIds: readonly string[]): void => {
  apiFetchMock.mockImplementation((path: string) => {
    if (path === '/v1/tenants/me') {
      return Promise.resolve({
        status: 200,
        ok: true,
        data: { locale: 'ru', contentLocales: ['ru'], defaultCurrency: 'RUB' },
      });
    }
    if (path === '/v1/catalog/modifier-options') {
      const body: ModifierListResponse = { items: [bacon] };
      return Promise.resolve({ status: 200, ok: true, data: body });
    }
    return Promise.resolve({ status: 200, ok: true, data: null });
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ItemModifierGroupsCard
        itemId="item-1"
        initialModifierGroupIds={[]}
        initialModifierIds={initialModifierIds}
        availableGroups={[]}
      />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('ItemModifierGroupsCard', () => {
  it('repopulates the singles chip row from initialModifierIds on mount (GAP 2 fix)', async () => {
    renderCard(['ing-1']);

    expect(await screen.findByTestId('modifier-chip-ing-1')).toBeInTheDocument();
  });

  it('renders no singles chips when initialModifierIds is empty', () => {
    renderCard([]);

    expect(screen.queryByTestId('modifier-chip-ing-1')).not.toBeInTheDocument();
  });
});
