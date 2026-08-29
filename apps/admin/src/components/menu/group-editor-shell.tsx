import * as React from 'react';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeading } from '@/components/page-heading';
import {
  ModifierGroupFormComponent,
  type ModifierGroupFormState,
} from '@/components/menu/modifier-group-form';
import {
  ModifierOptionsList,
  type ModifierOptionApi,
} from '@/components/menu/modifier-options-list';
import type { ModifierGroupDetailApi } from '@/lib/queries/catalog';
import type { ModifierGroupForm } from '@/lib/menu/zod-schemas';

export interface GroupEditorShellProps {
  readonly title: string;
  readonly initialGroup: ModifierGroupDetailApi | null;
  readonly groupId: string;
}

const FORM_ID = 'modifier-group-form';

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

export function GroupEditorShell({
  title,
  initialGroup,
  groupId,
}: GroupEditorShellProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const [currentGroupId, setCurrentGroupId] = React.useState(groupId);
  const [currentOptions, setCurrentOptions] = React.useState<readonly ModifierOptionApi[]>(
    initialGroup?.options ?? [],
  );
  const [formState, setFormState] = React.useState<ModifierGroupFormState>({
    isNew: groupId === 'new',
    isDirty: false,
    isPending: false,
  });

  const initialValues = React.useMemo(
    () => (initialGroup ? valuesFromGroup(initialGroup) : emptyValues()),
    [initialGroup],
  );

  const handleStateChange = React.useCallback((next: ModifierGroupFormState) => {
    setFormState(next);
  }, []);

  const canSubmit = formState.isNew || formState.isDirty;
  const saveLabel = formState.isPending
    ? tCommon('saving')
    : formState.isNew
      ? t('createGroupBtn')
      : tCommon('save');

  const saveButton = (
    <Button type="submit" form={FORM_ID} size="sm" disabled={formState.isPending || !canSubmit}>
      {saveLabel}
    </Button>
  );

  return (
    <>
      <PageHeading title={title} action={saveButton} />
      <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('groupMain')}</CardTitle>
            <CardDescription>{t('groupMainDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ModifierGroupFormComponent
              initialValues={initialValues}
              groupId={currentGroupId}
              onSaved={setCurrentGroupId}
              formId={FORM_ID}
              onStateChange={handleStateChange}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('groupVariantsTitle')}</CardTitle>
            <CardDescription>{t('groupVariantsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ModifierOptionsList
              groupId={currentGroupId}
              options={currentOptions}
              onOptionsChange={setCurrentOptions}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
