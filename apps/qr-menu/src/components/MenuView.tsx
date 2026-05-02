import type { MenuDto, MenuItemDto } from '../api/types';
import { localized, t } from '../i18n';
import { MenuItemCard } from './MenuItemCard';

interface Props {
  readonly menu: MenuDto;
  readonly onSelectItem: (id: string) => void;
}

/**
 * Top-level menu view: categories rendered as sections, each section's
 * items as a grid of cards. Empty menus get a friendly state instead of
 * a blank screen.
 */
export const MenuView = ({ menu, onSelectItem }: Props) => {
  const itemsByCategory = new Map<string, MenuItemDto[]>();
  for (const item of menu.items) {
    const list = itemsByCategory.get(item.categoryId);
    if (list) {
      list.push(item);
    } else {
      itemsByCategory.set(item.categoryId, [item]);
    }
  }

  if (menu.items.length === 0) {
    return (
      <main className="state state--empty">
        <h1>{t('menu.title')}</h1>
        <p>{t('menu.empty')}</p>
      </main>
    );
  }

  return (
    <main className="menu">
      <h1 className="menu__title">{t('menu.title')}</h1>
      {menu.categories.map((category) => {
        const items = itemsByCategory.get(category.id) ?? [];
        if (items.length === 0) return null;
        return (
          <section
            key={category.id}
            className="menu__section"
            aria-labelledby={`cat-${category.id}`}
          >
            <h2 id={`cat-${category.id}`}>{localized(category.name)}</h2>
            <ul className="menu__items">
              {items.map((item) => (
                <li key={item.id}>
                  <MenuItemCard item={item} onSelect={onSelectItem} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
};
