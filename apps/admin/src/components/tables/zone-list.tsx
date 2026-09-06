import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Armchair, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeadCell,
  DataTableHeaderRow,
  DataTableRow,
} from '@/components/common/data-table';
import { RowActions } from '@/components/common/row-actions';
import type { TableZoneView } from '@/lib/queries/table-zones';

export interface ZoneListProps {
  readonly zones: readonly TableZoneView[];
  readonly locationSlug: string;
}

export function ZoneList({ zones, locationSlug }: ZoneListProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const navigate = useNavigate();

  return (
    <DataTable>
      <DataTableHeaderRow>
        <DataTableHeadCell>{t('zoneNameLabel')}</DataTableHeadCell>
        <DataTableHeadCell className="w-24">{t('tableCountAria')}</DataTableHeadCell>
        <DataTableHeadCell className="w-32">{t('zoneStatusHeader')}</DataTableHeadCell>
        <DataTableHeadCell className="w-16 text-right">
          <span className="sr-only">{t('tableActionsHeader')}</span>
        </DataTableHeadCell>
      </DataTableHeaderRow>
      <DataTableBody>
        {zones.map((zone) => {
          const activeTables = zone.tables.filter((table) => table.status === 'active').length;
          const openZone = (): void => {
            void navigate({
              to: '/locations/$slug/tables/$zoneId',
              params: { slug: locationSlug, zoneId: zone.id },
            });
          };
          return (
            <DataTableRow key={zone.id} data-testid={`zone-row-${zone.id}`}>
              <DataTableCell className="font-medium">
                <button type="button" className="hover:underline" onClick={openZone}>
                  {zone.name}
                </button>
              </DataTableCell>
              <DataTableCell>
                <Badge variant="secondary" className="gap-1 tabular-nums">
                  <Armchair className="size-3.5" />
                  {activeTables}
                </Badge>
              </DataTableCell>
              <DataTableCell className="text-muted-foreground">
                {zone.status === 'archived' ? t('statusArchived') : t('statusActive')}
              </DataTableCell>
              <DataTableCell className="text-right">
                <RowActions
                  label={t('rowActionsAriaLabel', { name: zone.name })}
                  actions={[
                    {
                      key: 'edit',
                      label: t('editZoneAction'),
                      icon: Pencil,
                      onSelect: openZone,
                    },
                  ]}
                />
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
