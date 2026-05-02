import type { MenuItemDto } from '../api/types';
import { localized, t } from '../i18n';

interface Props {
  readonly item: MenuItemDto;
  readonly onBack: () => void;
}

export const ItemDetail = ({ item, onBack }: Props) => (
  <main className="item">
    <button type="button" className="item__back" onClick={onBack}>
      ← {t('item.back')}
    </button>
    {item.imageUrl ? (
      <img className="item__image" src={item.imageUrl} alt="" loading="lazy" />
    ) : (
      <div className="item__image item__image--placeholder" aria-hidden="true" />
    )}
    <h1 className="item__name">{localized(item.name)}</h1>
    {item.description && <p className="item__description">{localized(item.description)}</p>}
    <p className="item__price" aria-label={`${item.basePrice} ${item.currency}`}>
      <span>{item.basePrice}</span> <span>{item.currency}</span>
    </p>
    {item.variants.length > 0 && (
      <ul className="item__variants">
        {item.variants.map((variant) => (
          <li key={variant.id} className={variant.isDefault ? 'is-default' : undefined}>
            <span>{localized(variant.name)}</span>
            {variant.priceDelta !== '0' && (
              <span>
                {variant.priceDelta.startsWith('-') ? '' : '+'}
                {variant.priceDelta} {item.currency}
              </span>
            )}
            {variant.isDefault && <em> · {t('item.variant.default')}</em>}
          </li>
        ))}
      </ul>
    )}
    {item.allergens.length > 0 && (
      <section className="item__allergens" aria-labelledby="allergens-heading">
        <h2 id="allergens-heading">{t('item.allergens')}</h2>
        <ul>
          {item.allergens.map((allergen) => (
            <li key={allergen}>{allergen}</li>
          ))}
        </ul>
      </section>
    )}
  </main>
);
