import type { MenuItemDto } from '@resto/api-client/public';
import { localized, t } from '../i18n';

interface Props {
  readonly item: MenuItemDto;
  readonly onSelect: (id: string) => void;
  readonly isStopListed?: boolean;
}

export const MenuItemCard = ({ item, onSelect, isStopListed = false }: Props) => {
  const onActivate = (): void => {
    if (isStopListed) return;
    onSelect(item.id);
  };
  return (
    <button
      type="button"
      className={['menu-item', isStopListed ? 'menu-item--disabled' : ''].join(' ').trim()}
      onClick={onActivate}
      aria-label={localized(item.name)}
      aria-disabled={isStopListed ? 'true' : undefined}
    >
      {item.imageUrl ? (
        <img
          className="menu-item__image"
          src={item.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="menu-item__image menu-item__image--placeholder" aria-hidden="true" />
      )}
      <div className="menu-item__body">
        <h3 className="menu-item__name">{localized(item.name)}</h3>
        {item.description && (
          <p className="menu-item__description">{localized(item.description)}</p>
        )}
        {isStopListed ? (
          <p className="menu-item__unavailable">{t('item.unavailable')}</p>
        ) : (
          <p className="menu-item__price" aria-label={`${item.basePrice} ${item.currency}`}>
            {t('item.priceFrom', { price: item.basePrice, currency: item.currency })}
          </p>
        )}
      </div>
    </button>
  );
};
