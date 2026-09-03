import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useFormContext } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { IngredientPickerSheet } from '@/components/menu/ingredient-picker-sheet';
import { ingredientsQuery } from '@/lib/queries/catalog';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { cn } from '@/lib/utils';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';

const commaListFromInput = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

interface CompositionRowProps {
  readonly optionId: string;
  readonly name: string;
  readonly removable: boolean;
  readonly onToggleRemovable: (next: boolean) => void;
  readonly onRemove: () => void;
}

function CompositionRow({
  optionId,
  name,
  removable,
  onToggleRemovable,
  onRemove,
}: CompositionRowProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: optionId,
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <Item variant="outline" className={cn(isDragging && 'opacity-40')}>
        <button
          type="button"
          className="cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <ItemContent>
          <ItemTitle>{name}</ItemTitle>
        </ItemContent>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t('compositionRemovableLabel')}
          <Switch checked={removable} onCheckedChange={onToggleRemovable} />
        </label>
        <button
          type="button"
          aria-label={t('compositionRemoveLineAriaLabel', { name })}
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      </Item>
    </div>
  );
}

export function CompositionEditor(): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const form = useFormContext<ItemEditorForm>();
  const { defaultLocale } = useContentLocales();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const mode = form.watch('compositionMode');
  const textLines = form.watch('compositionText');
  const assembled = form.watch('compositionAssembled');
  const [textInput, setTextInput] = React.useState(textLines.join(', '));

  const { data } = useQuery(ingredientsQuery());
  const ingredientNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const ingredient of data?.data?.items ?? []) {
      map.set(ingredient.id, fromLocalizedText(ingredient.name, defaultLocale));
    }
    return map;
  }, [data, defaultLocale]);

  const disabledIds = new Set(assembled.map((line) => line.optionId));

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = assembled.findIndex((line) => line.optionId === active.id);
    const toIdx = assembled.findIndex((line) => line.optionId === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    form.setValue('compositionAssembled', arrayMove(assembled.slice(), fromIdx, toIdx), {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('compositionSectionTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RadioGroup
          value={mode}
          onValueChange={(value) => {
            form.setValue('compositionMode', value as ItemEditorForm['compositionMode'], {
              shouldDirty: true,
              shouldTouch: true,
            });
          }}
          className="flex flex-row gap-4"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="text" />
            {t('compositionModeText')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="assembled" />
            {t('compositionModeAssembled')}
          </label>
        </RadioGroup>

        {mode === 'text' ? (
          <Field>
            <Input
              value={textInput}
              placeholder={t('compositionTextPlaceholder')}
              onChange={(e) => {
                setTextInput(e.target.value);
                form.setValue('compositionText', commaListFromInput(e.target.value), {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <FieldDescription>{t('compositionTextHint')}</FieldDescription>
          </Field>
        ) : (
          <div className="flex flex-col gap-3">
            <DndContext
              id="composition-dnd"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={assembled.map((line) => line.optionId)}
                strategy={verticalListSortingStrategy}
              >
                <ItemGroup>
                  {assembled.map((line) => (
                    <CompositionRow
                      key={line.optionId}
                      optionId={line.optionId}
                      removable={line.removable}
                      name={ingredientNameById.get(line.optionId) ?? ''}
                      onToggleRemovable={(next) => {
                        form.setValue(
                          'compositionAssembled',
                          assembled.map((l) =>
                            l.optionId === line.optionId ? { ...l, removable: next } : l,
                          ),
                          { shouldDirty: true, shouldTouch: true },
                        );
                      }}
                      onRemove={() => {
                        form.setValue(
                          'compositionAssembled',
                          assembled.filter((l) => l.optionId !== line.optionId),
                          { shouldDirty: true, shouldTouch: true },
                        );
                      }}
                    />
                  ))}
                </ItemGroup>
              </SortableContext>
            </DndContext>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSheetOpen(true);
                }}
              >
                {t('compositionAddLineBtn')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <IngredientPickerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onPick={(optionId) => {
          if (assembled.some((line) => line.optionId === optionId)) return;
          form.setValue('compositionAssembled', [...assembled, { optionId, removable: false }], {
            shouldDirty: true,
            shouldTouch: true,
          });
          setSheetOpen(false);
        }}
        showPrice={false}
        disabledIds={disabledIds}
      />
    </Card>
  );
}
