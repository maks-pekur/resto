'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const BRAND_TAB_SYNC_STORAGE_KEY = 'resto.active_brand_changed_at';

/**
 * Listens for `storage` events on the active-brand signal key written
 * by other tabs and re-renders the current dashboard so the sidebar +
 * any RSC tree picks up the new cookie. Mounted once at the layout
 * level. The trigger key carries a wall-clock timestamp string — the
 * value itself is irrelevant; the event is the signal.
 */
export function BrandTabSync() {
  const router = useRouter();
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== BRAND_TAB_SYNC_STORAGE_KEY) return;
      router.refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [router]);
  return null;
}
