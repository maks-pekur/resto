import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface EnableSoundBannerProps {
  readonly onUnlock: () => void;
}

/**
 * A browser refuses to play a chime until the page has been clicked, so this is the click.
 * It stands in for the mute switch until then — the operator never sees two sound controls.
 */
export function EnableSoundBanner({ onUnlock }: EnableSoundBannerProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.alerts' });

  return (
    <Card className="mx-4 flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between lg:mx-6">
      <div>
        <p className="text-sm font-semibold">{t('enableSoundTitle')}</p>
        <p className="text-muted-foreground text-sm">{t('enableSoundBody')}</p>
      </div>
      <Button onClick={onUnlock}>{t('enableSoundBtn')}</Button>
    </Card>
  );
}
