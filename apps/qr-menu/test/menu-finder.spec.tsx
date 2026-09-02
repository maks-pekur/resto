import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
      <MenuScreen menu={menu} stoppedItemIds={[]} />
    </GuestUiProvider>,
  );

/** Every diet mark drawn over a photo, in card order. */
const cardMarks = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('li[class*=backdrop-blur]')].map((li) => li.textContent);

describe('finding a dish', () => {
  it('narrows the menu to what the guest typed', () => {
    renderMenu();
    expect(screen.getByText('Пепперони')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('finder.searchLabel'), {
      target: { value: 'марг' },
    });

    expect(screen.getByText('Маргарита')).toBeInTheDocument();
    expect(screen.queryByText('Пепперони')).not.toBeInTheDocument();
  });

  it('filters by what the guest can eat, and offers only labels the menu uses', () => {
    renderMenu();
    expect(screen.queryByTestId('diet-halal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('diet-vegetarian'));

    expect(screen.getByText('Маргарита')).toBeInTheDocument();
    expect(screen.queryByText('Пепперони')).not.toBeInTheDocument();
  });
});

describe('diet marks', () => {
  it('are emoji on a card, and stay readable to a screen reader', () => {
    const { container } = renderMenu();

    // One label per dish: a salad on the margherita, a chilli on the pepperoni, a sprout on
    // the potato.
    expect(cardMarks(container)).toEqual(['🥗diet.vegetarian', '🌶️diet.spicy', '🌱diet.vegan']);
  });
});

describe('what vegan implies', () => {
  it('shows a vegan dish to someone filtering for vegetarian', () => {
    renderMenu();

    fireEvent.click(screen.getByTestId('diet-vegetarian'));

    expect(screen.getByText('Маргарита')).toBeInTheDocument();
    expect(screen.getByText('Картофель')).toBeInTheDocument();
  });

  it('marks a vegan dish once, with the stronger claim', () => {
    const { container } = renderMenu();

    expect(cardMarks(container).filter((mark) => mark.includes('🌱'))).toHaveLength(1);
    expect(cardMarks(container).some((mark) => mark.includes('🥗') && mark.includes('🌱'))).toBe(
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
