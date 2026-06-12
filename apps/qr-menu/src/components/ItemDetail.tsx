import { useMemo, useState } from 'react';
import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import { useCartStore, parseMinorUnits, formatMinorUnits } from '@resto/cart';
import type { CartModifier } from '@resto/cart';
import { localized, t } from '../i18n';

interface Props {
  readonly item: MenuItemDto;
  readonly groups: readonly MenuModifierGroupDto[];
  readonly onBack: () => void;
}

const isRadioGroup = (group: MenuModifierGroupDto): boolean =>
  group.minSelectable === 1 && group.maxSelectable === 1 && group.isRequired;

export const ItemDetail = ({ item, groups, onBack }: Props) => {
  const defaultSizeId = item.sizes.find((s) => s.isDefault)?.id ?? item.sizes[0]?.id ?? null;
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Map<string, Set<string>>>(new Map());

  const effectiveSizeId = selectedSizeId ?? defaultSizeId;

  const livePrice = useMemo(() => {
    let base = parseMinorUnits(item.basePrice);
    if (effectiveSizeId) {
      const size = item.sizes.find((s) => s.id === effectiveSizeId);
      if (size) base = parseMinorUnits(size.price);
    }
    for (const group of groups) {
      const chosen = selectedOptions.get(group.id);
      if (!chosen) continue;
      for (const opt of group.options) {
        if (chosen.has(opt.id)) base += parseMinorUnits(opt.priceDelta);
      }
    }
    return formatMinorUnits(base);
  }, [item, effectiveSizeId, groups, selectedOptions]);

  const toggleOption = (groupId: string, optionId: string, isRadio: boolean): void => {
    setSelectedOptions((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(groupId) ?? []);
      if (isRadio) {
        next.set(groupId, new Set([optionId]));
      } else {
        if (current.has(optionId)) {
          current.delete(optionId);
        } else {
          current.add(optionId);
        }
        next.set(groupId, current);
      }
      return next;
    });
  };

  const handleAddToCart = (): void => {
    const modifiers: CartModifier[] = [];
    for (const group of groups) {
      const chosen = selectedOptions.get(group.id);
      if (!chosen) continue;
      for (const opt of group.options) {
        if (chosen.has(opt.id)) {
          modifiers.push({
            optionId: opt.id,
            name: localized(opt.name),
            priceDelta: opt.priceDelta,
            modifierGroupId: group.id,
            amount: 1,
          });
        }
      }
    }
    useCartStore.getState().addItem({
      itemId: item.id,
      sizeId: effectiveSizeId,
      name: localized(item.name),
      unitPrice: livePrice,
      currency: item.currency,
      modifiers,
    });
    onBack();
  };

  return (
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
      {item.sizes.length > 0 && (
        <ul className="item__variants">
          {item.sizes.map((size) => {
            const isSelected = effectiveSizeId === size.id;
            return (
              <li key={size.id}>
                <label className="item-modifier-option">
                  <input
                    type="radio"
                    name={`size-${item.id}`}
                    value={size.id}
                    checked={isSelected}
                    onChange={() => {
                      setSelectedSizeId(size.id);
                    }}
                  />
                  <span>{localized(size.name)}</span>
                  <span>
                    {size.price} {item.currency}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {groups.length > 0 && (
        <div className="item-modifiers">
          {groups.map((group) => {
            const isRadio = isRadioGroup(group);
            const chosen = selectedOptions.get(group.id);
            return (
              <fieldset key={group.id} className="item-modifier-group">
                <legend>{localized(group.name)}</legend>
                {group.options.map((opt) => {
                  const isChecked = chosen?.has(opt.id) ?? false;
                  return (
                    <label key={opt.id} className="item-modifier-option">
                      <input
                        type={isRadio ? 'radio' : 'checkbox'}
                        name={isRadio ? `modifier-${group.id}` : undefined}
                        value={opt.id}
                        checked={isChecked}
                        onChange={() => {
                          toggleOption(group.id, opt.id, isRadio);
                        }}
                      />
                      <span>{localized(opt.name)}</span>
                      {parseMinorUnits(opt.priceDelta) !== 0 && (
                        <span>
                          {opt.priceDelta} {item.currency}
                        </span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
        </div>
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
      <div className="item-live-price" aria-label={`${livePrice} ${item.currency}`}>
        {livePrice} {item.currency}
      </div>
      <button type="button" className="item-add-btn" onClick={handleAddToCart}>
        {t('item.addToCart')}
      </button>
    </main>
  );
};
