import { useTranslation } from 'react-i18next';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface RouteErrorProps {
  readonly reset?: () => void;
}

export function RouteError({ reset }: RouteErrorProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'common' });

  return (
    <div
      role="alert"
      data-testid="route-error"
      className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <WifiOff className="size-6" />
      </div>
      <div className="max-w-md space-y-1.5">
        <h2 className="text-lg font-medium">{t('errorGeneric')}</h2>
        <p className="text-sm text-muted-foreground">{t('tryAgain')}</p>
      </div>
      <Button
        onClick={() => {
          if (reset) reset();
          else window.location.reload();
        }}
      >
        <RefreshCw className="size-4" />
        {t('retry')}
      </Button>
    </div>
  );
}

export function RoutePending(): React.ReactElement {
  return (
    <div data-testid="route-pending" className="flex flex-col gap-3 px-4 py-6 lg:px-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
