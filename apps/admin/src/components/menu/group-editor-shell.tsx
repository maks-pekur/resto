import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeading } from '@/components/common/page-heading';
import {
  ModifierGroupFormComponent,
  type ModifierGroupFormState,
} from '@/components/menu/modifier-group-form';
import {
  GroupModifiersPicker,
  type GroupModifierRow,
} from '@/components/menu/group-modifiers-picker';
import type { ModifierGroupDetailApi, ModifierOptionApi } from '@/lib/queries/catalog';
import type { ModifierGroupForm } from '@/lib/menu/zod-schemas';

export interface GroupEditorShellProps {
  readonly title: string;
  readonly initialGroup: ModifierGroupDetailApi | null;
  readonly groupId: string;
}

const FORM_ID = 'modifier-group-form';

const emptyValues = (): ModifierGroupForm => ({
  name: {},
  display: 'tiles',
  behaviour: 'several',
  isRequired: false,
});

const valuesFromGroup = (g: ModifierGroupDetailApi): ModifierGroupForm => ({
  name: { ...g.name },
  display: g.display,
  behaviour: g.behaviour,
  isRequired: g.isRequired,
});

const rowFromOption = (option: ModifierOptionApi): GroupModifierRow => ({
  id: option.id,
  name: option.name,
  imageUrl: option.imageUrl,
  priceDelta: option.priceDelta,
});

export function GroupEditorShell({
  title,
  initialGroup,
  groupId,
}: GroupEditorShellProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const [currentGroupId, setCurrentGroupId] = React.useState(groupId);
  const [currentOptions, setCurrentOptions] = React.useState<readonly GroupModifierRow[]>(
    (initialGroup?.options ?? []).map(rowFromOption),
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
            <GroupModifiersPicker
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
