import type { MenuItemDto } from '../api/types';
import { localized, t } from '../i18n';

interface Props {
  readonly item: MenuItemDto;
  readonly onSelect: (id: string) => void;
}

/**
 * Single menu-item tile. Lazy-loads the image; the placeholder keeps
 * layout stable while the photo arrives, which matters for LCP on slow
 * cellular connections.
 */
export const MenuItemCard = ({ item, onSelect }: Props) => {
  const onActivate = (): void => {
    onSelect(item.id);
  };
  return (
    <button
      type="button"
      className="menu-item"
      onClick={onActivate}
      aria-label={localized(item.name)}
    >
      {item.imageS3Key ? (
        <img
          className="menu-item__image"
          src={item.imageS3Key}
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
        <p className="menu-item__price" aria-label={`${item.basePrice} ${item.currency}`}>
          {t('item.priceFrom', { price: item.basePrice, currency: item.currency })}
        </p>
      </div>
    </button>
  );
};
