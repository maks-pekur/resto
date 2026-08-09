import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { resetStopList } from '@/lib/queries/catalog';

export interface TodaysWidgetResetButtonProps {
  readonly brandSlug: string;
  readonly locationId: string;
}

export function TodaysWidgetResetButton({
  brandSlug,
  locationId,
}: TodaysWidgetResetButtonProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => resetStopList(brandSlug, locationId),
    onSuccess: (res) => {
      if (res.ok) {
        showSuccess(t('resetSuccess'));
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'stop-list', brandSlug] });
      } else {
        showError(null, t('resetFailed'));
      }
    },
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        mutation.mutate();
      }}
      disabled={mutation.isPending}
      aria-label={t('resetAllAriaLabel')}
    >
      {t('resetAllBtn')}
    </Button>
  );
}
