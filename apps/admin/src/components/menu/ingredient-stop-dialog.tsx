import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { showError } from '@/lib/ui/toast-helpers';
import {
  ingredientUsageQuery,
  toggleIngredientStopList,
  toggleStopList,
} from '@/lib/queries/catalog';
import type { IngredientApi } from '@/lib/queries/catalog';

export interface IngredientStopDialogProps {
  readonly ingredient: IngredientApi | null;
  readonly locationId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function IngredientStopDialog({
  ingredient,
  locationId,
  open,
  onOpenChange,
}: IngredientStopDialogProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { t: tItems } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const { defaultLocale } = useContentLocales();
  const queryClient = useQueryClient();
  const [checkedIds, setCheckedIds] = React.useState<ReadonlySet<string>>(new Set());
  const autoStoppedRef = React.useRef(false);

  const { data } = useQuery({
    ...ingredientUsageQuery(ingredient?.id ?? ''),
    enabled: open && ingredient !== null,
  });
  const dishes = data?.data?.dishesInComposition ?? [];
  const hasLoaded = data !== undefined;

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'ingredient-stop-list'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'stop-list'] });
  };

  const stopOnlyMutation = useMutation({
    mutationFn: () => toggleIngredientStopList(ingredient?.id ?? '', true, locationId),
    onSuccess: (res) => {
      if (res.ok) {
        invalidate();
        onOpenChange(false);
      } else {
        showError(null, tItems('stopListFailed'));
      }
    },
    onError: () => {
      showError(null, tItems('stopListFailed'));
    },
  });

  const stopSelectedMutation = useMutation({
    mutationFn: async () => {
      const optionRes = await toggleIngredientStopList(ingredient?.id ?? '', true, locationId);
      if (!optionRes.ok) throw new Error('option stop failed');
      const dishResults = await Promise.all(
        Array.from(checkedIds, (dishId) => toggleStopList(dishId, 'paused', locationId)),
      );
      if (dishResults.some((res) => !res.ok)) throw new Error('dish stop failed');
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: () => {
      showError(null, tItems('stopListFailed'));
    },
  });

  React.useEffect(() => {
    if (!open) {
      autoStoppedRef.current = false;
      setCheckedIds(new Set());
      return;
    }
    if (hasLoaded && dishes.length === 0 && !autoStoppedRef.current) {
      autoStoppedRef.current = true;
      stopOnlyMutation.mutate();
    }
  }, [open, hasLoaded, dishes.length]);

  const isPending = stopOnlyMutation.isPending || stopSelectedMutation.isPending;
  const showDialog = open && hasLoaded && dishes.length > 0;

  return (
    <Dialog open={showDialog} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('stopIngredientDialogTitle')}</DialogTitle>
          <DialogDescription>{t('stopIngredientDialogBody')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {dishes.map((dish) => {
            const inputId = `stop-dialog-dish-${dish.id}`;
            return (
              <div key={dish.id} className="flex items-center gap-2">
                <Checkbox
                  id={inputId}
                  checked={checkedIds.has(dish.id)}
                  disabled={isPending}
                  onCheckedChange={(checked) => {
                    setCheckedIds((prev) => {
                      const copy = new Set(prev);
                      if (checked === true) copy.add(dish.id);
                      else copy.delete(dish.id);
                      return copy;
                    });
                  }}
                />
                <Label htmlFor={inputId} className="font-normal">
                  {fromLocalizedText(dish.name, defaultLocale)}
                </Label>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              stopOnlyMutation.mutate();
            }}
          >
            {t('stopIngredientOnlyBtn')}
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => {
              stopSelectedMutation.mutate();
            }}
          >
            {t('stopSelectedDishesBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
