import { useCartStore, selectSubtotal } from '@resto/cart';
import { t } from '../i18n';
import { CartLineItem } from './CartLineItem';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currency: string;
}

export const CartDrawer = ({ open, onClose, currency }: Props) => {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const clearCart = useCartStore((s) => s.clearCart);
  const table = useCartStore((s) => s.table);

  return (
    <div className={['cart-drawer', open ? 'cart-drawer--open' : ''].join(' ').trim()}>
      <div className="cart-drawer__backdrop" aria-hidden="true" onClick={onClose} />
      <aside className="cart-drawer__panel" role="dialog" aria-label={t('cart.title')}>
        <header className="cart-drawer__header">
          <h2>{t('cart.title')}</h2>
          <button type="button" className="cart-drawer__close" onClick={onClose}>
            {t('cart.close')}
          </button>
        </header>

        {items.length === 0 ? (
          <p className="cart-drawer__empty">{t('cart.empty')}</p>
        ) : (
          <>
            <ul className="cart-drawer__items">
              {items.map((item) => (
                <li key={`${item.itemId}:${item.sizeId ?? 'base'}`}>
                  <CartLineItem item={item} />
                </li>
              ))}
            </ul>
            <footer className="cart-drawer__footer">
              {table && <p className="cart-drawer__table">{t('cart.table', { table })}</p>}
              <div className="cart-drawer__subtotal" aria-label={`${subtotal} ${currency}`}>
                <span>{t('cart.subtotal')}</span>
                <span>
                  {subtotal} {currency}
                </span>
              </div>
              <button
                type="button"
                className="cart-drawer__clear"
                onClick={() => {
                  clearCart();
                }}
              >
                {t('cart.clear')}
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
};
