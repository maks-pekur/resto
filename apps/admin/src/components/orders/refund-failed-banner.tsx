import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface RefundFailedBannerProps {
  readonly count: number;
  readonly onShowClick: () => void;
}

export function RefundFailedBanner({
  count,
  onShowClick,
}: RefundFailedBannerProps): React.ReactElement | null {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.feed' });

  if (count <= 0) return null;

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground lg:px-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4" />
        <span>{t('refundBanner', { count })}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-destructive-foreground bg-transparent text-destructive-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground"
        onClick={onShowClick}
      >
        {t('refundBannerAction')}
      </Button>
    </div>
  );
}
