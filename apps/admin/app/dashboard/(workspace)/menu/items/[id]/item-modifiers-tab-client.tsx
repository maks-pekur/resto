'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertItemModifierGroupsAction } from './upsert-item-modifier-groups-action';
import { upsertModifierGroupAction } from '../../modifier-groups/upsert-modifier-group-action';

export interface AvailableGroup {
  readonly id: string;
  readonly name: string;
  readonly optionCount: number;
}

export interface ItemModifiersTabClientProps {
  readonly itemId: string;
  readonly initialModifierGroupIds: readonly string[];
  readonly availableGroups: readonly AvailableGroup[];
}

export function ItemModifiersTabClient({
  itemId,
  initialModifierGroupIds,
  availableGroups,
}: ItemModifiersTabClientProps): React.ReactElement {
  const router = useRouter();
  const [assignedIds, setAssignedIds] = React.useState<readonly string[]>(initialModifierGroupIds);
  const [knownGroups, setKnownGroups] = React.useState<readonly AvailableGroup[]>(availableGroups);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const [newName, setNewName] = React.useState('');
  const [newMin, setNewMin] = React.useState(0);
  const [newMax, setNewMax] = React.useState(1);

  const isNewItem = itemId === 'new';

  const persistAssignment = async (nextIds: readonly string[]): Promise<boolean> => {
    setPending(true);
    const res = await upsertItemModifierGroupsAction(itemId, nextIds);
    setPending(false);
    if (!res.ok) {
      showError(res.error, 'Не удалось обновить модификаторы.');
      return false;
    }
    showSuccess('Сохранено', { duration: 1500 });
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
      showError('Введите название группы.', 'Введите название группы.');
      return;
    }
    setPending(true);
    const res = await upsertModifierGroupAction({
      values: { name: newName, minSelectable: newMin, maxSelectable: newMax },
    });
    setPending(false);
    if (!res.ok) {
      showError(res.error, 'Не удалось создать группу.');
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

  if (isNewItem) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Модификаторы</CardTitle>
          <CardDescription>
            Сначала сохраните блюдо — модификаторы можно прикрепить после первой записи.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Группы модификаторов</CardTitle>
        <CardDescription>
          Прикрепите группы из библиотеки или создайте новую — варианты можно отредактировать в
          самой группе.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {assignedGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет прикреплённых групп — нажмите «+ Добавить группу».
          </p>
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
                  aria-label={`Убрать группу ${g.name}`}
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
            + Добавить группу
          </Button>
        </div>
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>Добавить группу модификаторов</SheetTitle>
          </SheetHeader>
          <Input
            placeholder="Поиск"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
          <div className="flex-1 overflow-y-auto">
            {sheetGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
            ) : (
              <ItemGroup>
                {sheetGroups.map((g) => {
                  const isAssigned = assignedIds.includes(g.id);
                  return (
                    <Item key={g.id} variant="outline">
                      <ItemContent>
                        <ItemTitle>{g.name}</ItemTitle>
                        <ItemDescription>{g.optionCount.toString()} вариантов</ItemDescription>
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
                          {isAssigned ? 'Добавлено' : '+ Добавить'}
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
            + Создать новую группу
          </Button>
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать группу модификаторов</DialogTitle>
            <DialogDescription>
              Эта группа сразу появится в библиотеке и будет доступна для прикрепления.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-mg-name">Название</FieldLabel>
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
                <FieldLabel htmlFor="new-mg-min">Мин</FieldLabel>
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
                <FieldLabel htmlFor="new-mg-max">Макс</FieldLabel>
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
              Отмена
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onSubmitNew();
              }}
              disabled={pending}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
