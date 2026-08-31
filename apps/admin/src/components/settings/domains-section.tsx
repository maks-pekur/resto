import { useTranslation } from 'react-i18next';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
