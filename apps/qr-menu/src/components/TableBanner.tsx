import { useCartStore } from '@resto/cart';
import { t } from '../i18n';

export interface TableBannerProps {
  readonly notRecognized?: boolean;
}

/** Read-only: the table comes from the QR code on the table itself, resolved
 * server-side — the guest never types a table number. */
export const TableBanner = ({ notRecognized = false }: TableBannerProps) => {
  const zoneName = useCartStore((s) => s.tableZoneName);
  const number = useCartStore((s) => s.tableNumber);

  if (notRecognized) {
    return (
      <div className="bg-muted border-b">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-2.5 sm:px-6">
          <span className="text-muted-foreground text-sm">{t('table.notRecognized')}</span>
        </div>
      </div>
    );
  }

  if (!zoneName || !number) return null;

  const table = `${zoneName} · ${number}`;

  return (
    <div className="bg-muted border-b">
      <div className="mx-auto flex max-w-7xl items-center px-4 py-2.5 sm:px-6">
        <span className="text-sm font-bold">{t('table.current', { table })}</span>
      </div>
    </div>
  );
};
