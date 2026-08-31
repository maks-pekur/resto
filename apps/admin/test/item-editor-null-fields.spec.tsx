import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ItemDetailApi } from '@/lib/queries/catalog';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-i18next');
  return {
    ...actual,
    useTranslation: (_ns?: string, opts?: { keyPrefix?: string }) => ({
      t: (key: string) => (opts?.keyPrefix ? `${opts.keyPrefix}.${key}` : key),
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  };
});

const { ItemEditorShell } = await import('@/components/menu/item-editor-shell');

// The exact shape `GET /v1/catalog/items/:id` returns for an item that never had
// allergens or ingredients filled in — verified live against the dev api. The api
// declares both `.nullable()` in ItemDetailResponseSchema, and a seeded drink really
// does come back with null. A fixture using `[]` here proves nothing: the crash was
// `[...null]` in valuesFromItem, and only a real null reaches it.
const ITEM_WITH_NULL_FIELDS = {
  id: 'a27602f6-69ef-4f6a-afe7-4376f70a5e04',
  categoryId: 'aea186f2-be9e-418f-951f-4c6c9d60425e',
  slug: 'cola',
  name: { en: 'Cola 0.5 l', ru: 'Кола 0,5 л' },
  description: null,
  basePrice: '45.00',
  currency: 'UAH',
  status: 'published',
  allergens: null,
  ingredients: null,
  metaTitle: null,
  metaDescription: null,
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  photos: [],
  source: 'manual',
  needsReview: false,
  sourceExternalId: null,
  sortOrder: 0,
  sizes: [],
  modifierGroupIds: [],
} as unknown as ItemDetailApi;

const renderShell = (item: ItemDetailApi): void => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ItemEditorShell
        title="Cola 0.5 l"
        initialItem={item}
        categories={[]}
        itemId={item.id}
        defaultCurrency="UAH"
        availableModifierGroups={[]}
      />
    </QueryClientProvider>,
  );
};

describe('ItemEditorShell with the api’s real null fields', () => {
  it('renders an item whose allergens and ingredients are null', () => {
    expect(() => {
      renderShell(ITEM_WITH_NULL_FIELDS);
    }).not.toThrow();
    expect(screen.getByText('Cola 0.5 l')).toBeInTheDocument();
  });

  // Real shape from `GET /v1/catalog/items/:id` for a pizza: a size's `name` is a
  // localized object and its `price` is a decimal string, not a plain string and a
  // number. The editor treated them as the latter, so `.trim()` and `.toFixed()` blew
  // up on any item that actually has sizes — Cola has none, which is why the crash hid.
  it('renders an item that has sizes', () => {
    expect(() => {
      renderShell({
        ...ITEM_WITH_NULL_FIELDS,
        sizes: [
          {
            id: 's-1',
            name: { en: '30 cm', ru: '30 см' },
            price: '249.00',
            isDefault: true,
            sortOrder: 0,
          },
          {
            id: 's-2',
            name: { en: '40 cm', ru: '40 см' },
            price: '349.00',
            isDefault: false,
            sortOrder: 1,
          },
        ],
      });
    }).not.toThrow();
  });

  it('still renders when the arrays are present', () => {
    expect(() => {
      renderShell({
        ...ITEM_WITH_NULL_FIELDS,
        allergens: ['gluten'],
        ingredients: ['water'],
      });
    }).not.toThrow();
  });
});
