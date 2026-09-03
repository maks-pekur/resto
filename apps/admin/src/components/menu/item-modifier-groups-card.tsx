import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
import { Field, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
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
import { ModifierPickerSheet } from '@/components/menu/modifier-picker-sheet';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import {
  modifiersQuery,
  modifierGroupQuery,
  setItemModifiers,
  upsertItemModifierGroups,
  upsertModifierGroup,
} from '@/lib/queries/catalog';
import { fromLocalizedText, mergeLocalized } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';

export interface AvailableGroup {
  readonly id: string;
  readonly name: string;
  readonly optionCount: number;
}

export interface ItemModifierGroupsCardProps {
  readonly itemId: string;
  readonly initialModifierGroupIds: readonly string[];
  readonly initialModifierIds: readonly string[];
  readonly availableGroups: readonly AvailableGroup[];
}

export function ItemModifierGroupsCard({
  itemId,
  initialModifierGroupIds,
  initialModifierIds,
  availableGroups,
}: ItemModifierGroupsCardProps): React.ReactElement {
  const navigate = useNavigate();
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { t: tModifiers } = useTranslation('translation', { keyPrefix: 'menu.itemModifiers' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const [assignedIds, setAssignedIds] = React.useState<readonly string[]>(initialModifierGroupIds);
  const [singleIds, setSingleIds] = React.useState<readonly string[]>(initialModifierIds);
  const [knownGroups, setKnownGroups] = React.useState<readonly AvailableGroup[]>(availableGroups);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [singleSheetOpen, setSingleSheetOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [newName, setNewName] = React.useState('');

  const { defaultLocale } = useContentLocales();
  const isNewItem = itemId === 'new';

  const { data: modifiersData } = useQuery(modifiersQuery());
  const modifierNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const modifier of modifiersData?.data?.items ?? []) {
      map.set(modifier.id, fromLocalizedText(modifier.name, defaultLocale));
    }
    return map;
  }, [modifiersData, defaultLocale]);

  const groupDetailQueries = useQueries({
    queries: assignedIds.map((groupId) => modifierGroupQuery(groupId)),
  });
  const groupNameByReachableOptionId = React.useMemo(() => {
    const map = new Map<string, string>();
    assignedIds.forEach((groupId, index) => {
      const groupName = knownGroups.find((g) => g.id === groupId)?.name ?? '';
      const options = groupDetailQueries[index]?.data?.data?.options ?? [];
      for (const option of options) {
        map.set(option.id, groupName);
      }
    });
    return map;
  }, [assignedIds, groupDetailQueries, knownGroups]);

  const assignMutation = useMutation({
    mutationFn: (nextIds: readonly string[]) => upsertItemModifierGroups(itemId, nextIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'item', itemId] });
    },
  });

  const singleMutation = useMutation({
    mutationFn: (nextIds: readonly string[]) => setItemModifiers(itemId, nextIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'item', itemId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: { name: string }) =>
      upsertModifierGroup(null, {
        name: mergeLocalized(null, defaultLocale, values.name),
        display: 'tiles',
        behaviour: 'several',
        isRequired: false,
        maxSelectable: null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'modifier-groups'] });
    },
  });

  const onRemove = async (groupId: string): Promise<void> => {
    if (isNewItem) return;
    const next = assignedIds.filter((id) => id !== groupId);
    const previous = assignedIds;
    setAssignedIds(next);
    try {
      await assignMutation.mutateAsync(next);
      showSuccess(tCommon('saved'), { duration: 1500 });
    } catch {
      setAssignedIds(previous);
      showError(null, t('updateFailed'));
    }
  };

  // The order of the chips is the order the guest meets the questions in — the api stores it
  // from this list's own order.
  const onMove = async (groupId: string, delta: -1 | 1): Promise<void> => {
    if (isNewItem) return;
    const index = assignedIds.indexOf(groupId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= assignedIds.length) return;
    const next = [...assignedIds];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    const previous = assignedIds;
    setAssignedIds(next);
    try {
      await assignMutation.mutateAsync(next);
    } catch {
      setAssignedIds(previous);
      showError(null, t('updateFailed'));
    }
  };

  const onAdd = async (groupId: string): Promise<void> => {
    if (isNewItem || assignedIds.includes(groupId)) return;
    const next = [...assignedIds, groupId];
    const previous = assignedIds;
    setAssignedIds(next);
    setSheetOpen(false);
    try {
      await assignMutation.mutateAsync(next);
      showSuccess(tCommon('saved'), { duration: 1500 });
    } catch {
      setAssignedIds(previous);
      showError(null, t('updateFailed'));
    }
  };

  const onRemoveSingle = async (optionId: string): Promise<void> => {
    if (isNewItem) return;
    const next = singleIds.filter((id) => id !== optionId);
    const previous = singleIds;
    setSingleIds(next);
    try {
      await singleMutation.mutateAsync(next);
      showSuccess(tCommon('saved'), { duration: 1500 });
    } catch {
      setSingleIds(previous);
      showError(null, t('updateFailed'));
    }
  };

  const onMoveSingle = async (optionId: string, delta: -1 | 1): Promise<void> => {
    if (isNewItem) return;
    const index = singleIds.indexOf(optionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= singleIds.length) return;
    const next = [...singleIds];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    const previous = singleIds;
    setSingleIds(next);
    try {
      await singleMutation.mutateAsync(next);
    } catch {
      setSingleIds(previous);
      showError(null, t('updateFailed'));
    }
  };

  const onAddSingle = async (optionId: string): Promise<void> => {
    if (isNewItem || singleIds.includes(optionId)) return;
    const next = [...singleIds, optionId];
    const previous = singleIds;
    setSingleIds(next);
    setSingleSheetOpen(false);
    try {
      await singleMutation.mutateAsync(next);
      showSuccess(tCommon('saved'), { duration: 1500 });
    } catch {
      setSingleIds(previous);
      showError(null, t('updateFailed'));
    }
  };

  const onSubmitNew = async (): Promise<void> => {
    if (!newName.trim()) {
      showError(t('nameRequired'), t('nameRequired'));
      return;
    }
    try {
      const res = await createMutation.mutateAsync({ name: newName });
      if (!res.ok) {
        showError(null, t('createFailed'));
        return;
      }
      setCreateOpen(false);
      setSheetOpen(false);
      const newId = res.data?.id ?? '';
      setKnownGroups((prev) => [...prev, { id: newId, name: newName, optionCount: 0 }]);
      void navigate({
        to: '/menu/modifiers/$id',
        params: { id: newId },
      });
    } catch {
      showError(null, t('createFailed'));
    }
  };

  const assignedGroups = assignedIds
    .map((id) => knownGroups.find((g) => g.id === id))
    .filter((g): g is AvailableGroup => g !== undefined);

  const sheetGroups = knownGroups.filter((g) =>
    g.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const isPending =
    assignMutation.isPending || createMutation.isPending || singleMutation.isPending;

  const disabledSingleIds = new Set(groupNameByReachableOptionId.keys());

  if (isNewItem) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cardTitle')}</CardTitle>
          <CardDescription>{t('newItemHint')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cardTitle')}</CardTitle>
        <CardDescription>{t('cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <FieldTitle>{tModifiers('groupsRowLabel')}</FieldTitle>
          {assignedGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {assignedGroups.map((g) => (
                <div
                  key={g.id}
                  className="bg-secondary flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                  data-testid={`mg-chip-${g.id}`}
                >
                  <button
                    type="button"
                    aria-label={t('chipMoveEarlierAriaLabel', { name: g.name })}
                    onClick={() => {
                      void onMove(g.id, -1);
                    }}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={isPending || assignedIds[0] === g.id}
                  >
                    <ChevronLeft className="size-3" aria-hidden="true" />
                  </button>
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <button
                    type="button"
                    aria-label={t('chipMoveLaterAriaLabel', { name: g.name })}
                    onClick={() => {
                      void onMove(g.id, 1);
                    }}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={isPending || assignedIds[assignedIds.length - 1] === g.id}
                  >
                    <ChevronRight className="size-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('chipRemoveAriaLabel', { name: g.name })}
                    onClick={() => {
                      void onRemove(g.id);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={isPending}
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
              disabled={isPending}
            >
              {t('addGroupBtn')}
            </Button>
          </div>
        </div>

        <hr className="border-border" />

        <div className="flex flex-col gap-2">
          <FieldTitle>{tModifiers('singlesRowLabel')}</FieldTitle>
          {singleIds.length === 0 ? null : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {singleIds.map((optionId) => {
                const name = modifierNameById.get(optionId) ?? '';
                return (
                  <div
                    key={optionId}
                    className="bg-secondary flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                    data-testid={`modifier-chip-${optionId}`}
                  >
                    <button
                      type="button"
                      aria-label={t('chipMoveEarlierAriaLabel', { name })}
                      onClick={() => {
                        void onMoveSingle(optionId, -1);
                      }}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={isPending || singleIds[0] === optionId}
                    >
                      <ChevronLeft className="size-3" aria-hidden="true" />
                    </button>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <button
                      type="button"
                      aria-label={t('chipMoveLaterAriaLabel', { name })}
                      onClick={() => {
                        void onMoveSingle(optionId, 1);
                      }}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={isPending || singleIds[singleIds.length - 1] === optionId}
                    >
                      <ChevronRight className="size-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('chipRemoveAriaLabel', { name })}
                      onClick={() => {
                        void onRemoveSingle(optionId);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      disabled={isPending}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSingleSheetOpen(true);
              }}
              disabled={isPending}
            >
              {tModifiers('addSingleBtn')}
            </Button>
          </div>
        </div>
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
                          disabled={isAssigned || isPending}
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

      <ModifierPickerSheet
        open={singleSheetOpen}
        onOpenChange={setSingleSheetOpen}
        onPick={(optionId) => {
          void onAddSingle(optionId);
        }}
        showPrice
        disabledIds={disabledSingleIds}
        disabledReason={(optionId) =>
          tModifiers('duplicateError', {
            name: modifierNameById.get(optionId) ?? '',
            groupName: groupNameByReachableOptionId.get(optionId) ?? '',
          })
        }
      />

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
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
              }}
              disabled={isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onSubmitNew();
              }}
              disabled={isPending}
            >
              {tCommon('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
