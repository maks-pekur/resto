import { useCartStore } from '@resto/cart';
import { t } from '../i18n';

const TABLE_MAX_LENGTH = 32;

export const sanitizeTable = (raw: string): string | null => {
  const trimmed = raw.trim().slice(0, TABLE_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

/** Read-only: the table comes from the QR code on the table itself, never from
 * the guest typing it in. */
export const TableBanner = () => {
  const table = useCartStore((s) => s.table);

  if (!table) return null;

  return (
    <div className="bg-muted border-b">
      <div className="mx-auto flex max-w-7xl items-center px-4 py-2.5 sm:px-6">
        <span className="text-sm font-bold">{t('table.current', { table })}</span>
      </div>
    </div>
  );
};
