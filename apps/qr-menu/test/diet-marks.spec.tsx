import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DietMarks, GuestUiProvider, MenuScreen } from '@resto/ui';
import type { MenuDto } from '@resto/api-client/public';

const item = (
  over: Partial<MenuDto['items'][number]> & { id: string; name: Record<string, string> },
) => ({
  slug: over.id,
  categoryId: 'cat-1',
  description: null,
  basePrice: '100.00',
  currency: 'UAH',
  weight: null,
  measureUnit: null,
  imageUrl: null,
  photos: [],
  allergens: [],
  diets: [],
  sortOrder: 0,
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  sizes: [],
  modifierGroupIds: [],
  ...over,
});

const menu = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  currency: 'UAH',
  tenant: null,
  categories: [{ id: 'cat-1', slug: 'all', name: { ru: 'Всё' }, description: null, sortOrder: 0 }],
  items: [
    item({ id: 'margherita', name: { ru: 'Маргарита' }, diets: ['vegetarian'] }),
    item({ id: 'pepperoni', name: { ru: 'Пепперони' }, diets: ['spicy'] }),
    item({ id: 'potato', name: { ru: 'Картофель' }, diets: ['vegan'] }),
  ],
  modifierGroups: [],
} as unknown as MenuDto;

const renderMenu = () =>
  render(
    <GuestUiProvider locale="ru" t={(key) => key}>
      <MenuScreen menu={menu} stoppedItemIds={[]} stoppedIngredientIds={[]} />
    </GuestUiProvider>,
  );

/** Each card's heading, marks and all, in card order. */
const cardNames = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('h3')].map((heading) => heading.textContent);

describe('diet marks', () => {
  it('are emoji on a card, and stay readable to a screen reader', () => {
    const { container } = renderMenu();

    // The mark reads as part of the name, and the word behind it stays for a screen reader.
    expect(cardNames(container)).toEqual([
      'Маргарита🥗diet.vegetarian',
      'Пепперони🌶️diet.spicy',
      'Картофель🌱diet.vegan',
    ]);
  });
});

describe('what vegan implies', () => {
  it('marks a vegan dish once, with the stronger claim', () => {
    const { container } = renderMenu();

    expect(cardNames(container).filter((name) => name.includes('🌱'))).toHaveLength(1);
    expect(cardNames(container).some((name) => name.includes('🥗') && name.includes('🌱'))).toBe(
      false,
    );
  });
});

describe('a "free from" mark', () => {
  it('is the ingredient with a line through it, not two emoji', () => {
    const { container } = render(
      <GuestUiProvider locale="ru" t={(key) => key}>
        <DietMarks diets={['gluten_free']} />
      </GuestUiProvider>,
    );

    expect(container.textContent).toContain('🌾');
    expect(container.textContent).not.toContain('🚫');
    expect(container.querySelector('span.bg-destructive')).not.toBeNull();
  });
});
