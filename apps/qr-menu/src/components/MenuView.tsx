import type { MenuDto, MenuItemDto } from '@resto/api-client/public';
import { localized, t } from '../i18n';
import { MenuItemCard } from './MenuItemCard';

interface Props {
  readonly menu: MenuDto;
  readonly onSelectItem: (id: string) => void;
  readonly onOpenCart: () => void;
}

export const MenuView = ({ menu, onSelectItem, onOpenCart }: Props) => {
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
      <header className="menu__header">
        <div className="menu__brand">
          {menu.brand?.theme?.logoUrl ? (
            <img
              className="menu__logo"
              src={menu.brand.theme.logoUrl}
              alt={menu.brand.displayName}
            />
          ) : null}
          <h1 className="menu__title">{menu.brand ? menu.brand.displayName : t('menu.title')}</h1>
        </div>
        <button type="button" className="cart-trigger" onClick={onOpenCart}>
          {t('cart.open')}
        </button>
      </header>
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
