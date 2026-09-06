import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from '@resto/domain';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { SettingsSection } from '@/components/settings/settings-section';
import { LocalizedField } from '@/components/common/localized-field';
import { useContentLocales } from '@/hooks/use-content-locales';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { updateBrand, type LegalDocuments, type TenantResponse } from '@/lib/queries/tenancy';

const EMPTY: LegalDocuments = {
  about: null,
  payment: null,
  returns: null,
  cookies: null,
  terms: null,
  privacy: null,
};

export interface LegalFormProps {
  readonly tenant: TenantResponse;
}

export function LegalForm({ tenant }: LegalFormProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'settings.legal' });
  const { defaultLocale, locales } = useContentLocales();
  const queryClient = useQueryClient();

  const [documents, setDocuments] = React.useState<LegalDocuments>(tenant.legalDocuments ?? EMPTY);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setDocuments(tenant.legalDocuments ?? EMPTY);
    setDirty(false);
  }, [tenant]);

  const mutation = useMutation({
    mutationFn: () => updateBrand({ legalDocuments: documents }),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('saveFailed'));
        return;
      }
      showSuccess(t('saved'));
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['tenancy', 'me'] });
    },
    onError: () => {
      showError(null, t('saveFailed'));
    },
  });

  const write = (key: LegalDocumentKey, next: Record<string, string> | null): void => {
    setDocuments((prev) => ({ ...prev, [key]: next }));
    setDirty(true);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <SettingsSection title={t('title')} description={t('description')}>
        <FieldGroup>
          {LEGAL_DOCUMENTS.map((key) => (
            <LocalizedField
              key={key}
              nullable
              multiline
              rows={6}
              id={`legal-${key}`}
              label={t(`doc.${key}`)}
              description={t(`hint.${key}`)}
              value={documents[key]}
              onChange={(next) => {
                write(key, next);
              }}
              locales={locales}
              defaultLocale={defaultLocale}
              maxLength={20000}
            />
          ))}
        </FieldGroup>
      </SettingsSection>

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !dirty}>
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </div>
    </form>
  );
}
