'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { ModifierGroupForm } from '@/lib/menu/zod-schemas';
import { ModifierGroupFormClient } from './modifier-group-form-client';
import { ModifierOptionsListClient, type ModifierOptionApi } from './modifier-options-list-client';

export interface ModifierGroupDetailApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly options: readonly ModifierOptionApi[];
}

export interface GroupEditorShellClientProps {
  readonly initialGroup: ModifierGroupDetailApi | null;
  readonly groupId: string;
}

const emptyValues = (): ModifierGroupForm => ({
  name: '',
  minSelectable: 0,
  maxSelectable: 1,
});

const valuesFromGroup = (g: ModifierGroupDetailApi): ModifierGroupForm => ({
  name: fromLocalizedText(g.name),
  minSelectable: g.minSelectable,
  maxSelectable: g.maxSelectable,
});

export function GroupEditorShellClient({
  initialGroup,
  groupId,
}: GroupEditorShellClientProps): React.ReactElement {
  const [currentGroupId, setCurrentGroupId] = React.useState(groupId);
  const [currentOptions, setCurrentOptions] = React.useState<readonly ModifierOptionApi[]>(
    initialGroup?.options ?? [],
  );

  const initialValues = React.useMemo(
    () => (initialGroup ? valuesFromGroup(initialGroup) : emptyValues()),
    [initialGroup],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Основное</CardTitle>
          <CardDescription>
            Параметры группы: название и количество выбираемых вариантов (макс. 0 — без
            ограничений).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModifierGroupFormClient
            initialValues={initialValues}
            groupId={currentGroupId}
            onSaved={setCurrentGroupId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Варианты</CardTitle>
          <CardDescription>Список опций и их цены — сохраняются одной кнопкой.</CardDescription>
        </CardHeader>
        <CardContent>
          <ModifierOptionsListClient
            groupId={currentGroupId}
            options={currentOptions}
            onOptionsChange={setCurrentOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
