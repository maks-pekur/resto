'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useFormContext } from 'react-hook-form';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertItemModifierGroupsAction } from './upsert-item-modifier-groups-action';
import { upsertModifierGroupAction } from '../../modifier-groups/upsert-modifier-group-action';

export interface AvailableGroup {
  readonly id: string;
  readonly name: string;
  readonly optionCount: number;
}

export interface ItemModifierGroupsCardClientProps {
  readonly itemId: string;
  readonly initialModifierGroupIds: readonly string[];
  readonly availableGroups: readonly AvailableGroup[];
}

const commaListFromInput = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export function ItemModifierGroupsCardClient({
  itemId,
  initialModifierGroupIds,
  availableGroups,
}: ItemModifierGroupsCardClientProps): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('menu.modifiers');
  const tEditor = useTranslations('menu.editor');
  const tCommon = useTranslations('common');
  const tCommonShared = useTranslations('common');
  const form = useFormContext<ItemEditorForm>();
  const [assignedIds, setAssignedIds] = React.useState<readonly string[]>(initialModifierGroupIds);
  const [knownGroups, setKnownGroups] = React.useState<readonly AvailableGroup[]>(availableGroups);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [ingredientsText, setIngredientsText] = React.useState(
    form.getValues('ingredients').join(', '),
  );

  const [newName, setNewName] = React.useState('');
  const [newMin, setNewMin] = React.useState(0);
  const [newMax, setNewMax] = React.useState(1);

  const isNewItem = itemId === 'new';

  const persistAssignment = async (nextIds: readonly string[]): Promise<boolean> => {
    setPending(true);
    const res = await upsertItemModifierGroupsAction(itemId, nextIds);
    setPending(false);
    if (!res.ok) {
      showError(res.error, t('updateFailed'));
      return false;
    }
    showSuccess(tCommon('saved'), { duration: 1500 });
    return true;
  };

  const onRemove = async (groupId: string): Promise<void> => {
    if (isNewItem) return;
    const next = assignedIds.filter((id) => id !== groupId);
    const previous = assignedIds;
    setAssignedIds(next);
    const ok = await persistAssignment(next);
    if (!ok) setAssignedIds(previous);
  };

  const onAdd = async (groupId: string): Promise<void> => {
    if (isNewItem || assignedIds.includes(groupId)) return;
    const next = [...assignedIds, groupId];
    const previous = assignedIds;
    setAssignedIds(next);
    setSheetOpen(false);
    const ok = await persistAssignment(next);
    if (!ok) setAssignedIds(previous);
  };

  const onSubmitNew = async (): Promise<void> => {
    if (!newName.trim()) {
      showError(t('nameRequired'), t('nameRequired'));
      return;
    }
    setPending(true);
    const res = await upsertModifierGroupAction({
      values: { name: newName, minSelectable: newMin, maxSelectable: newMax },
    });
    setPending(false);
    if (!res.ok) {
      showError(res.error, t('createFailed'));
      return;
    }
    setCreateOpen(false);
    setSheetOpen(false);
    setKnownGroups((prev) => [...prev, { id: res.id, name: newName, optionCount: 0 }]);
    router.push(`/dashboard/menu/modifier-groups/${res.id}`);
  };

  const assignedGroups = assignedIds
    .map((id) => knownGroups.find((g) => g.id === id))
    .filter((g): g is AvailableGroup => g !== undefined);

  const sheetGroups = knownGroups.filter((g) =>
    g.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const ingredientsField = (
    <Field>
      <FieldLabel htmlFor="ingredients">{tEditor('ingredientsLabel')}</FieldLabel>
      <Input
        id="ingredients"
        value={ingredientsText}
        placeholder={tEditor('ingredientsPlaceholder')}
        onChange={(e) => {
          setIngredientsText(e.target.value);
          form.setValue('ingredients', commaListFromInput(e.target.value), {
            shouldDirty: true,
            shouldTouch: true,
          });
        }}
      />
      <FieldDescription>{tCommonShared('comma')}</FieldDescription>
    </Field>
  );

  if (isNewItem) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{tEditor('compositionSectionTitle')}</CardTitle>
          <CardDescription>{t('newItemHint')}</CardDescription>
        </CardHeader>
        <CardContent>{ingredientsField}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tEditor('compositionSectionTitle')}</CardTitle>
        <CardDescription>{t('cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {assignedGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignedGroups.map((g) => (
              <div
                key={g.id}
                className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-sm"
                data-testid={`mg-chip-${g.id}`}
              >
                <span>{g.name}</span>
                <button
                  type="button"
                  aria-label={t('chipRemoveAriaLabel', { name: g.name })}
                  onClick={() => {
                    void onRemove(g.id);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={pending}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch('');
              setSheetOpen(true);
            }}
            disabled={pending}
          >
            {t('addGroupBtn')}
          </Button>
        </div>

        <hr className="border-border" />
        {ingredientsField}
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>{t('sheetTitle')}</SheetTitle>
          </SheetHeader>
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
          <div className="flex-1 overflow-y-auto">
            {sheetGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('sheetEmpty')}</p>
            ) : (
              <ItemGroup>
                {sheetGroups.map((g) => {
                  const isAssigned = assignedIds.includes(g.id);
                  return (
                    <Item key={g.id} variant="outline">
                      <ItemContent>
                        <ItemTitle>{g.name}</ItemTitle>
                        <ItemDescription>
                          {t('optionCount', { count: g.optionCount })}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Button
                          type="button"
                          variant={isAssigned ? 'ghost' : 'outline'}
                          size="sm"
                          disabled={isAssigned || pending}
                          onClick={() => {
                            void onAdd(g.id);
                          }}
                        >
                          {isAssigned ? t('alreadyAdded') : t('addToItem')}
                        </Button>
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            )}
          </div>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setCreateOpen(true);
            }}
            className="justify-start px-0"
          >
            {t('createNewLink')}
          </Button>
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createDialogTitle')}</DialogTitle>
            <DialogDescription>{t('createDialogDescription')}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-mg-name">{t('nameLabel')}</FieldLabel>
              <Input
                id="new-mg-name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                }}
                maxLength={255}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="new-mg-min">{t('minLabel')}</FieldLabel>
                <Input
                  id="new-mg-min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={newMin}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setNewMin(Number.isFinite(n) ? n : 0);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-mg-max">{t('maxLabel')}</FieldLabel>
                <Input
                  id="new-mg-max"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={newMax}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setNewMax(Number.isFinite(n) ? n : 0);
                  }}
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
              }}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onSubmitNew();
              }}
              disabled={pending}
            >
              {tCommon('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
