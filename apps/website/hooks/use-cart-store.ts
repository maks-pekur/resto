import { useEffect, useState } from 'react';
import { useCartStore, selectSubtotal, selectItemCount } from '@resto/cart';

export { useCartStore, selectSubtotal, selectItemCount };

export function useHasHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    setHasHydrated(true);
  }, []);
  return hasHydrated;
}
