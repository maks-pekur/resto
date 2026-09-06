import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, ImageIcon, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { ModifierPickerSheet } from '@/components/menu/modifier-picker-sheet';
import { modifiersQuery, setGroupModifiers } from '@/lib/queries/catalog';
import { fromLocalizedText, type LocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { showError } from '@/lib/ui/toast-helpers';

export interface GroupModifierRow {
  readonly id: string;
  readonly name: LocalizedText;
  readonly imageUrl: string | null;
  readonly priceDelta: string;
  readonly isDefault: boolean;
}

export interface GroupModifiersPickerProps {
  readonly groupId: string;
  readonly behaviour: 'one' | 'several';
  readonly options: readonly GroupModifierRow[];
  readonly onOptionsChange: (options: readonly GroupModifierRow[]) => void;
}

const EMPTY_DISABLED_IDS: ReadonlySet<string> = new Set();

const trimPrice = (value: string): string => {
  if (value.endsWith('.00')) return value.slice(0, -3);
  if (value.endsWith('.0')) return value.slice(0, -2);
  return value;
};

interface SortableModifierRowProps {
  readonly row: GroupModifierRow;
  readonly name: string;
  readonly priceText: string | null;
  readonly removeAriaLabel: string;
  readonly defaultAriaLabel: string;
  readonly onRemove: () => void;
  readonly onToggleDefault: () => void;
}

function SortableModifierRow({
  row,
  name,
  priceText,
  removeAriaLabel,
  defaultAriaLabel,
  onRemove,
  onToggleDefault,
}: SortableModifierRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  return (
    <Item
      ref={setNodeRef}
      variant="outline"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="size-4" aria-hidden="true" />
      </span>
      <ItemMedia variant={row.imageUrl ? 'image' : 'icon'}>
        {row.imageUrl ? (
          <img src={row.imageUrl} alt="" />
        ) : (
          <ImageIcon className="text-muted-foreground" aria-hidden="true" />
        )}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        {priceText ? <ItemDescription>{priceText}</ItemDescription> : null}
      </ItemContent>
      <ItemActions>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleDefault}
          aria-label={defaultAriaLabel}
          aria-pressed={row.isDefault}
          data-testid={`group-default-${row.id}`}
        >
          <Star className={cn('size-4', row.isDefault && 'fill-primary text-primary')} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={removeAriaLabel}
        >
          <X className="size-4" />
        </Button>
      </ItemActions>
    </Item>
  );
}

export function GroupModifiersPicker({
  groupId,
  behaviour,
  options,
  onOptionsChange,
}: GroupModifiersPickerProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const { defaultLocale } = useContentLocales();
  const queryClient = useQueryClient();
  const [rows, setRows] = React.useState<readonly GroupModifierRow[]>(options);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const isNewGroup = groupId === 'new';

  React.useEffect(() => {
    setRows(options);
  }, [options]);

  const { data: modifiersData } = useQuery(modifiersQuery());
  const availableModifiers = modifiersData?.data?.items ?? [];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const writeMutation = useMutation({
    mutationFn: (next: readonly GroupModifierRow[]) =>
      setGroupModifiers(
        groupId,
        next.map((row) => row.id),
        next.filter((row) => row.isDefault).map((row) => row.id),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'modifier-group', groupId] });
    },
  });

  const persist = async (next: readonly GroupModifierRow[]): Promise<void> => {
    const previous = rows;
    setRows(next);
    onOptionsChange(next);
    try {
      const res = await writeMutation.mutateAsync(next);
      if (!res.ok) {
        setRows(previous);
        onOptionsChange(previous);
        showError(null, t('groupSaveFailed'));
      }
    } catch {
      setRows(previous);
      onOptionsChange(previous);
      showError(null, t('groupSaveFailed'));
    }
  };

  // A one-choice group answers itself with a single pre-selected option; picking a second
  // must move the mark, not add to it.
  const onToggleDefault = (id: string): void => {
    void persist(
      rows.map((row) => {
        if (row.id === id) return { ...row, isDefault: !row.isDefault };
        return behaviour === 'one' ? { ...row, isDefault: false } : row;
      }),
    );
  };

  const onRemove = (id: string): void => {
    void persist(rows.filter((row) => row.id !== id));
  };

  const onPick = (optionId: string): void => {
    setSheetOpen(false);
    if (rows.some((row) => row.id === optionId)) return;
    const picked = availableModifiers.find((modifier) => modifier.id === optionId);
    if (!picked) return;
    void persist([
      ...rows,
      {
        id: picked.id,
        name: picked.name,
        imageUrl: picked.imageUrl,
        priceDelta: picked.priceDelta,
        isDefault: false,
      },
    ]);
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = rows.findIndex((row) => row.id === active.id);
    const toIndex = rows.findIndex((row) => row.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    void persist(arrayMove(rows.slice(), fromIndex, toIndex));
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('variantsEmpty')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <ItemGroup>
              {rows.map((row) => {
                const name = fromLocalizedText(row.name, defaultLocale);
                const priceText =
                  Number(row.priceDelta) !== 0 ? `+${trimPrice(row.priceDelta)}` : null;
                return (
                  <SortableModifierRow
                    key={row.id}
                    row={row}
                    name={name}
                    priceText={priceText}
                    removeAriaLabel={`${tCommon('delete')} ${name}`}
                    defaultAriaLabel={`${t('defaultAriaLabel')} ${name}`}
                    onRemove={() => {
                      onRemove(row.id);
                    }}
                    onToggleDefault={() => {
                      onToggleDefault(row.id);
                    }}
                  />
                );
              })}
            </ItemGroup>
          </SortableContext>
        </DndContext>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setSheetOpen(true);
        }}
        disabled={isNewGroup}
        title={isNewGroup ? t('saveNameFirst') : undefined}
      >
        {t('addOption')}
      </Button>
      <ModifierPickerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onPick={onPick}
        showPrice
        disabledIds={EMPTY_DISABLED_IDS}
      />
    </div>
  );
}
