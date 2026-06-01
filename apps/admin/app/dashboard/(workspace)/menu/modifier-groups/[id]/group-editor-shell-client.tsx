'use client';

import * as React from 'react';
import { AutoSaveIndicator } from '@/components/menu/auto-save-indicator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { SaveState } from '@/lib/menu/types';
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
  const [saveState, setSaveState] = React.useState<SaveState>({ kind: 'idle' });
  const [currentOptions, setCurrentOptions] = React.useState<readonly ModifierOptionApi[]>(
    initialGroup?.options ?? [],
  );

  const initialValues = React.useMemo(
    () => (initialGroup ? valuesFromGroup(initialGroup) : emptyValues()),
    [initialGroup],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
      <div className="flex items-start justify-end gap-4">
        <AutoSaveIndicator state={saveState} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Основное</CardTitle>
        </CardHeader>
        <CardContent>
          <ModifierGroupFormClient
            initialValues={initialValues}
            groupId={currentGroupId}
            onFirstSave={setCurrentGroupId}
            onSaveState={setSaveState}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Варианты</CardTitle>
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
