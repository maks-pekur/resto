import { useTranslation } from 'react-i18next';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { SettingsSection } from '@/components/settings/settings-section';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from '@/components/common/data-table';
import { tenantDomainsQuery } from '@/lib/queries/tenancy';

export function DomainsSection() {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'settings.domains' });
  const { data } = useSuspenseQuery(tenantDomainsQuery());
  const domains = data.data ?? [];

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {domains.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <DataTable>
          <DataTableHead
            columns={[
              { label: t('columnDomain') },
              { label: t('columnKind') },
              { label: t('columnStatus') },
            ]}
          />
          <DataTableBody>
            {domains.map((domain) => (
              <DataTableRow key={domain.id}>
                <DataTableCell className="font-mono">
                  <span className="flex items-center gap-2">
                    {domain.domain}
                    {domain.isPrimary ? <Badge variant="secondary">{t('primary')}</Badge> : null}
                  </span>
                </DataTableCell>
                <DataTableCell className="text-muted-foreground">{domain.kind}</DataTableCell>
                <DataTableCell>
                  {domain.verifiedAt === null ? (
                    <Badge variant="outline">{t('pending')}</Badge>
                  ) : (
                    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                      new Date(domain.verifiedAt),
                    )
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </SettingsSection>
  );
}
