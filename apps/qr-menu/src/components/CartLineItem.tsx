import { useCartStore, parseMinorUnits, formatMinorUnits } from '@resto/cart';
import type { CartLineItem as CartLineItemType } from '@resto/cart';
import { t } from '../i18n';

const lineTotal = (item: CartLineItemType): string => {
  let cost = parseMinorUnits(item.unitPrice);
  for (const mod of item.modifiers) {
    cost += parseMinorUnits(mod.priceDelta);
  }
  return formatMinorUnits(cost * item.quantity);
};

interface Props {
  readonly item: CartLineItemType;
}

export const CartLineItem = ({ item }: Props) => {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const total = lineTotal(item);

  return (
    <div className="cart-line-item">
      <div className="cart-line-item__info">
        <p className="cart-line-item__name">{item.name}</p>
        {item.modifiers.length > 0 && (
          <p className="cart-line-item__modifiers">
            {item.modifiers.map((m) => m.name).join(', ')}
          </p>
        )}
      </div>
      <div className="cart-line-item__qty">
        <button
          type="button"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, -1);
          }}
          aria-label={t('item.qtyDecrease', { name: item.name })}
        >
          −
        </button>
        <span>{item.quantity}</span>
        <button
          type="button"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, 1);
          }}
          aria-label={t('item.qtyIncrease', { name: item.name })}
        >
          +
        </button>
      </div>
      <span className="cart-line-item__total" aria-label={`${total} ${item.currency}`}>
        {total} {item.currency}
      </span>
      <button
        type="button"
        className="cart-line-item__remove"
        onClick={() => {
          removeItem(item.itemId, item.sizeId);
        }}
        aria-label={t('item.remove', { name: item.name })}
      >
        ✕
      </button>
    </div>
  );
};
