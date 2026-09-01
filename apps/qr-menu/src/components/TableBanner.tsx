import { t } from '../i18n';

export interface TableBannerProps {
  readonly notRecognized?: boolean;
}

/**
 * Only speaks when the scan failed. Which table the guest sits at is the kitchen's business —
 * the guest can see the table they are sitting at.
 */
export const TableBanner = ({ notRecognized = false }: TableBannerProps) => {
  if (!notRecognized) return null;

  return (
    <div className="bg-muted border-b">
      <div className="mx-auto flex max-w-7xl items-center px-4 py-2.5 sm:px-6">
        <span className="text-muted-foreground text-sm">{t('table.notRecognized')}</span>
      </div>
    </div>
  );
};
