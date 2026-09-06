import { useTranslation } from 'react-i18next';
import { BellRing } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface EnableAlertsBannerProps {
  readonly onEnable: () => void;
}

/**
 * The in-page half of a permission prompt. The browser's own dialog opens from the click on
 * this button, and that same click is what buys the right to play a chime — an autoplay
 * policy has no API to ask, only a gesture to spend.
 */
export function EnableAlertsBanner({ onEnable }: EnableAlertsBannerProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.alerts' });

  return (
    <Card className="mx-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between lg:mx-6">
      <div className="flex items-start gap-3">
        <span className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
          <BellRing className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{t('enableAlertsTitle')}</p>
          <p className="text-muted-foreground text-sm">{t('enableAlertsBody')}</p>
        </div>
      </div>
      <Button onClick={onEnable} className="sm:shrink-0">
        {t('enableAlertsBtn')}
      </Button>
    </Card>
  );
}
