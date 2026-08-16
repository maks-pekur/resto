import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const SOUND_UNLOCKED_KEY = 'orders.soundUnlocked';

const readUnlocked = (): boolean => {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(SOUND_UNLOCKED_KEY) === '1';
};

export interface EnableSoundBannerProps {
  readonly onUnlock: () => void;
}

export function EnableSoundBanner({ onUnlock }: EnableSoundBannerProps): React.ReactElement | null {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.alerts' });
  const [dismissed, setDismissed] = React.useState<boolean>(readUnlocked);

  if (dismissed) return null;

  return (
    <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">{t('enableSoundTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('enableSoundBody')}</p>
      </div>
      <Button
        onClick={() => {
          onUnlock();
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(SOUND_UNLOCKED_KEY, '1');
          }
          setDismissed(true);
        }}
      >
        {t('enableSoundBtn')}
      </Button>
    </Card>
  );
}
